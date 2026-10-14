import { castTime, isWait } from "./engine.js";
import { resolveCast } from "./options.js";
/** AF/UB による倍率（パッチ 7.x の特性。炎は AF で上がり UB で下がる、氷は AF で下がる。無属性・雷は変わらない） */
export function elementMultiplier(element, s) {
    if (element === "fire") {
        if (s.af > 0)
            return [1, 1.4, 1.6, 1.8][s.af];
        if (s.ub > 0)
            return [1, 0.9, 0.8, 0.7][s.ub];
    }
    if (element === "ice" && s.af > 0)
        return [1, 0.9, 0.8, 0.7][s.af];
    return 1;
}
/**
 * アクションの選択肢の並び：プロックがあるときは、それで撃つもの（サンダー系 → P ファイガ）を一番上に、
 * そのあとは「その時点のダメージ（威力 × AF/UB の倍率）÷（詠唱時間とリキャストの長いほう）」の大きい順。
 * 同じなら元の並びのまま。プロックが無いとき（「制約なしで並べる」で出ているときなど）は、ほかと同じ順。
 * gcd は 1/100 秒。魔法のリキャストは基本 2.5 秒を GCD で換算する
 */
export function sortByDamage(items, s, kit, gcd) {
    const key = (label) => {
        // 頭文字はその時点の状態から決める（items は名前でよい）
        const cast = resolveCast(label, s, kit)?.cast;
        if (!cast)
            return { proc: 2, dmg: 0 };
        const recast = Math.round((cast.action.recastTime * gcd) / 2.5);
        const span = Math.max(castTime(cast, gcd), recast, 1);
        // 7.x のサンダー系はサンダーのプロック（サンダーヘッド）で撃つ。ファイガはファイガ効果アップがあるときの P 版
        const proc = cast.action.element === "thunder" && s.pt > 0 ? 0 : cast.mode === "P" && s.pf > 0 ? 1 : 2;
        return { proc, dmg: ((cast.action.potency ?? 0) * elementMultiplier(cast.action.element, s)) / span };
    };
    return items
        .map((item, i) => ({ item, i, k: key(item.label) }))
        .sort((a, b) => a.k.proc - b.k.proc || b.k.dmg - a.k.dmg || a.i - b.i)
        .map((x) => x.item);
}
const TICK = 300;
export function damageReport(results, gcd) {
    // 入ったダメージを時刻つきで集める（DoT は付け直しで打ち切る）
    const hits = [];
    let dotTicks = [];
    const out = [];
    let prev = { af: 0, ub: 0 };
    for (const r of results) {
        const cast = isWait(r.input) ? null : r.cast;
        const start = r.state.time;
        if (!cast || start === null) {
            out.push({ at: null, hit: 0 });
            prev = r.state;
            continue;
        }
        const at = start + castTime(cast, gcd);
        const a = cast.action;
        const hit = (a.potency ?? 0) * elementMultiplier(a.element, prev);
        if (hit > 0)
            hits.push({ t: at, v: hit });
        let dot;
        // 1体目に付く DoT（範囲なら必ず、単体なら敵1を狙っているとき）
        const toFirst = !!a.dot && (!!a.aoe || !(r.input.target2 && !r.input.target1));
        if (a.dot && toFirst) {
            dotTicks = dotTicks.filter((d) => d.t <= at);
            const ticks = Math.floor((a.dot.duration * 100) / TICK);
            for (let k = 1; k <= ticks; k++)
                dotTicks.push({ t: at + k * TICK, v: a.dot.potency });
            dot = { potency: a.dot.potency, ticks };
        }
        out.push({ at, hit, dot });
        prev = r.state;
    }
    // それぞれの手の時点までの合計と DPS
    const all = [...hits, ...dotTicks];
    return out.map((d) => {
        if (d.at === null)
            return { ...d, total: 0, dps: null };
        const total = all.reduce((sum, x) => (x.t <= d.at ? sum + x.v : sum), 0);
        return { ...d, total, dps: d.at > 0 ? total / (d.at / 100) : null };
    });
}
