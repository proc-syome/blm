// 回し全体のまとめ（スキル回しを比べるときに使う）。数字はすべて簡易ダメージ（威力 × AF/UB）と同じ考え方。
import { damageReport } from "./damage.js";
import { isWait } from "./engine.js";
export function summarize(results, gcd) {
    const damage = damageReport(results, gcd);
    const counts = new Map();
    let casts = 0;
    let lastAt = null;
    let last = -1;
    results.forEach((r, i) => {
        if (isWait(r.input) || !r.cast || damage[i].at === null)
            return;
        casts++;
        const name = r.cast.action.nameJa;
        counts.set(name, (counts.get(name) ?? 0) + 1);
        lastAt = damage[i].at;
        last = i;
    });
    return {
        casts,
        end: lastAt,
        total: last >= 0 ? damage[last].total : 0,
        dps: last >= 0 ? damage[last].dps : null,
        pgLost: results.reduce((n, r) => n + r.pgLost, 0),
        counts,
    };
}
