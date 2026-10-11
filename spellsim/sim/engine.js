import { abilities } from "../data/index.js";
import { kitFor } from "../data/level.js";
import { parseCast } from "./label.js";
import { abilityOptions, actionOptions } from "./options.js";
import { applyAbility, applyCast, clone } from "./rules.js";
export const EMPTY_ROW = { action: "", ability1: "", ability2: "" };
/** 1/100 秒の整数に */
export const cs = (sec) => Math.round(sec * 100);
export function initialState() {
    const cd = {};
    for (const a of abilities)
        cd[a.id] = { effect: 0, recast: 0, charges: a.maxCharges ?? 1 };
    return {
        time: null,
        mp: 10000,
        af: 0,
        ub: 0,
        uh: 0,
        pa: 0,
        as: 0,
        ent: 0,
        pg: 0,
        pf: 0,
        pt: 0,
        dot: [0, 0],
        tripleStacks: 0,
        cd,
    };
}
/** 詠唱時間（1/100 秒）。基本キャストタイムを GCD で換算。E/T/P とインスタントは 0、H は半分 */
export function castTime(cast, gcd) {
    if (!cast || cast.mode === "E" || cast.mode === "T" || cast.mode === "P")
        return 0;
    return Math.round((cast.action.castTime * (cast.mode === "H" ? 0.5 : 1) * gcd) / 2.5);
}
/** 黒魔紋で短縮した長さ */
const underLines = (span) => Math.floor((span * 85) / 100);
/** この長さ以下の GCD ではアビリティを2回挟めない（1/100 秒） */
export const DOUBLE_WEAVE_MIN_GCD = 200;
/** アビリティ1回で詠唱できない時間（1/100 秒） */
export const WEAVE_LOCK = 100;
/** イベント行（待ち時間だけの行）か */
export const isWait = (r) => r.wait !== undefined;
/** 次の手の開始時刻。イベント行は前の手の GCD が終わった時刻から始まり、次の手は待ち時間の後 */
function nextTime(prev, prevIn, cur, curWait, prevCast, gcd, nWeave) {
    if (!cur && !curWait)
        return null;
    if (prev.time !== null && isWait(prevIn))
        return prev.time + cs(Math.max(0, prevIn.wait));
    // 最初の手：詠唱は戦闘開始（0）に終わるよう前倒し。最初がイベント行なら 0 から
    if (!prevCast || prev.time === null)
        return curWait ? (prev.time ?? 0) : -Math.max(gcd, castTime(cur, gcd));
    const span = Math.max(gcd, castTime(prevCast, gcd));
    // 前の手の詠唱開始時に黒魔紋が効いていれば 15% 短縮（その手で使った場合は間に合わない）
    const lines = prev.cd.leyLines.effect > 0 && prevIn.ability1 !== "黒魔紋" && prevIn.ability2 !== "黒魔紋";
    const shorten = (x) => (lines ? underLines(x) : x);
    let wait = shorten(span);
    // N の魔法の後にアビリティを使った場合：詠唱後の GCD の残りで吸収できないぶん、次の詠唱が遅れる
    if (nWeave === "delay" && prevCast.mode === "N") {
        const count = (prevIn.ability1 ? 1 : 0) + (prevIn.ability2 ? 1 : 0);
        const room = wait - shorten(castTime(prevCast, gcd));
        wait += Math.max(0, count * WEAVE_LOCK - room);
    }
    return prev.time + wait;
}
const TICK = 300;
const NATURAL_REGEN = 200;
const LUCID_REGEN = 550;
/** prev.time より後、time 以前にある 3 秒周期の時刻 */
function ticksBetween(from, to, offset) {
    const out = [];
    const mod = (x) => ((x % TICK) + TICK) % TICK;
    for (let t = from + 1 + mod(offset - (from + 1)); t <= to; t += TICK)
        out.push(t);
    return out;
}
/** MP の時間回復（AF 以外のとき）：自然回復（設定で有効）とルーシッドドリーム */
function regen(prev, time, profile) {
    if (prev.time === null || prev.af > 0)
        return 0;
    let gain = 0;
    for (const t of ticksBetween(prev.time, time, profile.tickOffset)) {
        if (profile.mpRegen)
            gain += NATURAL_REGEN;
        if (prev.cd.lucidDreaming.effect - (t - prev.time) > 0)
            gain += LUCID_REGEN;
    }
    return gain;
}
/** 時間経過：タイマー・チャージ・MP回復・エノキアン・ポリグロット・DoT を進める */
function elapse(prev, prevIn, time, profile, kit) {
    const s = clone(prev);
    s.time = time;
    const dt = time === null || prev.time === null ? 0 : time - prev.time;
    if (time !== null)
        s.mp = Math.min(10000, s.mp + regen(prev, time, profile));
    for (const a of kit.abilities) {
        const c = s.cd[a.id];
        // 前の手でアビリティ1に何かあり、アビリティ2で使ったものは 1 秒遅れて始まる
        const late = prevIn.ability2 === a.nameJa && prevIn.ability1 !== "" ? 100 : 0;
        const left = (x) => x + late - dt;
        c.effect = Math.max(0, left(c.effect));
        const max = a.maxCharges ?? 1;
        if (max > 1) {
            const rc = a.recastTime * 100;
            let rem = left(c.recast);
            if (c.recast > 0) {
                while (rem <= 0 && c.charges < max) {
                    c.charges += 1;
                    if (c.charges < max)
                        rem += rc;
                }
                c.recast = c.charges >= max ? 0 : rem;
            }
        }
        else {
            c.recast = Math.max(0, left(c.recast));
        }
    }
    if (s.cd.triplecast.effect === 0)
        s.tripleStacks = 0;
    // エノキアン：AF か UB がある間、30 秒周期で回る。ちょうど 30 の倍数は 30 と表示
    let crossed = 0;
    if (time === null || time < 0 || (prev.af === 0 && prev.ub === 0))
        s.ent = null;
    else if (prev.ent === null || prev.time === null || prev.time < 0)
        s.ent = 0;
    else {
        const total = prev.ent + dt;
        const m = total % 3000;
        s.ent = m === 0 && total > 0 ? 3000 : m;
        crossed = Math.floor(((prev.ent % 3000) + dt) / 3000);
    }
    s.pg = Math.min(kit.polyglotMax, s.pg + crossed);
    s.dot = [Math.max(0, prev.dot[0] - dt), Math.max(0, prev.dot[1] - dt)];
    return s;
}
/** DoT：範囲なら両方、そうでなければ指定した敵（既定は敵1。敵1と敵2を同時に選ぶことはできず、両方なら敵1）を上書き */
function applyDot(s, cast, input) {
    const dot = cast.action.dot;
    if (!dot)
        return;
    const d = dot.duration * 100;
    const aoe = !!cast.action.aoe;
    const second = !!input.target2 && !input.target1;
    if (aoe || !second)
        s.dot[0] = d;
    if (aoe || second)
        s.dot[1] = d;
}
/** 回し全体を上から順に計算する */
export function simulate(rows, profile, init = initialState()) {
    const gcd = cs(profile.gcd);
    const kit = kitFor(profile.level);
    const tickSettings = { mpRegen: profile.mpRegen ?? false, tickOffset: cs(profile.tickOffset ?? 0) };
    const out = [];
    let prev = init;
    let prevIn = EMPTY_ROW;
    let prevCast = null;
    for (const input of rows) {
        const wait = isWait(input);
        const cast = wait ? null : parseCast(input.action, kit);
        const action = actionOptions(prev, profile.showExtraSpells ?? false, kit);
        // 時間経過 → アクション → アビリティ1 → アビリティ2
        let s = elapse(prev, prevIn, nextTime(prev, prevIn, cast, wait, prevCast, gcd, profile.nWeave), tickSettings, kit);
        if (cast) {
            s = applyCast(s, cast, kit);
            applyDot(s, cast, input);
        }
        // アビリティを2回挟めるか：H の手、または黒魔紋に乗って GCD が 2 秒以下の手は1回まで
        const linesNow = s.cd.leyLines.effect > 0 && input.ability1 !== "黒魔紋" && input.ability2 !== "黒魔紋";
        // イベント行は時間があるので2つとも使える
        const secondWeave = wait || (cast?.mode !== "H" && (linesNow ? underLines(gcd) : gcd) > DOUBLE_WEAVE_MIN_GCD);
        // N の魔法の後はアビリティを使わない設定
        const noWeave = profile.nWeave === "forbid" && cast?.mode === "N";
        const ability1 = noWeave ? [] : abilityOptions(s, 1, secondWeave, kit);
        const ab1 = kit.byName(input.ability1);
        if (ab1 && ab1.kind !== "spell")
            s = applyAbility(s, ab1, kit);
        const ability2 = noWeave ? [] : abilityOptions(s, 2, secondWeave, kit);
        const ab2 = kit.byName(input.ability2);
        if (ab2 && ab2.kind !== "spell")
            s = applyAbility(s, ab2, kit);
        out.push({ input, state: s, options: { action, ability1, ability2 } });
        prev = s;
        prevIn = input;
        // イベント行の後は前の手の詠唱の続きにならない（次の手は待ち時間の後）
        prevCast = cast;
    }
    return out;
}
