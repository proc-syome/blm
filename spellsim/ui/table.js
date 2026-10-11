// スキル回しの表：1手1行。左から #・タイムライン・動ける帯・時間・DoT・アクション・アビリティ×2・状態の列。
import { allAbilityLabels, allActionLabels, castTime, isWait, parseCast } from "../sim/index.js";
import { DETAIL_COLUMNS, detailCells, gaugeCell, mpCell, pips, procsCell } from "./cells.js";
import { h, svg } from "./dom.js";
import { centis, mmss, sec } from "./format.js";
import { shownName } from "./labels.js";
import { picker } from "./picker.js";
import { app, emptyRow, gcdCs, kit, update, waitRow } from "./state.js";
import { timelineCells, timelineHead } from "./timeline-view.js";
function headRow() {
    const th = (t) => h("th", {}, t);
    return h("tr", {}, th("#"), timelineHead(), h("th", { class: "mvh", title: "動ける手（詠唱なし）" }), th("時間"), th("DoT"), th("アクション"), h("th", { colspan: "2" }, "アビリティ"), th("MP"), th("ゲージ / エレメンタル"), th("ポリグロット"), th("プロック"), ...(app.settings.details ? DETAIL_COLUMNS.map(([, name]) => h("th", { class: "cd" }, name)) : []), h("th", {}, ""));
}
/** 詠唱の無い手（動ける手）の縦の帯。続く手どうしはつなげる */
function movableCells() {
    const gcd = gcdCs();
    const k = kit();
    const movable = app.rows.map((row) => {
        if (isWait(row))
            return true;
        const cast = parseCast(row.action, k);
        return !!cast && castTime(cast, gcd) === 0;
    });
    return movable.map((on, i) => {
        const cls = ["mv", on ? "on" : "", on && !movable[i - 1] ? "start" : "", on && !movable[i + 1] ? "end" : ""];
        return h("td", { class: cls.filter(Boolean).join(" "), title: on ? "詠唱なし（動ける）" : undefined }, on ? h("span", { class: "mvbar" }) : null);
    });
}
/**
 * DoT の列：敵ごとに残り時間（30 秒を満タン）をバーで見せる。切れたら枠を点滅。
 * 「2体目の敵を表示」のときは、単体の DoT の手で押して狙う敵を選ぶ（範囲の DoT は自動で両方）。
 * seen：この手より前に、その敵へ DoT が付いたことがあるか
 */
