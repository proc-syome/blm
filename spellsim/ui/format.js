// 表示用の数値の形（時間はすべて 1/100 秒の整数で受け取る）
/** 経過時間 "01:23"（小数は別に出す）。null は空 */
export function mmss(cs) {
    if (cs === null)
        return "";
    const t = Math.abs(cs);
    const m = Math.floor(t / 6000);
    const s = Math.floor((t % 6000) / 100);
    return `${cs < 0 ? "-" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
/** 小数部分 ".05" */
export const centis = (cs) => `.${String(Math.abs(cs) % 100).padStart(2, "0")}`;
/** 秒（必要な桁だけ）：3000 → "30"、2470 → "24.7"、247 → "2.47" */
export const sec = (cs) => (cs / 100).toFixed(cs % 100 === 0 ? 0 : cs % 10 === 0 ? 1 : 2);
