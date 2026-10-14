// 選択肢と頭文字：その時点の状態で「撃てる・使える」ものと、魔法をどう撃つか（N/H/E/T/P）を決める。
// アクションは魔法の名前で返し、頭文字は別に持つ（入力は名前だけで、頭文字は状態から決まる）。
import { abilities } from "../data/index.js";
import { kitFor } from "../data/level.js";
import { splitLabel } from "./label.js";
import { isReady, mpCost } from "./rules.js";
const NET = ["N", "E", "T"];
const afford = (_s, ok) => ok;
const ubOn = (s) => s.ub > 0;
const thunderhead = (s) => s.pt === 1;
const each = (id, c) => NET.map((mode) => ({ id, mode, ...c }));
const C = [
    // ファイガ：ファイガ効果アップ（プロック）があると、次のファイガは自動で詠唱 0・MP 0 になるので P 版だけ。
    // UB3 では詠唱が半減するので N は撃てない（自動で H になる）。公式のジョブガイドの説明より
    { id: "fire3", mode: "N", need: (s, ok) => ok && s.pf === 0 && s.ub !== 3 },
    { id: "fire3", mode: "H", need: (s) => s.pf === 0 && s.ub === 3 },
    { id: "fire3", mode: "P", need: (s) => s.pf > 0 },
    { id: "fire3", mode: "E", need: (s, ok) => ok && s.pf === 0 },
    { id: "fire3", mode: "T", need: (s, ok) => ok && s.pf === 0 },
    ...each("fire4", { need: (s, ok) => s.af > 0 && ok }),
    // デスペア：レベル100 は詠唱なし、レベル90 は詠唱 2 秒（N/E/T）
    { id: "despair", mode: "", need: (s) => s.af > 0 && s.mp >= 800, levels: [100] },
    ...each("despair", { need: (s) => s.af > 0 && s.mp >= 800, levels: [90] }),
    ...each("flareStar", { need: (s) => s.af > 0 && s.as === 6 }),
    // UB3 のハイファイラ、AF3 のブリザガ・ハイブリザラも同じく N は撃てない（H になる）
    { id: "highFire2", mode: "N", need: (s, ok) => ok && s.ub !== 3 },
    { id: "highFire2", mode: "H", need: (s) => s.ub === 3 },
    { id: "highFire2", mode: "E", need: afford },
    { id: "highFire2", mode: "T", need: afford },
    ...each("flare", { need: (s) => s.af > 0 && s.mp >= 800 }),
    { id: "blizzard3", mode: "N", need: (s, ok) => ok && s.af !== 3 },
    { id: "blizzard3", mode: "H", need: (s) => s.af === 3 },
    { id: "blizzard3", mode: "E", need: afford },
    { id: "blizzard3", mode: "T", need: afford },
    ...each("blizzard4", { need: ubOn }),
    { id: "highBlizzard2", mode: "N", need: (s, ok) => ok && s.af !== 3 },
    { id: "highBlizzard2", mode: "H", need: (s) => s.af === 3 },
    { id: "highBlizzard2", mode: "E", need: afford },
    { id: "highBlizzard2", mode: "T", need: afford },
    ...each("freeze", { need: ubOn }),
    { id: "paradox", mode: "", need: (s, ok) => s.pa === 1 && ok },
    // サンダー系：レベル90 はサンダガ・サンダジャ、レベル92 からハイサンダー・ハイサンダラ
    { id: "thunder3", mode: "", need: thunderhead, levels: [90] },
    { id: "thunder4", mode: "", need: thunderhead, levels: [90] },
    { id: "highThunder", mode: "", need: thunderhead },
    { id: "highThunder2", mode: "", need: thunderhead },
    { id: "xenoglossy", mode: "", need: (s) => s.pg > 0 },
    { id: "foul", mode: "", need: (s) => s.pg > 0 },
    { id: "scathe", mode: "", need: afford },
    { id: "umbralSoul", mode: "", need: ubOn },
    // 普段は使わない魔法（設定で表示）。レベル 90・100 で使えるものだけ。
    // ファイラ・ブリザラ（Lv82 で上位版に置き換わる）、サンダー（→サンダガ→ハイサンダー）、サンダジャ（Lv92 でハイサンダラに置き換わる）は出さない（2026-10-15）
    // パラドックスが使えるあいだは、AF 中のファイア・UB 中のブリザドはパラドックスに置き換わって撃てない（2026-10-15）
    ...each("fire", { need: (s, ok) => ok && !(s.pa > 0 && s.af > 0), extra: true }),
    ...each("blizzard", { need: (s, ok) => ok && !(s.pa > 0 && s.ub > 0), extra: true }),
    ...each("sleep", { need: afford, extra: true }),
];
/** 迅速魔中は E、三連魔中は T、どちらもなければ N/H だけ。頭文字なし・P はいつでも */
function modeAllowed(mode, s) {
    const swift = s.cd.swiftcast.effect > 0;
    const triple = s.cd.triplecast.effect > 0;
    if (mode === "E")
        return swift;
    if (mode === "T")
        return !swift && triple;
    if (mode === "N" || mode === "H")
        return !swift && !triple;
    return true;
}
/** そのレベルで出す候補 */
const candidatesAt = (kit, showExtraSpells) => C.filter((c) => (showExtraSpells || !c.extra) && (!c.levels || c.levels.includes(kit.level)) && kit.learned(kit.byId(c.id)));
/** そのレベルで出す魔法の ID（候補の並び順、重なりなし） */
const idsAt = (kit, showExtraSpells) => [...new Set(candidatesAt(kit, showExtraSpells).map((c) => c.id))];
/** すべての魔法の名前（制約なしモード用。頭文字なし） */
export function allActionNames(showExtraSpells = false, kit = kitFor()) {
    return idsAt(kit, showExtraSpells).map((id) => kit.byId(id).nameJa);
}
/**
 * どう撃つか（頭文字）を状態から決める。name は魔法の名前（頭文字があっても無視する）、s は撃つ直前の状態。
 *   迅速魔の効果中 → E、三連魔の効果中 → T（迅速魔が先）、ファイガ効果アップのファイガ → P（迅速魔・三連魔は使わない）、
 *   UB3 の炎（ファイガ・ハイファイラ）・AF3 の氷（ブリザガ・ハイブリザラ）→ H、それ以外 → N。頭文字の無い魔法は ""。
 * 候補の表（C）のうち、今の状態で使える頭文字のものを選ぶ。どれも撃てないとき（MP 不足など）は、MP が足りれば
 * 撃てる頭文字を返し ok=false。魔法でない名前・そのレベルに無い魔法は null。
 */
