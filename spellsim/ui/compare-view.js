// スキル回しを比べる：今の回し（A）と、URL を貼った回し（B）のまとめを横に並べる。
// 見出しの右（ライト / ダークの左）のボタンで出し入れする（既定は出さない。覚えない）。
// B は覚えておくだけで保存しない（ページを開き直すと消える）。「今の回しを B に」で今の回しを写しておけば、
// A を手直ししながら前の版と比べられる。「入れ替える」で B を開いて編集できる（A は B 側に回る）。
import { simulate, summarize } from "../sim/index.js";
import { h, svg, toast } from "./dom.js";
import { centis, mmss } from "./format.js";
import { app, gcdCs, loadFrom, update } from "./state.js";
import { headTools } from "./theme.js";
import { decode, encode } from "./url.js";
/** 比べる回し（URL の # 以降）。無ければ null */
let other = null;
let open = false;
/** 貼られた文字から # 以降を取り出す（URL でも # 以降だけでもよい） */
function hashOf(text) {
    const t = text.trim();
    const hash = t.includes("#") ? t.slice(t.indexOf("#") + 1) : t;
    return decode(hash) ? hash : null;
}
const currentHash = () => encode(app.rows, app.settings, app.marks, app.laneTotal, app.laneEm);
/** 比べる回しを計算する（その回しのレベル・GCD・設定で） */
function simulateOther(hash) {
    const d = decode(hash);
    if (!d)
        return null;
    const st = d.settings;
    const results = simulate(d.rows, { ...st, nWeave: st.nDelay ? "delay" : "forbid" });
    return { summary: summarize(results, Math.round(st.gcd * 100)), level: st.level, gcd: st.gcd };
}
const num = (x) => (x === null ? "—" : Math.round(x).toLocaleString("ja-JP"));
const time = (cs) => (cs === null ? "—" : `${mmss(cs)}${centis(cs)}`);
/** 差（B − A）。数字の差がある項目だけ */
function diff(a, b, fmt = (x) => num(x)) {
    if (a === null || b === null)
        return h("td", { class: "d" });
    const d = b - a;
    if (Math.abs(d) < 0.5)
        return h("td", { class: "d same" }, "±0");
    return h("td", { class: `d ${d > 0 ? "up" : "down"}` }, `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`);
}
function table(a, aLevel, aGcd, b) {
    const row = (label, va, vb, d) => h("tr", {}, h("th", {}, label), h("td", {}, va), h("td", {}, vb), d ?? h("td", { class: "d" }));
    const B = b?.summary;
    const rows = [
        row("レベル", String(aLevel), b ? String(b.level) : "—", null),
        row("GCD", aGcd.toFixed(2), b ? b.gcd.toFixed(2) : "—", null),
        row("手の数", String(a.casts), B ? String(B.casts) : "—", B ? diff(a.casts, B.casts) : null),
        row("終わる時刻", time(a.end), B ? time(B.end) : "—", B ? diff(a.end, B.end, (x) => `${(x / 100).toFixed(2)} 秒`) : null),
        row("ダメージ合計", num(a.total), B ? num(B.total) : "—", B ? diff(a.total, B.total) : null),
        row("DPS", num(a.dps), B ? num(B.dps) : "—", B ? diff(a.dps, B.dps) : null),
        row("ポリグロットのあふれ", String(a.pgLost), B ? String(B.pgLost) : "—", B ? diff(a.pgLost, B.pgLost) : null),
    ];
    // 魔法ごとの回数（両方の合計が多い順）
    const names = new Set([...a.counts.keys(), ...(B ? B.counts.keys() : [])]);
    const spells = [...names].sort((x, y) => (B?.counts.get(y) ?? 0) + (a.counts.get(y) ?? 0) - ((B?.counts.get(x) ?? 0) + (a.counts.get(x) ?? 0)));
    const head = h("tr", { class: "sec" }, h("th", { colspan: "4" }, "魔法の回数"));
    const spellRows = spells.map((n) => {
        const ca = a.counts.get(n) ?? 0;
        const cb = B?.counts.get(n) ?? 0;
        return row(n, String(ca), B ? String(cb) : "—", B ? diff(ca, cb) : null);
    });
    return h("table", { class: "cmptable" }, h("thead", {}, h("tr", {}, h("th", {}), h("th", {}, "今の回し（A）"), h("th", {}, "比べる回し（B）"), h("th", {}, "差（B − A）"))), h("tbody", {}, ...rows, head, ...spellRows));
}
const icon = () => svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("path", { d: "M2.5 5h9M9 2.5 11.5 5 9 7.5M13.5 11h-9M7 8.5 4.5 11 7 13.5" }));
let toggle = null;
/** 見出しの右（ライト / ダークの左）に「スキル回しを比べる」のボタンを置く */
export function mountCompareToggle() {
    const box = headTools();
    if (!box)
        return;
    toggle = h("button", {
        type: "button",
        class: "themetoggle cmptoggle",
        onclick: () => {
            open = !open;
            update(() => { });
        },
    });
    box.prepend(toggle);
    syncToggle();
}
function syncToggle() {
    if (!toggle)
        return;
    toggle.replaceChildren(icon(), "スキル回しを比べる", other ? h("span", { class: "bdot", title: "B あり" }) : "");
    toggle.setAttribute("aria-pressed", String(open));
    toggle.title = open ? "比べる欄を閉じる" : "2つのスキル回しを比べる";
}
/** 「スキル回しを比べる」の欄（閉じているときは null）。resultsA は今の回しの計算結果 */
export function compareView(resultsA) {
    syncToggle();
    if (!open)
        return null;
    const a = summarize(resultsA, gcdCs());
    const b = other ? simulateOther(other) : null;
    const input = h("input", {
        type: "text",
        class: "cmpurl",
        placeholder: "比べる回しの URL を貼る",
        "aria-label": "比べる回しの URL",
        onchange: (e) => {
            const el = e.target;
            if (!el.value.trim())
                return;
            const hash = hashOf(el.value);
            if (!hash)
                return toast("SpellSim の URL として読めませんでした");
            other = hash;
            update(() => { });
        },
    });
    const buttons = h("div", { class: "cmpbtns" }, h("button", {
        title: "今の回しを B に写す（このあと A を手直しして、前の版と比べられます）",
        onclick: () => {
            other = currentHash();
            update(() => { });
        },
    }, "今の回しを B に"), h("button", {
        title: "B を開いて編集する（今の回しは B 側に回ります）",
        disabled: !other,
        onclick: () => {
            if (!other)
                return;
            const next = other;
            other = currentHash();
            update(() => loadFrom(next));
        },
    }, "入れ替える"), h("button", {
        disabled: !other,
        onclick: () => {
            other = null;
            update(() => { });
        },
    }, "B を消す"));
    return h("section", { class: "cmp" }, h("div", { class: "cmphead" }, h("h2", {}, "スキル回しを比べる"), h("button", { type: "button", class: "cmpclose", title: "閉じる", "aria-label": "閉じる", onclick: () => { open = false; update(() => { }); } }, "×")), h("div", { class: "cmpbody" }, h("div", { class: "cmpin" }, input, buttons), h("p", { class: "hint" }, "ダメージは威力 × AF/UB の倍率だけの簡易な値です。B はこの画面を閉じると消えます（保存はされません）。"), table(a, app.settings.level, app.settings.gcd, b)));
}
