import { actionByNameJa } from "../data/index.js";
import { kitFor } from "../data/level.js";
const MODES = new Set(["N", "H", "E", "T", "P"]);
/**
 * ラベルを頭文字（N/H/E/T/P）と名前に分ける。"Nファイガ" → { mode: "N", name: "ファイガ" }。
 * 頭文字の無いもの（"デスペア"、アビリティ名など）は mode が ""
 */
export function splitLabel(label) {
    const head = label.charAt(0);
    if (label.length > 1 && MODES.has(head) && actionByNameJa(label.slice(1)))
        return { mode: head, name: label.slice(1) };
    return { mode: "", name: label };
}
/** "Nファイガ" → { mode: "N", action: ファイガ }（action はそのレベルの数値）。空文字や不明なラベルは null */
export function parseCast(label, kit = kitFor()) {
    const { mode, name } = splitLabel(label);
    const action = kit.byName(name);
    return action ? { mode, action } : null;
}
export function castLabel(mode, action) {
    return mode + action.nameJa;
}
