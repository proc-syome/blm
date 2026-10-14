// タイムラインとメモ：「この期間はギミック」「この期間は動きたい」のように、時間の範囲に印と文字を付ける。
// 回しの計算には使わない（表示だけ）。時間は 1/100 秒の整数。
/** 種類。**後ろに追加するだけで、並びは変えない**（URL に番号で入るため） */
export const KINDS = [
    { id: "gimmick", label: "ギミック" },
    { id: "move", label: "移動" },
    { id: "burst", label: "バースト" },
    { id: "memo", label: "メモ" },
];
/** "1:23.45" / "83.45" / "-0:03" → 1/100 秒。読めなければ null */
export function parseTime(s) {
    const m = /^\s*(-)?(?:(\d+):)?(\d+(?:\.\d{0,2})?)\s*$/.exec(s);
    if (!m)
        return null;
    const cs = Math.round((Number(m[2] ?? 0) * 60 + Number(m[3])) * 100);
    return m[1] ? -cs : cs;
}
/** 1/100 秒 → "1:23.45"（端数が無ければ "1:23"） */
export function formatTime(cs) {
    const neg = cs < 0;
    const t = Math.abs(cs);
    const m = Math.floor(t / 6000);
    const s = Math.floor((t % 6000) / 100);
    const f = t % 100;
    return `${neg ? "-" : ""}${m}:${String(s).padStart(2, "0")}${f ? `.${String(f).padStart(2, "0").replace(/0$/, "")}` : ""}`;
}
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
/** j 番の印を cand に置き換えたとき、同じ列の他の印と重ならないか */
export function fits(marks, j, cand) {
    return cand.lane >= 0 && marks.every((o, i) => i === j || o.lane !== cand.lane || !overlaps(o, cand));
}
/** 列 k の位置に空の列を入れる（k 以降の印は右へ1つずれる） */
export const insertLane = (marks, k) => marks.map((m) => (m.lane >= k ? { ...m, lane: m.lane + 1 } : m));
/** 列 k を消す（その列の印も消え、右の列は左へ1つずれる） */
export const removeLane = (marks, k) => marks.filter((m) => m.lane !== k).map((m) => (m.lane > k ? { ...m, lane: m.lane - 1 } : m));
/** 帯の1列の幅（em）。今の幅が最小、広げられるのは MAX まで */
export const LANE_EM_MIN = 4.5;
export const LANE_EM_MAX = 16;
export const clampLaneEm = (w) => Math.min(LANE_EM_MAX, Math.max(LANE_EM_MIN, Math.round(w * 2) / 2));
/** 印が使っている列の数（空の列は含まない。実際の列の数は別に持つ） */
export const laneCount = (marks) => marks.reduce((n, m) => Math.max(n, m.lane + 1), 0);
/**
 * 列を整える。列の決まっていない印は左端から、同じ列で重なっている印はその右から、重ならない列へ移す（足した順）。
 * 印の無い列も消さない（列の追加・削除は利用者が行う）
 */
export function normalizeLanes(marks) {
    const out = [];
    for (const m of marks) {
        let lane = m.lane;
        const clash = (l) => out.some((o) => o.lane === l && overlaps(o, m));
        // 列が決まっていなければ左端から、重なっていればその右から空いている列を探す
        if (lane < 0)
            lane = 0;
        while (clash(lane))
            lane++;
        out.push({ ...m, lane });
    }
    return out;
}
// ---- URL 用（1件ずつ改行、項目はタブ区切り。URLSearchParams がエスケープする）
// 文字の中の改行は CR にして入れる（件の区切りの LF とぶつからないように）。タブは空白に
const clean = (s) => s.replace(/\t/g, " ").replace(/\r\n?/g, "\n").slice(0, 200).replace(/\n/g, "\r");
export function encodeMarks(marks) {
    return marks
        .map((m) => [m.start.toString(36), m.end.toString(36), `${KINDS.findIndex((k) => k.id === m.kind)}-${Math.max(0, m.lane)}`, clean(m.text)].join("\t"))
        .join("\n");
}
export function decodeMarks(s) {
    if (!s)
        return [];
    const out = [];
    for (const line of s.split("\n")) {
        const [a = "", b = "", k = "", ...text] = line.split("\t");
        const start = parseInt(a, 36);
        const end = parseInt(b, 36);
        // 種類と列は「種類-列」。列の無い古い形は、空いている左の列に置く
        const [ki = "", li] = k.split("-");
        const kind = KINDS[Number(ki)]?.id;
        const lane = li === undefined ? -1 : Number(li);
        const body = text.join(" ").replace(/\r/g, "\n");
        if (Number.isFinite(start) && Number.isFinite(end) && kind)
            out.push({ start, end, kind, text: body, lane: Number.isFinite(lane) ? lane : -1 });
    }
    return normalizeLanes(out);
}
