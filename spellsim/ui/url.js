// 回しと設定を URL（# 以降）に入れて保存・共有する。
import { splitLabel } from "../sim/index.js";
import { clampLaneEm, decodeMarks, encodeMarks, LANE_EM_MIN } from "./timeline.js";
/**
 * 形の版 1 の、頭文字付きのアクションの番号表（読むときだけ使う。頭文字は捨てて名前にする）。
 * 版 1 の URL を読むためのものなので、もう足さない・並びも変えない
 */
const ACTION_WORDS = [
    "Nファイガ", "Hファイガ", "Pファイガ", "Eファイガ", "Tファイガ",
    "Nファイジャ", "Eファイジャ", "Tファイジャ", "デスペア",
    "Nフレアスター", "Eフレアスター", "Tフレアスター",
    "Nハイファイラ", "Hハイファイラ", "Eハイファイラ", "Tハイファイラ",
    "Nフレア", "Eフレア", "Tフレア",
    "Nブリザガ", "Hブリザガ", "Eブリザガ", "Tブリザガ",
    "Nブリザジャ", "Eブリザジャ", "Tブリザジャ",
    "Nハイブリザラ", "Hハイブリザラ", "Eハイブリザラ", "Tハイブリザラ",
    "Nフリーズ", "Eフリーズ", "Tフリーズ",
    "パラドックス", "ハイサンダー", "ハイサンダラ", "ゼノグロシー", "ファウル", "コラプス", "アンブラルソウル",
    "Nファイア", "Eファイア", "Tファイア", "Nファイラ", "Eファイラ", "Tファイラ",
    "Nブリザド", "Eブリザド", "Tブリザド", "Nブリザラ", "Eブリザラ", "Tブリザラ",
    "サンダー", "サンダジャ", "Nスリプル", "Eスリプル", "Tスリプル",
    // レベル90
    "サンダガ", "Nデスペア", "Eデスペア", "Tデスペア",
];
/**
 * 形の版 2 から使う、魔法の名前の番号表（頭文字なし。頭文字は計算が状態から決める）。
 * **後ろに追加するだけで、並びは変えない**
 */
