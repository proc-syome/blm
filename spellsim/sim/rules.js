import { kitFor } from "../data/level.js";
const MP_MAX = 10000;
const UB_MP_GAIN = [0, 2500, 5000, 10000];
export function clone(s) {
    const cd = {};
    for (const [k, v] of Object.entries(s.cd))
        cd[k] = { ...v };
    return { ...s, dot: [s.dot[0], s.dot[1]], cd };
}
/** AF/UB に新しく入ったら（またはマナフォントで）サンダーのプロックが付く */
function grantThunderheadOnEnter(before, after) {
    if ((before.af === 0 && after.af > 0) || (before.ub === 0 && after.ub > 0))
        after.pt = 1;
}
/** この状態で詠唱したときの消費MP */
export function mpCost(s, cast) {
    const { action: a, mode } = cast;
    if (a.id === "fire3" && mode === "P")
        return 0;
    if (a.mp === "all")
        return a.id === "flare" && s.uh > 0 ? Math.floor((s.mp * 2) / 3) : s.mp;
    const base = a.mp;
    if (a.element === "ice")
        return s.af + s.ub > 0 ? 0 : base;
    if (a.element === "fire") {
        if (s.ub > 0)
            return 0;
        return s.af > 0 && s.uh === 0 ? base * 2 : base;
    }
    if (a.id === "paradox")
        return s.ub > 0 ? 0 : base;
    return base;
}
/** 詠唱（GCD）を1つ当てる。s は詠唱前の状態 */
export function applyCast(s, cast, kit = kitFor()) {
    const n = clone(s);
    const { action: a, mode } = cast;
    const id = a.id;
    // MP（氷の回復は詠唱前の UB スタックで決まる）
    n.mp = Math.max(0, s.mp - mpCost(s, cast));
    if (a.element === "ice" && id !== "umbralSoul" && s.ub > 0)
        n.mp += UB_MP_GAIN[s.ub];
    switch (id) {
        case "fire2":
        case "fire3":
        case "highFire2":
            n.af = 3;
            n.ub = 0;
            if (s.uh > 0 && s.af > 0 && mode !== "P")
                n.uh = s.uh - 1;
            if (s.ub === 3 && s.uh === 3)
                n.pa = 1;
            if (mode === "P")
                n.pf = 0;
            break;
        case "fire":
            if (s.ub > 0) {
                n.ub = 0;
                n.uh = 0;
                if (s.ub === 3 && s.uh === 3)
                    n.pa = 1;
            }
            else {
                n.af = s.af === 0 ? 1 : s.af === 1 ? 2 : 3;
                if (s.af > 0 && s.uh > 0)
                    n.uh = s.uh - 1;
            }
            break;
        case "fire4":
            if (kit.astralSoul)
                n.as = Math.min(6, s.as + 1);
            if (s.af > 0 && s.uh > 0)
                n.uh = s.uh - 1;
            break;
        case "flare":
            n.af = 3;
            n.uh = 0;
            if (kit.astralSoul)
                n.as = Math.min(6, s.as + 3);
            break;
        case "despair":
            n.af = 3;
            break;
        case "flareStar":
            n.as = 0;
            break;
        case "blizzard":
            if (s.af > 0) {
                n.af = 0;
                n.ub = 0;
                n.uh = 0;
                n.as = 0;
            }
            else
                n.ub = Math.min(3, s.ub + 1);
            break;
        case "blizzard2":
        case "blizzard3":
        case "highBlizzard2":
            if (s.af === 3)
                n.pa = 1;
            if (s.af > 0)
                n.as = 0;
            n.af = 0;
            n.ub = 3;
            break;
        case "blizzard4":
        case "freeze":
            n.uh = 3;
            break;
        case "umbralSoul":
            if (s.ub > 0)
                n.ub = Math.min(3, s.ub + 1);
            n.uh = Math.min(3, s.uh + 1);
            if (n.ub > 0)
                n.mp += UB_MP_GAIN[n.ub];
            break;
        case "paradox":
            n.pa = 0;
            if (s.af > 0)
                n.pf = 1;
            break;
        case "thunder":
        case "thunder2":
        case "thunder3":
        case "thunder4":
        case "highThunder":
        case "highThunder2":
            n.pt = 0;
            break;
        case "xenoglossy":
        case "foul":
            n.pg = Math.max(0, s.pg - 1);
            break;
    }
    n.mp = Math.min(MP_MAX, n.mp);
    grantThunderheadOnEnter(s, n);
    // 迅速魔・三連魔の消費
    if (mode === "E")
        n.cd.swiftcast.effect = 0;
    if (mode === "T") {
        n.tripleStacks = Math.max(0, s.tripleStacks - 1);
        if (n.tripleStacks === 0)
            n.cd.triplecast.effect = 0;
    }
    return n;
}
/** アビリティ（アイテム）を1つ当てる。s は使う直前の状態（a はそのレベルの数値） */
export function applyAbility(s, a, kit = kitFor()) {
    const n = clone(s);
    const c = n.cd[a.id];
    if (a.effectDuration !== undefined)
        c.effect = a.effectDuration * 100;
    const max = a.maxCharges ?? 1;
    if (max > 1) {
        if (c.charges >= 1) {
            c.charges -= 1;
            if (c.recast === 0)
                c.recast = a.recastTime * 100;
        }
    }
    else {
        c.recast = a.recastTime * 100;
    }
    switch (a.id) {
        case "transpose":
            if (s.af > 0) {
                if (s.af === 3)
                    n.pa = 1;
                n.af = 0;
                n.ub = 1;
                n.as = 0;
            }
            else if (s.ub > 0) {
                if (s.ub === 3 && s.uh === 3)
                    n.pa = 1;
                n.ub = 0;
                n.af = 1;
            }
            grantThunderheadOnEnter(s, n);
            break;
        case "manafont":
            if (s.af > 0)
                n.pa = 1;
            n.af = 3;
            n.ub = 0;
            n.uh = 3;
            n.pt = 1;
            n.mp = MP_MAX;
            break;
        case "amplifier":
            n.pg = Math.min(kit.polyglotMax, s.pg + 1);
            break;
        case "triplecast":
            n.tripleStacks = 3;
            break;
    }
    return n;
}
/** アビリティが今使えるか（リキャスト・チャージだけを見る） */
export function isReady(s, a) {
    const c = s.cd[a.id];
    return (a.maxCharges ?? 1) > 1 ? c.charges >= 1 : c.recast === 0;
}
