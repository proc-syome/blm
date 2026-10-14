// 画面の状態（回し・設定・タイムライン）と保存。変更は update() を通し、そのたびに URL へ保存して描き直す。
import { kitFor } from "../sim/index.js";
import { SAMPLES } from "./sample.js";
import { LANE_EM_MIN, laneCount, normalizeLanes } from "./timeline.js";
import { KEYS, readStore, writeStore } from "./store.js";
import { DEFAULT_SETTINGS, decode, encode } from "./url.js";
export const app = {
    rows: [],
    settings: { ...DEFAULT_SETTINGS },
    /** タイムラインとメモ（表示だけで計算には使わない） */
    marks: [],
    /** タイムラインの列の数（印の無い列も含む） */
    laneTotal: 0,
    /** タイムラインの1列の幅（em） */
    laneEm: LANE_EM_MIN,
    /**
     * MP 自然回復の 3 秒周期のずれ（今の値、秒）。オンの間は 0.5 秒ごとに 0.5 秒ずつ自動で進む（main.ts）。
     * URL には入れず、止めたときだけ settings.tickOffset に写して保存する
     */
    livePhase: 0,
    /** ずれの自動の進みを止めているか */
    phasePaused: false,
};
export const emptyRow = () => ({ action: "", ability1: "", ability2: "" });
/** イベント行（待ち時間だけ）。既定は 10 秒 */
export const waitRow = (sec = 10) => ({ action: "", ability1: "", ability2: "", wait: sec });
/** 何か入っている行か（イベント行は入っている扱い） */
export const filled = (r) => !!(r.action || r.ability1 || r.ability2) || r.wait !== undefined;
/** 今のレベルのアクションの一覧 */
export const kit = () => kitFor(app.settings.level);
/** GCD（1/100 秒） */
export const gcdCs = () => Math.round(app.settings.gcd * 100);
let renderFn = () => { };
/** 描き直す関数を登録する（main から） */
export function setRenderer(fn) {
    renderFn = fn;
}
/** 保存せずに描き直す（ドラッグ中など） */
export const render = () => renderFn();
/** 状態を変えて、URL に保存して描き直す。最後の行が埋まったら空の行を1つ足しておく */
export function update(mutate) {
    mutate();
    const last = app.rows[app.rows.length - 1];
    if (!last || filled(last))
        app.rows.push(emptyRow());
    remember(save());
    renderFn();
}
// ---- 元に戻す・やり直し：変えるたびに URL の形（回し・設定・メモが全部入る）を覚えておく
const HISTORY_MAX = 200;
const past = [];
let future = [];
let current = null;
function remember(hash) {
    if (hash === current)
        return;
    if (current !== null) {
        past.push(current);
        if (past.length > HISTORY_MAX)
            past.shift();
    }
    current = hash;
    future = [];
}
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;
function restore(hash) {
    current = hash;
    // ずれの自動の進みは今のままにする（止めていたかどうかは回しではないので戻さない）
    const live = app.livePhase;
    loadFrom(hash);
    app.livePhase = live;
    save();
    renderFn();
}
/** ひとつ前に戻す */
export function undo() {
    const prev = past.pop();
    if (prev === undefined || current === null)
        return;
    future.push(current);
    restore(prev);
}
/** 戻したのをやり直す */
export function redo() {
    const next = future.pop();
    if (next === undefined || current === null)
        return;
    past.push(current);
    restore(next);
}
/** タイムラインの印を変える。列は毎回整え（重なりは右へ）、列の数は減らさない */
export function setMarks(f) {
    update(() => {
        app.marks = normalizeLanes(f(app.marks.slice()));
        app.laneTotal = Math.max(app.laneTotal, laneCount(app.marks));
    });
}
/** レベルを切り替える。回しとタイムラインはレベルごとに別物なので、どちらも消す */
export function switchLevel(level) {
    app.rows = [];
    app.marks = [];
    app.laneTotal = 0;
    app.laneEm = LANE_EM_MIN;
    app.settings = { ...app.settings, level };
}
/** 今のレベルのサンプルの回しにする（タイムラインはそのまま） */
export function loadSample() {
    const sample = SAMPLES[app.settings.level];
    app.rows = sample.rows.map((r) => ({ ...r }));
    app.settings = { ...app.settings, gcd: sample.gcd };
}
function save() {
    const hash = encode(app.rows, app.settings, app.marks, app.laneTotal, app.laneEm);
    try {
        history.replaceState(null, "", `#${hash}`);
    }
    catch {
        /* URL を書き換えられない環境でも動く */
    }
    writeStore(KEYS.last, hash);
    return hash;
}
/** URL（# 以降）か保存した内容を読む。読めたら true */
export function loadFrom(hash) {
    const d = decode(hash);
    if (!d)
        return false;
    app.rows = d.rows;
    app.settings = d.settings;
    app.marks = d.marks;
    app.laneTotal = Math.max(d.lanes, laneCount(d.marks));
    app.laneEm = d.laneEm;
    app.livePhase = d.settings.tickOffset;
    return true;
}
/** 起動時：URL → 前回の保存 → 初めてならサンプル の順に読む */
export function loadInitial() {
    const saved = readStore(KEYS.last);
    if (!loadFrom(location.hash) && !(saved && loadFrom(saved)))
        loadSample();
    if (app.rows.length === 0)
        app.rows = [emptyRow()];
}
