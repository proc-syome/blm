// 表の上の設定バー。
//   上の段：レベル・元に戻す / やり直す・サンプル・全部消す・URL をコピー
//   下の段「設定」：計算（GCD・MP 自然回復・詠唱の後もアビリティ）・選択肢・表示 の3つのまとまり。
//   開閉でき、既定は開いている（閉じたらこの端末に覚える）
import { cs, LEVELS, underLines, weaveOverruns } from "../sim/index.js";
import { confirmTwice, h, svg, toast } from "./dom.js";
import { app, canRedo, canUndo, filled, loadSample, redo, switchLevel, undo, update } from "./state.js";
import { KEYS, readStore, writeStore } from "./store.js";
import { GCD_MIN } from "./url.js";
/** オン・オフで切り替える設定。計算・選択肢・表示の3つに分けて、並び順どおりに出す */
const GROUPS = [
    { title: "計算", flags: [["mpRegen", "MP自然回復"], ["nDelay", "詠唱の後もアビリティ（遅れを足す）"]] },
    {
        title: "選択肢",
        flags: [["showExtraSpells", "普段使わない魔法も出す"], ["showAoe", "複数の敵向けの魔法も出す"], ["free", "制約なしで並べる"]],
    },
    { title: "表示", flags: [["hideNames", "名前を隠す"], ["targets", "2体目の敵を表示"], ["details", "アビリティの詳細"], ["damage", "ダメージと DPS"], ["dial", "ゲージを図で表示"]] },
];
const set = (k, v) => update(() => (app.settings = { ...app.settings, [k]: v }));
/** オン・オフの丸いボタン（中身はチェックボックス。オンのときは色が付いてチェックの印） */
const tick = () => svg("svg", { viewBox: "0 0 12 12", class: "tick", "aria-hidden": "true" }, svg("path", { d: "M2.6 6.3 5 8.6l4.4-5" }));
function check(k, label) {
    const on = app.settings[k];
    return h("label", 
    // アビリティの詳細はスマホのカード表示では出ないので、スマホではボタンごと出さない（CSS の .pconly）
    { class: `chip${on ? " on" : ""}${k === "details" ? " pconly" : ""}` }, h("input", { type: "checkbox", checked: on, onchange: (e) => set(k, e.target.checked) }), tick(), label);
}
/** 数値の入力欄。範囲外や読めない値は無視 */
function numberField(label, value, attrs, onValue) {
    return h("label", { class: "num" }, label, h("input", { type: "number", value, ...attrs, onchange: (e) => onValue(Number(e.target.value)) }));
}
/**
 * レベルの切り替え（100 / 90）。回しはレベルごとに別物で変換しないので、
 * 回しかタイムラインが入っているときは、もう一度押したら両方を消して切り替える（レベル間で共有しない）
 */
function levelSwitch() {
    const cur = app.settings.level;
    const hasContent = app.rows.some(filled) || app.marks.length > 0;
    return h("div", { class: "level", role: "group", "aria-label": "レベル" }, ...LEVELS.map((lv) => h("button", {
        class: lv === cur ? "on" : undefined,
        "aria-pressed": lv === cur ? "true" : "false",
        title: lv === cur ? `レベル${lv}（今のレベル）` : `レベル${lv} に切り替える（今の回しとタイムラインは消えます）`,
        onclick: () => {
            if (lv === cur)
                return;
            const run = () => update(() => switchLevel(lv));
            if (!hasContent)
                run();
            else
                confirmTwice(`level:${lv}`, `レベル${lv} に切り替えると今の回しとタイムラインは消えます（変換はしません）。もう一度押すと切り替えます`, run);
        },
    }, `Lv${lv}`)));
}
async function copyUrl() {
    try {
        await navigator.clipboard.writeText(location.href);
        toast("URLをコピーしました。このURLを開くと同じ回しが出ます");
    }
    catch {
        toast("コピーできませんでした。アドレスバーのURLを使ってください");
    }
}
/**
 * MP 自然回復の 3 秒周期のずれ。オンの間は 0.5 秒ごとに 0.5 秒ずつ自動で進む（0 → 0.5 → … → 2.5 → 0）。
 * 押すと止まり（そのずれを URL に保存）、もう一度押すとまた進む
 */
