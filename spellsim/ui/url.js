import { clampLaneEm, decodeMarks, encodeMarks, LANE_EM_MIN } from "./timeline.js";
/** URL の中で使う番号表。**後ろに追加するだけで、並びは変えない**（変えると古い URL が壊れる） */
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
    free: false,
    details: false,
    targets: false,
    nDelay: false,
    hideNames: false,
};
const enc = (words, w) => {
    const i = words.indexOf(w);
    return i < 0 ? "" : (i + 1).toString(36);
};
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
];
export function encode(rows, st, marks = [], lanes = 0, laneEm = LANE_EM_MIN) {
    const body = rows.map((r) => {
        const t = (r.target1 ? 1 : 0) | (r.target2 ? 2 : 0);
        // イベント行はアクションの欄を「-」＋待ち時間（1/100 秒、36 進）にする
        const head = r.wait !== undefined ? `-${Math.max(0, Math.round(r.wait * 100)).toString(36)}` : enc(ACTION_WORDS, r.action);
        return [head, enc(ABILITY_WORDS, r.ability1), enc(ABILITY_WORDS, r.ability2), t ? String(t) : ""]
            .join(".")
            .replace(/\.+$/, "");
    });
    const p = new URLSearchParams();
    p.set("v", "1");
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
    if (p.get("v") !== "1")
        return null;
    const settings = { ...DEFAULT_SETTINGS, level: p.get("lv") === "90" ? 90 : 100, gcd: Number(p.get("g") ?? 250) / 100, tickOffset: (Math.round((Number(p.get("o") ?? 0) / 100) * 2) / 2) % 3 };
    for (const [k, key] of FLAG_PARAMS)
        settings[k] = p.get(key) === "1";
    const s = p.get("s") ?? "";
    const rows = s
        ? s.split("_").map((part) => {
            const [a = "", b = "", c = "", t = ""] = part.split(".");
            const bits = Number(t || 0);
            const wait = a.startsWith("-");
            const row = { action: wait ? "" : dec(ACTION_WORDS, a), ability1: dec(ABILITY_WORDS, b), ability2: dec(ABILITY_WORDS, c) };
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
