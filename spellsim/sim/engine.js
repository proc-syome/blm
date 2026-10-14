// 計算の本体：simulate() は回しを上から1手ずつ「時間経過 → アクション → アビリティ1 → アビリティ2」の順に処理し、
// 各手の後の状態（RowResult）を返す。時間はすべて 1/100 秒の整数。イベント行（wait）は時間だけ進める。
import { abilities } from "../data/index.js";
import { kitFor } from "../data/level.js";
import { castLabel } from "./label.js";
import { abilityOptions, actionOptions, resolveCast } from "./options.js";
import { applyAbility, applyCast, clone, isReady } from "./rules.js";
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
/**
 * 黒魔紋で短縮した長さ（× 0.85、1/100 秒に四捨五入）。
 * 四捨五入にしているのは、GCD 2.36 で「黒魔紋中に即時の魔法＋アビリティ2つ」が間に合う扱いにするため（作者の判断。
 * 回しの紹介サイトで GCD 2.36 がすすめられていることに合わせた。画面の GCD は切り捨てて見せた値で、本当の値は少し長いためと考えられる）。
 * スプレッドシート版に合わせるとき（sheet）は切り捨て
 */
export const underLines = (span, sheet = false) => (sheet ? Math.floor : Math.round)((span * 85) / 100);
/**
 * 詠唱した魔法の後の硬直（1/100 秒）。詠唱バーが終わってから 0.1 秒は次の操作ができない（キャスタータックス）。
 * 通信の遅れに左右されず、黒魔紋でも縮まない。根拠は docs/調査_硬直と先行入力.md（2026-10-14 に入れた）
 */
export const CAST_TAX = 10;
/** 手の開始から、アビリティ・次の魔法を使えるようになるまで（1/100 秒）：詠唱の終わり（黒魔紋で短縮）＋ 0.1 秒。即時の魔法は硬直の終わり */
function castEnd(cast, gcd, lines, sheet) {
    const t = castTime(cast, gcd);
    return t > 0 ? (lines ? underLines(t, sheet) : t) + (sheet ? 0 : CAST_TAX) : WEAVE_LOCK;
}
/** この長さ以下の GCD ではアビリティを2回挟めない（1/100 秒）。黒魔紋中は見ない（選べて、はみ出すぶんは遅れる） */
export const DOUBLE_WEAVE_MIN_GCD = 200;
/**
 * GCD によって硬直がはみ出す（次の魔法が遅れる）量（1/100 秒。収まれば 0）。設定バーで注意を出すのに使う。gcd は 1/100 秒
 * - linesDouble：黒魔紋中に、即時の魔法の後にアビリティを2つ（硬直 3 回ぶん、2.01 秒）。GCD 2.35 以下ではみ出す
 */
export function weaveOverruns(gcd) {
    return { linesDouble: Math.max(0, 3 * WEAVE_LOCK - underLines(gcd)) };
}
/** 硬直：アビリティ1回、または詠唱の無い魔法（即時の魔法）を使った後、次の操作ができない時間（1/100 秒）。
 * 実測で約 0.67 秒（どのアビリティ・魔法でも同じで、GCD やスキルスピードでも変わらない） */