function tickShift() {
    const paused = app.phasePaused;
    return h("button", {
        class: `shift${paused ? " paused" : " live"}`,
        title: paused
            ? "ずれを止めています（押すとまた 0.5 秒ごとに進みます）"
            : "MP が回復するタイミング（サーバーの 3 秒周期）のずれ。0.5 秒ごとに進みます（押すと止まります）",
        onclick: () => update(() => {
            app.phasePaused = !paused;
            // 止めたときのずれを保存しておく（URL を開いた人も同じずれで見られる）
            if (app.phasePaused)
                app.settings = { ...app.settings, tickOffset: app.livePhase };
        }),
    }, h("span", { class: "dot", "aria-hidden": "true" }), `ずれ ${app.livePhase.toFixed(1)} 秒`);
}
export function settingsBar() {
    const s = app.settings;
    // GCD は 2.10 から（それより下げられる装備は今のところ無い）。スマホでは min を越えて入力できるので、
    // 小さい値もいったん受け取り、画面のほうで表を隠してエラーを出す（main.ts）
    const gcd = numberField("GCD", s.gcd.toFixed(2), { step: "0.01", min: String(GCD_MIN), max: "2.5" }, (v) => {
        if (v >= 0 && v <= 3)
            set("gcd", Math.round(v * 100) / 100);
    });
    // GCD によっては硬直がはみ出す（次の魔法が遅れる）ことの注意。
    //   2.35 以下：黒魔紋中に即時の魔法の後のアビリティ2つ（詠唱した魔法の後のアビリティは、既定では選べないので注意は出さない）
    const g = cs(s.gcd);
    const over = g >= cs(GCD_MIN) ? weaveOverruns(g) : { linesDouble: 0 };
    const sec = (x) => (x / 100).toFixed(2);
    const note = (text) => h("p", { class: "gcdnote" }, text, h("a", { href: "./hint.html" }, "ヒント"));
    const gcdNotes = [
        over.linesDouble > 0
            ? note(`GCD ${s.gcd.toFixed(2)} だと黒魔紋の効果中は間隔が ${sec(underLines(g))} 秒になり、即時の魔法の後にアビリティを2つ使うと、硬直（0.67 秒 × 3 ＝ 2.01 秒）が収まらず次の魔法が ${sec(over.linesDouble)} 秒遅れます。`)
            : null,
    ];
    const group = (title, ...items) => h("div", { class: "optgroup", role: "group", "aria-label": title }, h("span", { class: "gtitle" }, title), h("div", { class: "chips" }, ...items));
    const [calc, pick, view] = GROUPS.map((g) => g.flags.map(([k, label]) => check(k, label)));
    const [regen, ...calcRest] = calc;
    const options = h("details", {
        class: "opts",
        ontoggle: (e) => writeStore(KEYS.options, e.target.open ? "open" : "closed"),
    }, h("summary", {}, "設定"), h("div", { class: "optlist" }, group(GROUPS[0].title, gcd, h("span", { class: "regen" }, regen, s.mpRegen ? tickShift() : null), ...calcRest, ...gcdNotes), group(GROUPS[1].title, ...pick), group(GROUPS[2].title, ...view)));
    // 既定は開く。閉じたらこの端末では閉じたまま
    options.open = readStore(KEYS.options) !== "closed";
    return h("div", { class: "settings" }, h("div", { class: "actions" }, levelSwitch(), h("span", { class: "history", role: "group", "aria-label": "元に戻す・やり直し" }, h("button", { title: "元に戻す（Ctrl+Z）", "aria-label": "元に戻す", disabled: !canUndo(), onclick: undo }, "↶"), h("button", { title: "やり直す（Ctrl+Y / Ctrl+Shift+Z）", "aria-label": "やり直す", disabled: !canRedo(), onclick: redo }, "↷")), h("span", { class: "spacer" }), h("button", { title: `レベル${s.level} のサンプルの回しを読む`, onclick: () => update(loadSample) }, "サンプル"), h("button", { onclick: () => confirmTwice("clear", "もう一度押すと全部消します", () => update(() => (app.rows = []))) }, "全部消す"), h("button", { class: "primary", onclick: () => copyUrl() }, "URLをコピー")), options);
}