export function resolveCast(name, s, kit = kitFor(), showExtraSpells = true) {
    const action = kit.byName(splitLabel(name).name);
    if (!action)
        return null;
    const all = C.filter((c) => c.id === action.id && (!c.levels || c.levels.includes(kit.level)));
    if (all.length === 0 || !kit.learned(action))
        return null;
    const shown = all.filter((c) => showExtraSpells || !c.extra);
    const allowed = all.filter((c) => modeAllowed(c.mode, s));
    const castOf = (c) => ({ mode: c.mode, action });
    const ready = shown.filter((c) => modeAllowed(c.mode, s)).find((c) => c.need(s, s.mp >= mpCost(s, castOf(c))));
    if (ready)
        return { cast: castOf(ready), ok: true };
    const fallback = allowed.find((c) => c.need(s, true)) ?? allowed[0] ?? all[0];
    return { cast: castOf(fallback), ok: false };
}
/** この手で選べる魔法（s は前の手の状態）。label は名前、mode はそのとき撃つ頭文字 */
export function actionOptions(s, showExtraSpells = false, kit = kitFor()) {
    const out = [];
    for (const id of idsAt(kit, showExtraSpells)) {
        const r = resolveCast(kit.byId(id).nameJa, s, kit, showExtraSpells);
        if (!r?.ok)
            continue;
        out.push({ label: r.cast.action.nameJa, mode: r.cast.mode });
    }
    return out;
}
/** アビリティを使うのに必要な状態（リキャスト以外） */
const ABILITY_NEED = {
    transpose: (s) => s.af > 0 || s.ub > 0,
    amplifier: (s) => s.af > 0 || s.ub > 0,
    manafont: (s) => s.af > 0,
    retrace: (s) => s.cd.leyLines.effect > 0,
    betweenTheLines: (s) => s.cd.leyLines.effect > 0,
};
/** 画面での並び順 */
export const ABILITY_ORDER = [
    "transpose",
    "swiftcast",
    "triplecast",
    "manafont",
    "amplifier",
    "manaward",
    "leyLines",
    "retrace",
    "aetherialManipulation",
    "betweenTheLines",
    "lucidDreaming",
    "addle",
    "surecast",
    "sprint",
    "tincture",
];
const ORDERED_ABILITIES = ABILITY_ORDER.map((id) => abilities.find((a) => a.id === id));
/**
 * アビリティの選択肢。s はそのアビリティを使う直前の状態（アビリティ1ならアクションの後、2ならアビリティ1の後）。
 * secondWeave=false の手（詠唱半減 H、または黒魔紋で GCD が 2 秒以下）はアビリティを1回しか挟めない。
 * 2回挟むと GCD が遅れる＝回しとしてのミスなので、シミュレーターでは選べないようにする。
 */
export function abilityOptions(s, slot, secondWeave, kit = kitFor()) {
    if (s.time === null)
        return [];
    if (slot === 2 && !secondWeave)
        return [];
    return ORDERED_ABILITIES.filter((a) => kit.learned(a) && isReady(s, a) && (ABILITY_NEED[a.id]?.(s) ?? true)).map((a) => a.nameJa);
}
/** すべてのアビリティの名前（画面での並び順。そのレベルで覚えているもの） */
export function allAbilityLabels(kit = kitFor()) {
    return ORDERED_ABILITIES.filter((a) => kit.learned(a)).map((a) => a.nameJa);
}
