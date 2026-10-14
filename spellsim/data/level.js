// レベルごとの違い（今のパッチの黒魔をレベル同期した場合）。対応するのは 100 と 90 だけ。
// 公式ジョブガイドと作者確認の数値：
//   レベル90：フレアスター・ハイサンダー・ハイサンダラ・魔紋再設置なし、アストラルソウルなし、
//   デスペアは詠唱 2 秒、迅速魔のリキャスト 60 秒、アドルの効果 10 秒、ポリグロットの最大 2
import { actions } from "./index.js";
export const LEVELS = [100, 90];
export const DEFAULT_LEVEL = 100;
/** そのレベル未満で値が変わるもの（特性で変わる数値） */
const BELOW = [
    // エンハンスドアストラルファイア（Lv100）：デスペアが詠唱なしになる
    { below: 100, id: "despair", patch: { castTime: 2 } },
    // エンハンスド迅速魔（Lv94）
    { below: 94, id: "swiftcast", patch: { recastTime: 60 } },
    // エンハンスドアドル（Lv98）
    { below: 98, id: "addle", patch: { effectDuration: 10 } },
];
function makeKit(level) {
    const list = actions.map((a) => {
        const patches = BELOW.filter((b) => b.id === a.id && level < b.below).map((b) => b.patch);
        return patches.length ? Object.assign({}, a, ...patches) : a;
    });
    const byId = new Map(list.map((a) => [a.id, a]));
    const byName = new Map(list.map((a) => [a.nameJa, a]));
    return {
        level,
        byId: (id) => byId.get(id),
        byName: (name) => byName.get(name),
        abilities: list.filter((a) => a.kind !== "spell"),
        learned: (a) => (a.level ?? 0) <= level,
        polyglotMax: level >= 98 ? 3 : 2,
        astralSoul: level >= 100,
    };
}
const KITS = new Map(LEVELS.map((l) => [l, makeKit(l)]));
export const kitFor = (level = DEFAULT_LEVEL) => KITS.get(level);