function dotCell(i, r, seen) {
    const { state: s, input } = r;
    const two = app.settings.targets;
    const a = kit().byName(shownName(input.action));
    const hasDot = !!a?.dot;
    const aoe = hasDot && !!a?.aoe;
    const picked = input.target2 && !input.target1 ? 2 : 1;
    const chip = (n) => {
        const left = s.dot[n - 1];
        const on = hasDot && (aoe || picked === n);
        const expired = left === 0 && seen[n - 1] && s.time !== null;
        const state = left > 0 ? `残り ${sec(left)} 秒` : expired ? "切れています" : "なし";
        return h("button", {
            class: `dotchip${two && on ? " on" : ""}${expired ? " expired" : ""}`,
            style: `--p:${Math.min(1, left / 3000)}`,
            title: `敵${n}：DoT ${state}${hasDot && !aoe && two ? "（押すとこの敵を狙う）" : ""}`,
            disabled: !hasDot || aoe || !two,
            onclick: () => update(() => {
                const { target1: _a, target2: _b, ...rest } = app.rows[i];
                app.rows[i] = n === 2 ? { ...rest, target2: true } : rest;
            }),
        }, h("span", { class: "fill" }), h("span", { class: "n" }, two ? String(n) : ""));
    };
    return h("td", { class: "tgts" }, h("div", { class: "tgtbox" }, chip(1), two ? chip(2) : null));
}
const asChoices = (labels) => labels.map((label) => ({ label }));
/** イベント行のアクションの欄：待ち時間（秒）の入力と、終わる時刻 */
function waitCell(i, r) {
    const sec = r.input.wait ?? 0;
    const end = r.state.time === null ? null : r.state.time + Math.round(sec * 100);
    return h("div", { class: "waitbox", title: "この間は攻撃しない（ボスがいない時間など）。時間だけ進む" }, h("span", { class: "wlabel" }, "待ち"), h("input", {
        type: "number",
        value: sec.toFixed(2),
        step: "0.01",
        min: "0",
        max: "600",
        "aria-label": "待ち時間（秒）",
        onchange: (e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v))
                return;
            update(() => (app.rows[i] = { ...app.rows[i], wait: Math.min(600, Math.max(0, Math.round(v * 100) / 100)) }));
        },
    }), h("span", { class: "wunit" }, "秒"), end !== null ? h("span", { class: "wend" }, `→ ${mmss(end)}`, h("small", {}, centis(end))) : null);
}
/** 時計のアイコン（イベント行を足すボタン） */
const clockIcon = () => svg("svg", { viewBox: "0 0 16 16", class: "clock", "aria-hidden": "true" }, svg("circle", { cx: 8, cy: 8, r: 5.6 }), svg("path", { d: "M8 4.8V8l2.2 1.4" }));
function rowEl(i, r, seen, tl, mv) {
    const s = r.state;
    const input = app.rows[i];
    const { free, nDelay, showExtraSpells } = app.settings;
    const set = (patch) => update(() => (app.rows[i] = { ...app.rows[i], ...patch }));
    const k = kit();
    const wait = isWait(input);
    const act = picker(input.action, free ? asChoices(allActionLabels(showExtraSpells, k)) : r.options.action, (v) => set({ action: v }), "action");
    const ab2Choices = asChoices(free ? allAbilityLabels(k) : r.options.ability2);
    const ab1 = picker(input.ability1, asChoices(free ? allAbilityLabels(k) : r.options.ability1), (v) => set({ ability1: v }), "ability");
    const ab2 = picker(input.ability2, ab2Choices, (v) => set({ ability2: v }), "ability");
    const invalid = !free && ((!wait && act.invalid) || ab1.invalid || ab2.invalid);
    // N の魔法の後はアビリティを使わない設定なら、選択欄ごと出さない（何か入っているときは消せるよう出す）
    const noWeave = !free && !nDelay && /^N./.test(input.action) && !input.ability1 && !input.ability2;
    // 2つ目は、1つ目が入っていて2つ目を挟めるとき（か、すでに入っているとき）だけ出す
    const show2 = input.ability2 !== "" || (input.ability1 !== "" && ab2Choices.length > 0);
    return h("tr", {
        class: [invalid ? "invalid" : "", wait ? "wait" : ""].filter(Boolean).join(" "),
        "data-row": String(i),
        title: invalid ? "この時点では使えないものが入っています" : undefined,
    }, h("td", { class: "no" }, String(i + 1)), tl, mv, h("td", { class: "time" }, mmss(s.time), s.time !== null ? h("small", {}, centis(s.time)) : null), dotCell(i, r, seen), h("td", { class: "act" }, wait ? waitCell(i, r) : act.el), h("td", { class: "ab1" }, noWeave ? null : ab1.el), h("td", { class: "ab2" }, noWeave || !show2 ? null : ab2.el), h("td", { class: "mpc" }, mpCell(s.mp)), h("td", { class: "gaugec" }, gaugeCell(s)), 
    // ポリグロットはレベルの最大の数だけ（レベル90 は 2）
    h("td", { class: "pgc" }, pips(s.pg, k.polyglotMax, "pg")), h("td", { class: "procc" }, procsCell(s)), ...(app.settings.details ? detailCells(s) : []), h("td", { class: "ops" }, h("button", { title: "この下に1手追加", onclick: () => update(() => app.rows.splice(i + 1, 0, emptyRow())) }, "＋"), h("button", { class: "addwait", title: "この下に待ち時間（イベント行）を追加", onclick: () => update(() => app.rows.splice(i + 1, 0, waitRow())) }, clockIcon()), h("button", { title: "この手を削除", onclick: () => update(() => app.rows.splice(i, 1)) }, "×")));
}
/** 表全体。invalidCount は使えないものが入っている手の数 */
export function rotationTable(results) {
    const tl = timelineCells(results);
    const mv = movableCells();
    const seen = [false, false];
    const body = h("tbody", {}, ...results.map((r, i) => {
        const el = rowEl(i, r, [seen[0], seen[1]], tl[i], mv[i]);
        if (r.state.dot[0] > 0)
            seen[0] = true;
        if (r.state.dot[1] > 0)
            seen[1] = true;
        return el;
    }));
    const invalidCount = body.querySelectorAll("tr.invalid").length;
    return { el: h("div", { class: "tablewrap" }, h("table", { class: "rot" }, h("thead", {}, headRow()), body)), invalidCount };
}