export const WEAVE_LOCK = 67;
/** スプレッドシート版のアビリティの硬直（1 秒）。sheetTiming のときだけ使う */
const SHEET_WEAVE_LOCK = 100;
/** イベント行（待ち時間だけの行）か */
export const isWait = (r) => r.wait !== undefined;
/** 次の手の開始時刻。イベント行は前の手の GCD が終わった時刻から始まり、次の手は待ち時間の後 */
function nextTime(prev, prevIn, cur, curWait, prevCast, gcd, nWeave, sheet) {
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
    const shorten = (x) => (lines ? underLines(x, sheet) : x);
    const wait = shorten(span);
    const count = (prevIn.ability1 ? 1 : 0) + (prevIn.ability2 ? 1 : 0);
    // スプレッドシート版と同じ扱い：N の魔法の後のアビリティだけ、1回 1 秒で、GCD の残りで吸収できないぶん遅れる
    if (sheet) {
        const room = wait - shorten(castTime(prevCast, gcd));
        return prev.time + wait + (nWeave === "delay" && prevCast.mode === "N" ? Math.max(0, count * SHEET_WEAVE_LOCK - room) : 0);
    }
    // 詠唱の終わり（即時の魔法は硬直の終わり）からアビリティの硬直を足した時刻が GCD より後なら、そこまで遅れる
    return prev.time + Math.max(wait, castEnd(prevCast, gcd, lines, sheet) + count * WEAVE_LOCK);
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
function regen(prev, time, profile, lucidFrom) {
    if (prev.time === null || prev.af > 0)
        return 0;
    let gain = 0;
    // ルーシッドドリームは使った時刻（前の手の開始から lucidFrom 後）から効く
    const lucid = prev.cd.lucidDreaming.effect;
    for (const t of ticksBetween(prev.time, time, profile.tickOffset)) {
        if (profile.mpRegen)
            gain += NATURAL_REGEN;
        const since = t - prev.time;
        if (since >= lucidFrom && since < lucid + lucidFrom)
            gain += LUCID_REGEN;
    }
    return gain;
}
/** アビリティのタイマー（効果・リキャスト・チャージ）を dt（1/100 秒）だけ進めたもの */
function advanceCooldowns(cd, dt, kit) {
    const out = {};
    for (const a of kit.abilities) {
        const c = { ...cd[a.id] };
        c.effect = Math.max(0, c.effect - dt);
        const max = a.maxCharges ?? 1;
        if (max > 1) {
            const rc = a.recastTime * 100;
            let rem = c.recast - dt;
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
            c.recast = Math.max(0, c.recast - dt);
        }
        out[a.id] = c;
    }
    return out;
}
/**
 * アビリティを、手の開始から at（1/100 秒）後に使う。状態のタイマーは手の開始の時点で持つので、
 * 使う時点まで進めた見方で使えるか・どう減るかを決め、そのアビリティのタイマーだけ手の開始の時点に戻して入れる
 */
function useAbilityAt(s, a, at, kit) {
    if (at <= 0)
        return applyAbility(s, a, kit);
    const used = applyAbility({ ...s, cd: advanceCooldowns(s.cd, at, kit) }, a, kit);
    const e = used.cd[a.id];
    const back = { effect: e.effect > 0 ? e.effect + at : 0, recast: e.recast > 0 ? e.recast + at : 0, charges: e.charges };
    return { ...used, cd: { ...s.cd, [a.id]: back } };
}
/** 手の中で使ったアビリティのタイマーを、使った時刻（手の開始から lateOf）から数え始めるよう、そのぶん足したもの */
function withLate(cd, lateOf, kit) {
    const out = {};
    for (const a of kit.abilities) {
        const l = lateOf[a.nameJa] ?? 0;
        const c = cd[a.id];
        out[a.id] = l > 0 ? { ...c, effect: c.effect > 0 ? c.effect + l : 0, recast: c.recast > 0 ? c.recast + l : 0 } : c;
    }
    return out;
}
/** 手の開始から at 後に見た、アビリティのタイマー（選択肢・リキャストの表示用）。lateOf はその手でもう使ったものの時刻 */
const cooldownsAt = (s, at, kit, lateOf = {}) => at > 0 ? { ...s, cd: advanceCooldowns(withLate(s.cd, lateOf, kit), at, kit) } : s;
/** 時間経過：タイマー・チャージ・MP回復・エノキアン・ポリグロット・DoT を進める。pgLost は最大を超えて捨てたポリグロット */
function elapse(prev, prevIn, time, profile, kit, lateOf) {
    const s = clone(prev);
    s.time = time;
    const dt = time === null || prev.time === null ? 0 : time - prev.time;
    if (time !== null)
        s.mp = Math.min(10000, s.mp + regen(prev, time, profile, lateOf["ルーシッドドリーム"] ?? 0));
    // 前の手で使ったアビリティは、その手の中で使った時刻（手の開始から lateOf）から数え始める
    s.cd = advanceCooldowns(withLate(s.cd, lateOf, kit), dt, kit);
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
    const pgLost = Math.max(0, s.pg + crossed - kit.polyglotMax);
    s.pg = Math.min(kit.polyglotMax, s.pg + crossed);
    s.dot = [Math.max(0, prev.dot[0] - dt), Math.max(0, prev.dot[1] - dt)];
    return { s, pgLost };
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
/** 迅速魔・三連魔の効果だけ、詠唱開始の時点（elapsed）のものにした状態 */
function buffsAt(prev, elapsed) {
    const swift = elapsed.cd.swiftcast;
    const triple = elapsed.cd.triplecast;
    if (swift.effect === prev.cd.swiftcast.effect && triple.effect === prev.cd.triplecast.effect)
        return prev;
    return { ...prev, cd: { ...prev.cd, swiftcast: { ...prev.cd.swiftcast, effect: swift.effect }, triplecast: { ...prev.cd.triplecast, effect: triple.effect } }, tripleStacks: elapsed.tripleStacks };
}
/** 回し全体を上から順に計算する */
export function simulate(rows, profile, init = initialState()) {
    const gcd = cs(profile.gcd);
    const kit = kitFor(profile.level);
    const sheet = profile.sheetTiming ?? false;
    const tickSettings = { mpRegen: profile.mpRegen ?? false, tickOffset: cs(profile.tickOffset ?? 0) };
    const out = [];
    let prev = init;
    let prevIn = EMPTY_ROW;
    let prevCast = null;
    // イベント行の終わりに使う迅速魔（前の手から持ち越す）
    let swiftAtEnd = false;
    // 前の手でアビリティを使った時刻（名前 → 手の開始からの 1/100 秒）。タイマーはそこから数え始める
    let prevLate = {};
    for (const input of rows) {
        const wait = isWait(input);
        // 時間経過（次の手の開始時刻は、最初の手でなければ前の手だけで決まる。最初の手は迅速魔・三連魔が無いので頭文字も決まる）
        const first = wait ? null : (resolveCast(input.action, prev, kit)?.cast ?? null);
        const passed = elapse(prev, prevIn, nextTime(prev, prevIn, first, wait, prevCast, gcd, profile.nWeave, sheet), tickSettings, kit, prevLate);
        // 前のイベント行で、終わりに使うことにした迅速魔を、ここ（待ち時間の終わり＝この手の直前）で使う
        if (swiftAtEnd)
            passed.s = applyAbility(passed.s, kit.byId("swiftcast"), kit);
        // どう撃つか（頭文字）と選択肢は前の手の状態から決める（スプレッドシートと同じ。効果が手の間で切れる境目でも、
        // 前の手の時点で残っていれば使える扱い）。ただしイベント行の後は、待っている間に切れた迅速魔・三連魔は使えない
        const look = isWait(prevIn) ? buffsAt(prev, passed.s) : prev;
        const cast = wait ? null : (resolveCast(input.action, look, kit)?.cast ?? null);
        const action = actionOptions(look, profile.showExtraSpells ?? false, kit);
        let s = passed.s;
        let pgLost = passed.pgLost;
        // アンプリファイアをポリグロットが最大のときに使うと、増えるはずの1つが捨てられる
        const amplifierWasted = (st, a) => (a?.id === "amplifier" && st.pg >= kit.polyglotMax ? 1 : 0);
        if (cast) {
            s = applyCast(s, cast, kit);
            applyDot(s, cast, input);
        }
        // アビリティを2回挟めるか（下の secondWeave）
        const linesNow = s.cd.leyLines.effect > 0 && input.ability1 !== "黒魔紋" && input.ability2 !== "黒魔紋";
        // アビリティを使う時刻（手の開始から、1/100 秒）：詠唱の終わりから 0.1 秒後（即時の魔法は硬直 0.67 秒の後）。
        // アビリティ2はアビリティ1の硬直（0.67 秒）の後。イベント行は待ち時間の始まり
        const at1 = sheet || !cast ? 0 : castEnd(cast, gcd, linesNow, sheet);
        const at2 = at1 + (input.ability1 ? (sheet ? SHEET_WEAVE_LOCK : WEAVE_LOCK) : 0);
        // 選べるかを見る時刻（スプレッドシート版と同じにするときは、どちらも手の開始）
        const see1 = sheet ? 0 : at1;
        const see2 = sheet ? 0 : at2;
        const cdAtCast = structuredClone(cooldownsAt(s, see1, kit).cd);
        // イベント行は時間があるので2つとも使える
        // H の手は1回まで。GCD 2 秒以下も1回まで。黒魔紋中は GCD に関係なく選べる（はみ出すぶんは次の手が遅れる。
        // スプレッドシート版に合わせるときは、黒魔紋中の間隔 GCD × 0.85 が 2 秒以下なら選べない）
        const secondWeave = wait || (cast?.mode !== "H" && (linesNow && !sheet ? true : (linesNow ? underLines(gcd, true) : gcd) > DOUBLE_WEAVE_MIN_GCD));
        // 詠唱した魔法（N・H）の後はアビリティを使わない設定（既定）。使うと詠唱後 0.1 秒＋硬直で次の魔法が遅れるため
        const noWeave = profile.nWeave === "forbid" && (cast?.mode === "N" || cast?.mode === "H");
        // 例外：効果時間（10 秒）以上のイベント行で使う迅速魔は、待ち時間の終わりに使ったことにする
        // （効果が次の詠唱に乗るよう、待ちの終わりぎわに使う動き。次の手の直前で使い、リキャストもそこから数える）
        const atEnd = (a) => wait && a.id === "swiftcast" && cs(Math.max(0, input.wait)) >= cs(a.effectDuration ?? 0);
        let deferSwift = false;
        const use = (a) => {
            if (!a || a.kind === "spell")
                return;
            if (atEnd(a)) {
                deferSwift = true;
                return;
            }
            pgLost += amplifierWasted(s, a);
            // 使う時刻のタイマーで使えるか決める。手の開始で使えるものはそのまま使い、数え始めは次の時間経過でずらす。
            // 手の開始ではまだで、使う時刻までにチャージが戻るものだけ、使う時刻の見方で使って戻す
            if (isReady(s, a) || at <= 0) {
                s = applyAbility(s, a, kit);
                if (at > 0)
                    late[a.nameJa] = at;
            }
            else
                s = useAbilityAt(s, a, at, kit);
        };
        const late = {};
        let at = at1;
        const ability1 = noWeave ? [] : abilityOptions(cooldownsAt(s, see1, kit), 1, secondWeave, kit);
        use(kit.byName(input.ability1));
        at = at2;
        const cdAfterAb1 = structuredClone(cooldownsAt(s, see2, kit, late).cd);
        // 終わりに使う迅速魔をアビリティ1に入れたときは、アビリティ2では選べない
        const ability2 = noWeave ? [] : abilityOptions(cooldownsAt(s, see2, kit, late), 2, secondWeave, kit).filter((l) => !(deferSwift && l === "迅速魔"));
        use(kit.byName(input.ability2));
        out.push({ input, before: look, cast, label: cast ? castLabel(cast.mode, cast.action) : "", state: s, cdAtCast, cdAfterAb1, pgLost, options: { action, ability1, ability2 } });
        prev = s;
        prevIn = input;
        // イベント行の後は前の手の詠唱の続きにならない（次の手は待ち時間の後）
        prevCast = cast;
        swiftAtEnd = deferSwift;
        prevLate = late;
    }
    return out;
}
