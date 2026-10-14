// 選択欄：アイコン付きの自前のプルダウン（標準の select では一覧に画像を出せないため）。
// 一覧は ↑↓ で選び Enter で決定、Esc で閉じる。外を押す・スクロール・画面サイズの変更でも閉じる。
import { castTime, parseCast } from "../sim/index.js";
import { h } from "./dom.js";
import { iconBox, markFor, modeOf, shownName } from "./labels.js";
import { recastBadge } from "./recast-view.js";
import { gcdCs, kit } from "./state.js";
/**
 * 選択欄を作る。invalid は、入っている値が今の選択肢に無い（この時点では使えない）こと。
 * shownValue は今の値の見せ方（アクションは計算が決めた頭文字付き）。無ければ value
 */
export function picker(value, choices, onChange, kind, shownValue = value) {
    const found = value === "" || choices.some((c) => c.label === value && !c.down);
    const shown = shownValue || value;
    const cls = ["pick", kind, value ? "" : "empty", found ? "" : "bad", modeOf(shown) === "H" ? "m-h" : ""];
    const btn = h("button", {
        type: "button",
        class: cls.filter(Boolean).join(" "),
        "aria-haspopup": "listbox",
        "aria-label": `${kind === "action" ? "アクション" : "アビリティ"}：${value || "なし"}`,
        title: !found ? `${value}（この時点では使えません）` : value || undefined,
    }, iconBox(shown, !found), h("span", { class: "name" }, value ? `${found ? "" : "⚠ "}${shownName(shown)}` : "—"), markFor(shown), h("span", { class: "caret", "aria-hidden": "true" }));
    const open = () => openMenu(btn, choices, value, shown, found, onChange);
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            open();
        }
    });
    return { el: h("div", { class: `pickwrap${found ? "" : " bad"}` }, btn), invalid: !found };
}
function optionEl(c, selected) {
    const look = c.shown ?? c.label;
    const cls = ["opt", selected ? "sel" : "", c.invalid ? "invalid" : "", c.down ? "down" : "", modeOf(look) === "H" ? "m-h" : ""];
    const icon = iconBox(look, !!c.invalid);
    if (c.recast)
        icon.append(...recastBadge(c.recast));
    return h("div", {
        class: cls.filter(Boolean).join(" "),
        role: "option",
        "aria-selected": selected ? "true" : "false",
        "aria-disabled": c.down ? "true" : undefined,
        title: c.recast ? `あと ${Math.ceil(c.recast.left / 100)} 秒${c.down ? "（リキャスト中）" : ""}` : undefined,
    }, icon, h("span", { class: "name" }, c.label ? `${c.invalid ? "⚠ " : ""}${shownName(look)}` : "なし"), markFor(look), c.invalid ? h("span", { class: "tag bad" }, "使えない") : null);
}
/** N・H の魔法は、詠唱時間をかけて背景が左から右へ埋まり（H は水色、N はピンク）、消えてまた埋まる */
const FADE_MS = 500;
function animateCastTime(opt, label) {
    const cast = /^[NH]./.test(label) ? parseCast(label, kit()) : null;
    if (!cast || (cast.mode !== "N" && cast.mode !== "H"))
        return;
    const ms = castTime(cast, gcdCs()) * 10;
    if (!ms || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        return;
    const bar = h("span", { class: `castfill${cast.mode === "H" ? " h" : ""}`, "aria-hidden": "true" });
    opt.prepend(bar);
    opt.title = `詠唱 ${(ms / 1000).toFixed(2)} 秒`;
    bar.animate([
        { transform: "scaleX(0)", opacity: 1, offset: 0 },
        { transform: "scaleX(1)", opacity: 1, offset: ms / (ms + FADE_MS) },
        { transform: "scaleX(1)", opacity: 0, offset: 1 },
    ], { duration: ms + FADE_MS, iterations: Infinity, easing: "linear" });
}
let menuOwner = null;
function openMenu(btn, choices, value, shown, found, onPick) {
    closeMenu();
    // 選べるもの → 今の値が使えないとき（⚠）→ リキャスト中で選べないもの、の順
    const items = [{ label: "" }, ...choices.filter((c) => !c.down)];
    if (!found)
        items.push({ label: value, shown, invalid: true });
    items.push(...choices.filter((c) => c.down));
    const skip = (k) => !!items[k].down;
    const opts = items.map((c) => optionEl(c, c.label === value));
    items.forEach((c, k) => animateCastTime(opts[k], c.shown ?? c.label));
    let active = Math.max(0, items.findIndex((c) => c.label === value && !c.down));
    const setActive = (k) => {
        opts[active]?.classList.remove("active");
        active = k;
        opts[k]?.classList.add("active");
    };
    const pick = (k) => {
        const c = items[k];
        closeMenu();
        if (c.down)
            return;
        if (!c.invalid && c.label !== value)
            onPick(c.label);
        else
            btn.focus();
    };
    opts.forEach((o, k) => {
        if (skip(k))
            return;
        o.addEventListener("pointerenter", () => setActive(k));
        o.addEventListener("click", () => pick(k));
    });
    // リキャスト中のものの前に見出し
    const firstDown = items.findIndex((c) => c.down);
    const rows = [...opts];
    if (firstDown >= 0)
        rows.splice(firstDown, 0, h("div", { class: "optsep", role: "presentation" }, "リキャスト中"));
    const menu = h("div", { id: "pickmenu", class: "pickmenu", role: "listbox", tabindex: "-1" }, ...rows);
    menu.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k === "ArrowDown" || k === "ArrowUp") {
            e.preventDefault();
            // リキャスト中（選べない）ものは飛ばす
            const step = k === "ArrowDown" ? 1 : -1;
            let next = active;
            do
                next = (next + step + items.length) % items.length;
            while (skip(next) && next !== active);
            setActive(next);
            opts[active].scrollIntoView({ block: "nearest" });
        }
        else if (k === "Enter" || k === " ") {
            e.preventDefault();
            pick(active);
        }
        else if (k === "Escape" || k === "Tab") {
            e.preventDefault();
            closeMenu();
            btn.focus();
        }
    });
    document.body.append(menu);
    btn.classList.add("open");
    menuOwner = btn;
    placeMenu(menu, btn);
    setActive(active);
    opts[active].scrollIntoView({ block: "nearest" });
    menu.focus();
}
/** ボタンの下（入らなければ上）に、ボタンのアイコンの分だけ右へずらして出す */
function placeMenu(menu, btn) {
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = `${Math.max(r.width, 176)}px`;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const height = menu.offsetHeight;
    const up = height > below && above > below;
    menu.style.maxHeight = `${Math.max(160, (up ? above : below) - 4)}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left + 24, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = up ? `${Math.max(8, r.top - Math.min(height, above) - 4)}px` : `${r.bottom + 4}px`;
}
function closeMenu() {
    document.getElementById("pickmenu")?.remove();
    menuOwner?.classList.remove("open");
    menuOwner = null;
}
document.addEventListener("pointerdown", (e) => {
    const t = e.target;
    const menu = document.getElementById("pickmenu");
    if (menu && !menu.contains(t) && !menuOwner?.contains(t))
        closeMenu();
});
window.addEventListener("resize", closeMenu);
document.addEventListener("scroll", (e) => {
    const menu = document.getElementById("pickmenu");
    if (menu && !menu.contains(e.target))
        closeMenu();
}, true);
