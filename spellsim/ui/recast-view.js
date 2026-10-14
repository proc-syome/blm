// アビリティの選択肢にリキャストを載せる。
//   使えるもの：選択肢の並びのまま。チャージ制で次の1回を待っているときは画像の上にも残りを出す
//   リキャスト中で使えないもの：一覧の下にまとめて、選べない形で出す（画像を暗く）
// 画像の上は、下から「経過の白い扇形（12 時から時計回り、一周で使える）」→「残りの秒数（整数、切り上げ）」。
import { allAbilityLabels } from "../sim/index.js";
import { h } from "./dom.js";
/**
 * アビリティの選択肢。usable はその時点で選べるもの（並びは選択肢のまま）。
 * cd はその時点のリキャスト（アビリティ1はアクションを撃った時点、アビリティ2はアビリティ1を使った後）
 */
export function abilityChoices(usable, cd, kit, current) {
    const recastOf = (name) => {
        const a = kit.byName(name);
        const c = a && cd[a.id];
        return a && c && c.recast > 0 ? { left: c.recast, total: a.recastTime * 100 } : undefined;
    };
    const ok = new Set(usable);
    const choices = usable.map((label) => ({ label, recast: recastOf(label) }));
    // リキャスト中で使えないもの（チャージ制は残りが 0 のとき）
    for (const name of allAbilityLabels(kit)) {
        if (ok.has(name) || name === current)
            continue;
        const a = kit.byName(name);
        const c = a && cd[a.id];
        if (!a || !c || c.recast <= 0)
            continue;
        if ((a.maxCharges ?? 1) > 1 && c.charges >= 1)
            continue;
        choices.push({ label: name, recast: recastOf(name), down: true });
    }
    return choices;
}
/** 画像の上に重ねる、経過の白い扇形と残りの秒数 */
export function recastBadge(r) {
    const elapsed = r.total > 0 ? Math.min(1, Math.max(0, 1 - r.left / r.total)) : 1;
    return [
        h("span", { class: "pie", style: `--p:${(elapsed * 360).toFixed(1)}deg`, "aria-hidden": "true" }),
        h("span", { class: "sec" }, String(Math.ceil(r.left / 100))),
    ];
}
