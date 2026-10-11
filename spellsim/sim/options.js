// 選択肢：その時点の状態で「撃てる・使える」ものを、画面に出すラベルで返す。
import { abilities } from "../data/index.js";
import { kitFor } from "../data/level.js";
import { castLabel } from "./label.js";
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
    // 普段は使わない魔法（設定で表示）
    ...each("fire", { need: afford, extra: true }),
    ...each("fire2", { need: afford, extra: true }),
    ...each("blizzard", { need: afford, extra: true }),
    ...each("blizzard2", { need: afford, extra: true }),
    { id: "thunder", mode: "", need: thunderhead, extra: true },
    { id: "thunder4", mode: "", need: thunderhead, extra: true, levels: [100] },
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
/** すべてのアクションのラベル（制約なしモード用） */
export function allActionLabels(showExtraSpells = false, kit = kitFor()) {
    return candidatesAt(kit, showExtraSpells).map((c) => castLabel(c.mode, kit.byId(c.id)));
}
/** この手で選べるアクション（s は前の手の状態） */
export function actionOptions(s, showExtraSpells = false, kit = kitFor()) {
    const out = [];
    for (const c of candidatesAt(kit, showExtraSpells)) {
        if (!modeAllowed(c.mode, s))
            continue;
        const action = kit.byId(c.id);
        const cast = { mode: c.mode, action };
        if (!c.need(s, s.mp >= mpCost(s, cast)))
            continue;
        const discouraged = c.discouraged?.(s) ?? false;
        out.push(discouraged ? { label: castLabel(c.mode, action), discouraged } : { label: castLabel(c.mode, action) });
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