const SPELL_WORDS = [
    "ファイガ", "ファイジャ", "デスペア", "フレアスター", "ハイファイラ", "フレア",
    "ブリザガ", "ブリザジャ", "ハイブリザラ", "フリーズ",
    "パラドックス", "ハイサンダー", "ハイサンダラ", "ゼノグロシー", "ファウル", "コラプス", "アンブラルソウル",
    "ファイア", "ファイラ", "ブリザド", "ブリザラ", "サンダー", "サンダジャ", "スリプル",
    // レベル90
    "サンダガ",
];
const ABILITY_WORDS = [
    "トランス", "迅速魔", "三連魔", "マナフォント", "アンプリファイア", "マバリア", "黒魔紋",
    "魔紋再設置", "エーテリアルステップ", "ラインズステップ", "ルーシッドドリーム", "アドル", "堅実魔", "薬",
    "スプリント",
];
export const DEFAULT_SETTINGS = {
    level: 100,
    gcd: 2.5,
    mpRegen: false,
    tickOffset: 0,
    showExtraSpells: false,
    showAoe: false,
    dial: true,
    free: false,
    details: false,
    targets: false,
    nDelay: false,
    hideNames: false,
    damage: false,
};
const enc = (words, w) => {
    const i = words.indexOf(w);
    return i < 0 ? "" : (i + 1).toString(36);
};
/** GCD の下限（秒）。これより下げられる装備は今のところ無い。前の URL でこれより小さいものは、これとして読む */
export const GCD_MIN = 2.1;
const dec = (words, s) => (s ? (words[parseInt(s, 36) - 1] ?? "") : "");
/** オン/オフの設定と URL の1文字（オンのときだけ "1" で入れる）。tickOffset は r の後に "o" で入る */
const FLAG_PARAMS = [
    ["mpRegen", "r"],
    ["showExtraSpells", "x"],
    ["free", "f"],
    ["details", "d"],
    ["targets", "e"],
    ["nDelay", "n"],
    ["hideNames", "h"],
    ["damage", "p"],
    ["showAoe", "a"],
];
export function encode(rows, st, marks = [], lanes = 0, laneEm = LANE_EM_MIN) {
    const body = rows.map((r) => {
        const t = (r.target1 ? 1 : 0) | (r.target2 ? 2 : 0);
        // イベント行はアクションの欄を「-」＋待ち時間（1/100 秒、36 進）にする
        const head = r.wait !== undefined ? `-${Math.max(0, Math.round(r.wait * 100)).toString(36)}` : enc(SPELL_WORDS, splitLabel(r.action).name);
        return [head, enc(ABILITY_WORDS, r.ability1), enc(ABILITY_WORDS, r.ability2), t ? String(t) : ""]
            .join(".")
            .replace(/\.+$/, "");
    });
    const p = new URLSearchParams();
    p.set("v", "2");
    // レベル90 のときだけ入れる（レベル100 の URL は前と同じ形のまま）
    if (st.level === 90)
        p.set("lv", "90");
    p.set("g", String(Math.round(st.gcd * 100)));
    for (const [k, key] of FLAG_PARAMS) {
        if (st[k])
            p.set(key, "1");
        if (k === "mpRegen" && st.tickOffset)
            p.set("o", String(Math.round(st.tickOffset * 100)));
    }
    // ゲージを図で表示は既定オンなので、オフのときだけ c=0 を入れる（c=1 は前の版の URL。オンとして読む）
    if (!st.dial)
        p.set("c", "0");
    p.set("s", body.join("_"));
    if (marks.length)
        p.set("m", encodeMarks(marks));
    if (lanes)
        p.set("l", String(lanes));
    // タイムラインの列の幅（広げたときだけ。1/10 em）
    if (lanes && laneEm > LANE_EM_MIN)
        p.set("lw", String(Math.round(laneEm * 10)));
    return p.toString();
}
export function decode(hash) {
    const p = new URLSearchParams(hash.replace(/^#/, ""));
    // 版 1：アクションは頭文字付き（ACTION_WORDS）。版 2：魔法の名前（SPELL_WORDS）。どちらも名前として読む
    const version = p.get("v");
    if (version !== "1" && version !== "2")
        return null;
    const action = (code) => (version === "1" ? splitLabel(dec(ACTION_WORDS, code)).name : dec(SPELL_WORDS, code));
    const settings = { ...DEFAULT_SETTINGS, level: p.get("lv") === "90" ? 90 : 100, gcd: Math.max(GCD_MIN, Number(p.get("g") ?? 250) / 100 || 2.5), tickOffset: (Math.round((Number(p.get("o") ?? 0) / 100) * 2) / 2) % 3 };
    for (const [k, key] of FLAG_PARAMS)
        settings[k] = p.get(key) === "1";
    settings.dial = p.get("c") !== "0";
    // "w"（操作の遅れ。2026-10-12 に1日だけあった設定）は読み飛ばす。キーは使い回さない
    const s = p.get("s") ?? "";
    const rows = s
        ? s.split("_").map((part) => {
            const [a = "", b = "", c = "", t = ""] = part.split(".");
            const bits = Number(t || 0);
            const wait = a.startsWith("-");
            const row = { action: wait ? "" : action(a), ability1: dec(ABILITY_WORDS, b), ability2: dec(ABILITY_WORDS, c) };
            if (wait)
                row.wait = (parseInt(a.slice(1), 36) || 0) / 100;
            if (bits & 1)
                row.target1 = true;
            if (bits & 2)
                row.target2 = true;
            return row;
        })
        : [];
    const lw = Number(p.get("lw"));
    return { rows, settings, marks: decodeMarks(p.get("m")), lanes: Number(p.get("l")) || 0, laneEm: lw ? clampLaneEm(lw / 10) : LANE_EM_MIN };
}
