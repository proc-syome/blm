import { h } from "./dom.js";
import { sec } from "./format.js";
import { modeMark } from "./labels.js";
/** 丸・ひし形を max 個並べ、n 個を点ける */
export function pips(n, max, cls) {
    const el = h("span", { class: `pips ${cls}` });
    for (let i = 0; i < max; i++)
        el.append(h("i", { class: i < n ? "on" : "" }));
    return el;
}
/** 数値つきの横棒（MP・エレメンタル）。pct は 0〜100 */
function meter(cls, pct, text) {
    return h("div", { class: cls }, h("div", { class: "bar" }, h("div", { class: "fill", style: `width:${pct}%` })), h("span", { class: "num" }, text));
}
export const mpCell = (mp) => meter("mp", mp / 100, String(mp));
/** AF/UB・アンブラルハート・アストラルソウル（6 個で光る） */
function gauge(s) {
    const el = h("div", { class: "gauge" });
    if (s.af > 0)
        el.append(pips(s.af, 3, "af"));
    else if (s.ub > 0)
        el.append(pips(s.ub, 3, "ub"));
    else
        el.append(pips(0, 3, "none"));
    el.append(pips(s.uh, 3, "uh"));
    if (s.af > 0 && s.as > 0)
        el.append(h("span", { class: `as${s.as >= 6 ? " full" : ""}`, title: "アストラルソウル" }, `●${s.as}`));
    return el;
}
/** パラドックス：ひし形（上が赤紫、下が青紫）。無いときは薄い枠だけ */
const paradox = (s) => h("i", { class: `paradox${s.pa ? " on" : ""}`, title: s.pa ? "パラドックス" : "パラドックスなし" });
/** エレメンタル（30 秒周期）。AF/UB が無いときは — */
const elementalMeter = (s) => (s.ent === null ? h("div", { class: "ent off" }, "—") : meter("ent", s.ent / 30, sec(s.ent)));
/** ゲージ（上段）と、パラドックス＋エレメンタル（下段）を1つのセルに */
export const gaugeCell = (s) => h("div", { class: "stack2" }, gauge(s), h("div", { class: "elem" }, paradox(s), elementalMeter(s)));
/** プロック：選択肢の印と同じ駒の形（サンダーは水色、ファイガは淡い黄色） */
export const procsCell = (s) => h("div", { class: "procs" }, s.pt ? h("span", { class: "proc", title: "サンダーのプロック" }, modeMark("P", "thunder")) : null, s.pf ? h("span", { class: "proc", title: "ファイガのプロック" }, modeMark("P", "fire")) : null);
/** 詳細列：アビリティのリキャスト（効果中は効果の残りも）。[ID, 見出し] */
export const DETAIL_COLUMNS = [
    ["swiftcast", "迅速魔"],
    ["triplecast", "三連魔"],
    ["leyLines", "黒魔紋"],
    ["manafont", "マナフォント"],
    ["transpose", "トランス"],
    ["amplifier", "アンプリファイア"],
    ["lucidDreaming", "ルーシッド"],
    ["tincture", "薬"],
];
const CHARGED = new Set(["triplecast", "leyLines"]);
export function detailCells(s) {
    return DETAIL_COLUMNS.map(([id]) => {
        const c = s.cd[id];
        const multi = CHARGED.has(id);
        const ready = multi ? c.charges >= 1 : c.recast === 0;
        return h("td", { class: `cd${c.effect > 0 ? " active" : ""}${ready ? " ready" : ""}` }, c.effect > 0 ? h("span", { class: "eff" }, sec(c.effect)) : null, multi ? h("span", { class: "ch" }, `×${c.charges}`) : null, c.recast > 0 ? h("span", { class: "rc" }, sec(c.recast)) : null, id === "triplecast" && s.tripleStacks > 0 ? h("span", { class: "st" }, `残${s.tripleStacks}`) : null);
    });
}
