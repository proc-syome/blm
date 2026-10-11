// アクション・アビリティの見せ方：アイコン、頭文字（N/H/E/T/P）を外した名前、右端の印。
//   N：印なし / H：水色の背景 / E：玉1つ（迅速魔） / T：玉3つ（三連魔）
//   P とプロックで撃つハイサンダー・ハイサンダラ：将棋の駒の形
import { actionByNameJa, iconUrl } from "../data/index.js";
import { splitLabel } from "../sim/index.js";
import { h, svg } from "./dom.js";
export const modeOf = (label) => splitLabel(label).mode;
/** 頭文字を外した名前 */
export const shownName = (label) => splitLabel(label).name;
/** サンダーのプロックで撃つ魔法 */
const THUNDER_PROC_SPELLS = new Set(["ハイサンダー", "ハイサンダラ", "サンダガ", "サンダジャ", "サンダー", "サンダラ"]);
/** 右端の印（SVG）。E・T・P（プロックは fire が淡い黄色、thunder が水色） */
export function modeMark(mode, proc = "fire") {
    const shapes = mode === "P"
        ? [svg("path", { d: "M8 1.8 13 4.8V14.2H3V4.8Z" })] // 正方形の上に低い三角形
        : mode === "E"
            ? [svg("circle", { cx: 8, cy: 8, r: 4.2 })]
            : [
                [8, 4],
                [4, 11.5],
                [12, 11.5],
            ].map(([cx, cy]) => svg("circle", { cx: cx, cy: cy, r: 2.6 }));
    const title = mode === "E" ? "迅速魔" : mode === "T" ? "三連魔" : proc === "fire" ? "ファイガのプロック" : "サンダーのプロック";
    const cls = `modemark mm-${mode}${mode === "P" ? ` pr-${proc}` : ""}`;
    return svg("svg", { viewBox: "0 0 16 16", class: cls, "aria-hidden": "true" }, ...shapes, svg("title", {}, title));
}
/** ラベルに付ける印（無ければ null） */
export function markFor(label) {
    const m = modeOf(label);
    if (m === "E" || m === "T" || m === "P")
        return modeMark(m);
    return THUNDER_PROC_SPELLS.has(label) ? modeMark("P", "thunder") : null;
}
/** 公式サイトのアイコン画像。無いもの・読み込めないものは null / 消える */
function icon(label) {
    const a = actionByNameJa(shownName(label));
    const url = a ? iconUrl(a) : undefined;
    if (!url)
        return null;
    const img = h("img", { src: url, alt: "", class: "icon", loading: "lazy", referrerpolicy: "no-referrer", draggable: "false" });
    img.addEventListener("error", () => img.remove());
    return img;
}
/**
 * アイコンの枠。アイコンが無いもの（薬など）や読み込めないときは頭の1文字を枠に入れる（使えないものは ⚠）。
 */
export function iconBox(value, bad) {
    const alt = () => h("span", { class: "alt" }, bad ? "⚠" : shownName(value).slice(0, 1));
    const img = value ? icon(value) : null;
    const box = h("span", { class: "iconbox" }, img ?? (value ? alt() : h("span", { class: "noicon" })));
    img?.addEventListener("error", () => box.replaceChildren(alt()));
    return box;
}
