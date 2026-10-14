import { svg } from "./dom.js";
const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
/** 中心から h 時の方向へ。半径 r、横ずれ t */
const dir = (h) => {
    const a = (h / 12) * 2 * Math.PI;
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    return (r, t = 0) => [ux * r - uy * t, uy * r + ux * t];
};
const R = 22; // 中央の玉
const ARC_R = 56; // エレメンタルの円弧
const ARC_W = 9;
const ARC_LEN = (Math.PI / 2) * ARC_R;
const MOON_R = ARC_R - ARC_W / 2 - 1.5;
/** 円弧の帯（h0 時〜h1 時、半径 r0〜r1） */
function band(h0, h1, r0, r1) {
    const a = dir(h0);
    const b = dir(h1);
    return `M${a(r1).join(" ")} A${r1} ${r1} 0 0 1 ${b(r1).join(" ")} L${b(r0).join(" ")} A${r0} ${r0} 0 0 0 ${a(r0).join(" ")}Z`;
}
const arcD = () => `M${dir(3)(ARC_R).join(" ")} A${ARC_R} ${ARC_R} 0 0 1 ${dir(6)(ARC_R).join(" ")}`;
/** 三日月（形は変わらないので一度だけ作る） */
const MOON = (() => {
    const outer = [];
    const inner = [];
    const N = 48;
    for (let k = 0; k <= N; k++) {
        const t = k / N;
        const h = 2 + 10 * t;
        const w = 10 * Math.sin(Math.PI * t);
        outer.push(dir(h)(MOON_R));
        inner.unshift(dir(h)(MOON_R - w));
    }
    return pts([...outer, ...inner]);
})();
let uid = 0;
/** 状態から図を作る。polyglotMax はそのレベルのポリグロットの最大数 */
export function dial(s, polyglotMax) {
    const col = s.af > 0 ? "var(--dl-af)" : s.ub > 0 ? "var(--dl-ub)" : "var(--dl-off)";
    const level = Math.max(s.af, s.ub);
    const gid = `dl-ele${uid++}`;
    const [x1, y1] = dir(3)(ARC_R);
    const [x2, y2] = dir(6)(ARC_R);
    const ent = s.ent === null ? 0 : Math.min(1, s.ent / 3000);
    const parts = [
        svg("defs", {}, svg("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1, y1, x2, y2 }, svg("stop", { offset: 0, "stop-color": "var(--dl-ele)" }), svg("stop", { offset: 1, "stop-color": "var(--dl-ele2)" }))),
        // エレメンタル：扇のうすい下地と目盛り、円弧
        svg("path", { d: band(3, 6, R + 6, ARC_R + ARC_W / 2), fill: "var(--dl-warm)", opacity: 0.22 }),
        ...[3.75, 4.5, 5.25].map((h) => {
            const d = dir(h);
            const [ax, ay] = d(R + 8);
            const [bx, by] = d(ARC_R - ARC_W / 2);
            return svg("line", { x1: ax, y1: ay, x2: bx, y2: by, stroke: "var(--dl-warm)", "stroke-width": 1, opacity: 0.7 });
        }),
        svg("path", { d: arcD(), fill: "none", stroke: "var(--dl-warm)", "stroke-width": ARC_W }),
    ];
    if (ent > 0)
        parts.push(svg("path", { d: arcD(), fill: "none", stroke: `url(#${gid})`, "stroke-width": ARC_W, "stroke-dasharray": ARC_LEN, "stroke-dashoffset": ARC_LEN * (1 - ent) }));
    parts.push(svg("polygon", { points: MOON, fill: "var(--dl-moon)" }), svg("circle", { cx: 0, cy: 0, r: R, fill: col }));
    // AF/UB の結晶
    [9.75, 10.25, 10.75].forEach((h, i) => {
        const d = dir(h);
        const r0 = 34;
        const r1 = 62;
        const w = 7.5;
        const t = w / 2;
        const on = i < level;
        parts.push(svg("polygon", { points: pts([d(r0), d(r0 + t, w / 2), d(r1 - t, w / 2), d(r1), d(r1 - t, -w / 2), d(r0 + t, -w / 2)]), fill: on ? col : "var(--dl-off)" }));
    });
    // アンブラルハート
    [6.75, 7.25, 7.75].forEach((h, i) => {
        if (i < 3 - s.uh)
            return;
        const d = dir(h);
        const r0 = R + 4;
        const r1 = 70;
        const w = 9;
        const rh = r1 - w;
        const rm = r1 - w / 2;
        const ws = 3.2;
        const rj = rh + (ws / w) * (rm - rh);
        parts.push(svg("polygon", { points: pts([d(r0), d(rj, ws / 2), d(rm, w / 2), d(r1), d(rm, -w / 2), d(rj, -ws / 2)]), fill: "var(--dl-heart)" }));
    });
    // パラドックス
    {
        const d = dir(8.5);
        const r0 = R + 4;
        const r1 = 76;
        const m = (r0 + r1) / 2;
        const w = 19;
        parts.push(svg("polygon", { points: pts([d(m, w / 2), d(r1), d(m, -w / 2)]), fill: s.pa ? "var(--dl-af)" : "var(--dl-off)" }), svg("polygon", { points: pts([d(r0), d(m, w / 2), d(m, -w / 2)]), fill: s.pa ? "var(--dl-pxin)" : "var(--dl-off)" }));
    }
    // ポリグロット
    const y = ARC_R + ARC_W / 2 + 17;
    for (let i = 0; i < polyglotMax; i++) {
        const x = 9 + i * 20;
        const hh = 12.5;
        const w = 8.5;
        parts.push(svg("polygon", { points: pts([[x, y - hh], [x + w, y], [x, y + hh], [x - w, y]]), fill: i < s.pg ? "var(--dl-ele2)" : "var(--dl-off)" }));
    }
    const label = [
        s.af ? `AF${s.af}` : s.ub ? `UB${s.ub}` : "AF/UB なし",
        `アンブラルハート ${s.uh}`,
        s.pa ? "パラドックスあり" : "パラドックスなし",
        `ポリグロット ${s.pg}`,
    ].join("・");
    return svg("svg", { class: "dial", viewBox: "-80 -57 145 150", role: "img", "aria-label": label }, svg("title", {}, label), ...parts);
}
// ---- アストラルソウル（図の右に置く。AF でないときも出す）
// 1 つぶん：正三角形の一辺の真ん中に、一辺がその 1/3 の正三角形をくっつけた形。小さい三角形の先が中央を向く。
// 6 つを正六角形に並べ、12 時から時計回りに点く。それぞれの後ろにグレーの円
const S3 = Math.sqrt(3) / 2;
const SOUL_A = 22; // 大きい三角形の一辺
const SOUL_D = 22; // 中心から、中央側の辺まで
const SOUL_RC = (SOUL_D - (SOUL_A / 3) * S3 + SOUL_D + SOUL_A * S3) / 2; // 後ろの円の中心までの距離
const SOUL_PIECES = [0, 1, 2, 3, 4, 5].map((i) => {
    const d = dir(i * 2);
    const a = SOUL_A;
    const r = SOUL_D;
    return {
        piece: pts([d(r, -a / 2), d(r, -a / 6), d(r - (a / 3) * S3, 0), d(r, a / 6), d(r, a / 2), d(r + a * S3, 0)]),
        disc: d(SOUL_RC),
    };
});
export function soulDial(n) {
    const label = `アストラルソウル ${n}`;
    return svg("svg", { class: "soul", viewBox: "-44 -44 88 88", role: "img", "aria-label": label }, svg("title", {}, label), ...SOUL_PIECES.map(({ disc: [cx, cy] }) => svg("circle", { cx, cy, r: 14, fill: "var(--dl-disc)" })), ...SOUL_PIECES.map(({ piece }, i) => svg("polygon", { points: piece, fill: i < n ? "var(--dl-soul)" : "var(--dl-soul-off)" })));
}
