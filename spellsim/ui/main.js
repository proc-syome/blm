// SpellSim の画面の入口。状態が変わるたびに回し全体を計算し直し、画面を作り直す。
//   state.ts        状態・保存（URL と localStorage）
//   settings-bar.ts 設定バー
//   table.ts        スキル回しの表（cells.ts：状態の列 / picker.ts：選択欄 / labels.ts：アイコンと印）
//   timeline-view.ts タイムライン・メモ
//   theme.ts        ライト / ダークの切り替え
import { simulate } from "../sim/index.js";
import { h } from "./dom.js";
import { settingsBar } from "./settings-bar.js";
import { app, loadFrom, loadInitial, setRenderer, update } from "./state.js";
import { rotationTable } from "./table.js";
import { mountThemeToggle } from "./theme.js";
import { renderPopover, timelineEditor } from "./timeline-view.js";
function render() {
    const { settings } = app;
    const results = simulate(app.rows, { ...settings, tickOffset: app.livePhase, nWeave: settings.nDelay ? "delay" : "forbid" });
    // 詳細列を出すときは列が多いので、幅の上限を外す
    document.body.classList.toggle("wide", settings.details);
    document.body.classList.toggle("icons-only", settings.hideNames);
    const table = rotationTable(results);
    document.getElementById("app").replaceChildren(settingsBar(), timelineEditor(), ...(table.invalidCount > 0 ? [h("p", { class: "warn" }, `使えないものが入っている手が ${table.invalidCount} 個あります（赤い行）`)] : []), table.el);
    renderPopover();
}
mountThemeToggle();
setRenderer(render);
loadInitial();
update(() => { });
// MP 自然回復のずれを、0.5 秒ごとに 0.5 秒進めて描き直す（保存はしない）。
// 入力中・一覧や吹き出しを開いている間・ドラッグ中・画面が隠れている間は進めない（操作のじゃまをしないため）
const busy = () => {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
        return true;
    if (document.getElementById("pickmenu") || document.getElementById("tlpop") || document.getElementById("modal"))
        return true;
    return document.hidden || /\b(moving|resizing|widening)\b/.test(document.body.className);
};
setInterval(() => {
    if (!app.settings.mpRegen || app.phasePaused || busy())
        return;
    app.livePhase = (Math.round(app.livePhase * 2 + 1) % 6) / 2;
    render();
}, 500);
window.addEventListener("hashchange", () => {
    if (loadFrom(location.hash))
        update(() => { });
});
