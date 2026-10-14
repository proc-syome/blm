// SpellSim の画面の入口。状態が変わるたびに回し全体を計算し直し、画面を作り直す。
//   state.ts         状態・保存（URL は url.ts、この端末に覚えるものは store.ts）
//   settings-bar.ts  設定バー
//   table.ts         スキル回しの表（cells.ts：状態の列 / picker.ts：選択欄 / labels.ts：アイコンと印 /
//                    recast-view.ts：アビリティの選択肢のリキャスト）
//   timeline-view.ts タイムライン・メモ（データは timeline.ts）
//   dial.ts          ゲージを図で表示（丸い図）
//   compare-view.ts  スキル回しを比べる（見出しの右のボタンで出し入れ）
//   theme.ts         ライト / ダークの切り替え・「ヒント」へのリンク（hint.html：計算の決まりの説明）
import { damageReport, simulate } from "../sim/index.js";
import { h } from "./dom.js";
import { compareView, mountCompareToggle } from "./compare-view.js";
import { settingsBar } from "./settings-bar.js";
import { app, gcdCs, loadFrom, loadInitial, redo, setRenderer, undo, update } from "./state.js";
import { rotationTable } from "./table.js";
import { mountHintLink, mountThemeToggle } from "./theme.js";
import { GCD_MIN } from "./url.js";
import { renderPopover, timelineEditor } from "./timeline-view.js";
function render() {
    const { settings } = app;
    // GCD が下限より小さい（スマホの数字の入力などで入る）ときは、表を出さずにエラーだけ出す
    if (!(settings.gcd >= GCD_MIN)) {
        document.body.classList.remove("wide");
        document.getElementById("tlpop")?.remove();
        document.getElementById("app").replaceChildren(settingsBar(), h("p", { class: "warn gcderr" }, `GCD は ${GCD_MIN.toFixed(2)} 以上にしてください（${GCD_MIN.toFixed(2)} より短くできる装備は今のところありません）。`));
        return;
    }
    const results = simulate(app.rows, { ...settings, tickOffset: app.livePhase, nWeave: settings.nDelay ? "delay" : "forbid" });
    // 詳細列やダメージの列を出すときは列が多いので、幅の上限を外す
    document.body.classList.toggle("wide", settings.details || settings.damage);
    document.body.classList.toggle("icons-only", settings.hideNames);
    const damage = settings.damage ? damageReport(results, gcdCs()) : null;
    const table = rotationTable(results, damage);
    // ポリグロットを最大のまま捨てた回数（エノキアンの周期・アンプリファイア）
    const lost = results.reduce((n, r) => n + r.pgLost, 0);
    const cmp = compareView(results);
    document.getElementById("app").replaceChildren(settingsBar(), timelineEditor(), ...(cmp ? [cmp] : []), ...(table.invalidCount > 0 ? [h("p", { class: "warn" }, `使えないものが入っている手が ${table.invalidCount} 個あります（赤い行）`)] : []), ...(lost > 0 ? [h("p", { class: "warn soft" }, `ポリグロットが ${lost} 個あふれています（${settings.dial ? "ゲージの図の横" : "ポリグロットの列"}の印）`)] : []), table.el);
    renderPopover();
}
mountThemeToggle();
mountCompareToggle();
mountHintLink();
setRenderer(render);
loadInitial();
update(() => { });
/** 入力欄で文字を打っている最中か（チェックボックスは除く） */
const typing = () => {
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox";
};
/** 選択欄の一覧・メモの吹き出し・確認の箱のどれかを開いているか */
const popupOpen = () => !!(document.getElementById("pickmenu") || document.getElementById("tlpop") || document.getElementById("modal"));
// ---- MP 自然回復のずれを、0.5 秒ごとに 0.5 秒進めて描き直す（保存はしない）。
// 入力中・一覧や吹き出しを開いている間・ドラッグ中・画面が隠れている間は進めない（操作のじゃまをしないため）
const busy = () => {
    if (typing() || popupOpen())
        return true;
    return document.hidden || /\b(moving|resizing|widening)\b/.test(document.body.className);
};
setInterval(() => {
    if (!app.settings.mpRegen || app.phasePaused || busy())
        return;
    app.livePhase = (Math.round(app.livePhase * 2 + 1) % 6) / 2;
    render();
}, 500);
// ---- 元に戻す（Ctrl+Z / ⌘Z）・やり直し（Ctrl+Y / Ctrl+Shift+Z）。入力欄の中では、その欄の文字の取り消しを優先する
document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey)
        return;
    if (typing() || popupOpen())
        return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
    }
    else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
    }
});
window.addEventListener("hashchange", () => {
    if (loadFrom(location.hash))
        update(() => { });
});
