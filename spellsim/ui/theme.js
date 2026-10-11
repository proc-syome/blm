// ライト（ローズミルク）/ ダーク（プラム）の切り替え。最初は端末の設定に合わせ、
// ボタンで選んだらこの端末に覚えておく（URL には入れない。人ごとの好みなので）
import { h, svg } from "./dom.js";
/** 同じサイトのほかのページとも共有する */
const KEY = "blm:theme";
function saved() {
    try {
        const v = localStorage.getItem(KEY);
        return v === "light" || v === "dark" ? v : null;
    }
    catch {
        return null;
    }
}
const system = () => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const current = () => document.documentElement.dataset.theme ?? saved() ?? system();
const sun = () => svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("circle", { cx: 8, cy: 8, r: 3 }), svg("path", { d: "M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" }));
const moon = () => svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("path", { d: "M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3Z" }));
function apply(t, btn) {
    document.documentElement.dataset.theme = t;
    // 今と逆のほうへ切り替えるボタン
    const next = t === "dark" ? "ライト" : "ダーク";
    btn.replaceChildren(t === "dark" ? sun() : moon(), next);
    btn.title = `${next}モードに切り替える`;
    btn.setAttribute("aria-label", btn.title);
}
/** 見出しの右に切り替えボタンを置く */
export function mountThemeToggle() {
    const header = document.querySelector("header.top");
    if (!header)
        return;
    const btn = h("button", { type: "button", class: "themetoggle" });
    btn.addEventListener("click", () => {
        const t = current() === "dark" ? "light" : "dark";
        try {
            localStorage.setItem(KEY, t);
        }
        catch {
            /* 覚えられなくても切り替えはできる */
        }
        apply(t, btn);
    });
    apply(current(), btn);
    header.append(btn);
}
