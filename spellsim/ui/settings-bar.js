// 表の上の設定バー。上の段：レベル・サンプル・全部消す・URL をコピー。
// 下の段：GCD と表示・計算の設定（開閉できる。既定は開いていて、閉じたらこの端末に覚える）
import { LEVELS } from "../sim/index.js";
import { confirmTwice, h, toast } from "./dom.js";
import { app, filled, loadSample, switchLevel, update } from "./state.js";
/** チェックボックスで切り替える設定（並び順どおりに出す） */
const FLAGS = [
    ["mpRegen", "MP自然回復"],
    ["showExtraSpells", "普段使わない魔法も出す"],
    ["free", "制約なしで並べる"],
    ["nDelay", "素詠唱の後もアビリティ（遅れを足す）"],
    ["hideNames", "名前を隠す"],
    ["targets", "2体目の敵を表示"],
    ["details", "アビリティの詳細"],
];
const set = (k, v) => update(() => (app.settings = { ...app.settings, [k]: v }));
function check(k, label) {
    return h("label", { class: "chk" }, h("input", { type: "checkbox", checked: app.settings[k], onchange: (e) => set(k, e.target.checked) }), label);
}
/** 数値の入力欄。範囲外や読めない値は無視 */
function numberField(label, value, attrs, onValue) {
    return h("label", { class: "num" }, label, h("input", { type: "number", value, ...attrs, onchange: (e) => onValue(Number(e.target.value)) }));
}
/**
 * レベルの切り替え（100 / 90）。回しはレベルごとに別物で変換しないので、
 * 回しかタイムラインが入っているときは、もう一度押したら両方を消して切り替える（レベル間で共有しない）
 */
function levelSwitch() {
    const cur = app.settings.level;
    const hasContent = app.rows.some(filled) || app.marks.length > 0;
    return h("div", { class: "level", role: "group", "aria-label": "レベル" }, ...LEVELS.map((lv) => h("button", {
        class: lv === cur ? "on" : undefined,
        "aria-pressed": lv === cur ? "true" : "false",
        title: lv === cur ? `レベル${lv}（今のレベル）` : `レベル${lv} に切り替える（今の回しとタイムラインは消えます）`,
        onclick: () => {
            if (lv === cur)
                return;
            const run = () => update(() => switchLevel(lv));
            if (!hasContent)
                run();
            else
                confirmTwice(`level:${lv}`, `レベル${lv} に切り替えると今の回しとタイムラインは消えます（変換はしません）。もう一度押すと切り替えます`, run);
        },
    }, `Lv${lv}`)));
}
async function copyUrl() {
    try {
        await navigator.clipboard.writeText(location.href);
        toast("URLをコピーしました。このURLを開くと同じ回しが出ます");
    }
    catch {
        toast("コピーできませんでした。アドレスバーのURLを使ってください");
    }
}
/**
 * MP 自然回復の 3 秒周期のずれ。オンの間は 0.5 秒ごとに 0.5 秒ずつ自動で進む（0 → 0.5 → … → 2.5 → 0）。
 * 押すと止まり（そのずれを URL に保存）、もう一度押すとまた進む
 */
function tickShift() {
    const paused = app.phasePaused;
    return h("button", {
        class: `shift${paused ? " paused" : " live"}`,
        title: paused
            ? "ずれを止めています（押すとまた 0.5 秒ごとに進みます）"
            : "MP が回復するタイミング（サーバーの 3 秒周期）のずれ。0.5 秒ごとに進みます（押すと止まります）",
        onclick: () => update(() => {
            app.phasePaused = !paused;
            // 止めたときのずれを保存しておく（URL を開いた人も同じずれで見られる）
            if (app.phasePaused)
                app.settings = { ...app.settings, tickOffset: app.livePhase };
        }),
    }, h("span", { class: "dot", "aria-hidden": "true" }), `ずれ ${app.livePhase.toFixed(1)} 秒`);
}
const OPEN_KEY = "blm:spellsim:options";
function optionsOpen() {
    try {
        return localStorage.getItem(OPEN_KEY) !== "closed";
    }
    catch {
        return true;
    }
}
export function settingsBar() {
    const s = app.settings;
    const gcd = numberField("GCD", s.gcd.toFixed(2), { step: "0.01", min: "1.5", max: "2.5" }, (v) => {
        if (v >= 1 && v <= 3)
            set("gcd", Math.round(v * 100) / 100);
    });
    const [regen, ...rest] = FLAGS.map(([k, label]) => check(k, label));
    const options = h("details", {
        class: "opts",
        ontoggle: (e) => {
            try {
                localStorage.setItem(OPEN_KEY, e.target.open ? "open" : "closed");
            }
            catch {
                /* 覚えられなくても開閉はできる */
            }
        },
    }, h("summary", {}, "設定"), h("div", { class: "optlist" }, gcd, h("span", { class: "regen" }, regen, s.mpRegen ? tickShift() : null), ...rest));
    options.open = optionsOpen();
    return h("div", { class: "settings" }, h("div", { class: "actions" }, levelSwitch(), h("span", { class: "spacer" }), h("button", { title: `レベル${s.level} のサンプルの回しを読む`, onclick: () => update(loadSample) }, "サンプル"), h("button", { onclick: () => confirmTwice("clear", "もう一度押すと全部消します", () => update(() => (app.rows = []))) }, "全部消す"), h("button", { class: "primary", onclick: () => copyUrl() }, "URLをコピー")), options);
}
