// 小さな DOM ヘルパー（フレームワークは使わない）
/**
 * 要素を作る。attrs の on〜 はイベント、true は属性だけ付ける、false / undefined は付けない。
 * children の null / undefined / false は無視する
 */
export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === false)
            continue;
        if (typeof v === "function")
            el.addEventListener(k.replace(/^on/, ""), v);
        else if (v === true)
            el.setAttribute(k, "");
        else
            el.setAttribute(k, String(v));
    }
    for (const c of children)
        if (c !== null && c !== undefined && c !== false)
            el.append(c);
    return el;
}
const SVG_NS = "http://www.w3.org/2000/svg";
/** SVG の要素を作る（属性は文字列か数値） */
export function svg(tag, attrs = {}, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs))
        el.setAttribute(k, String(v));
    el.append(...children);
    return el;
}
/** 画面の下に短いお知らせを出す */
export function toast(msg) {
    const t = h("div", { class: "toast", role: "status" }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2500);
}
/** 一定時間内にもう一度押されたら実行する（消す操作の確認用）。key ごとに別々に数える */
export function confirmTwice(key, message, run) {
    if (armed !== key) {
        armed = key;
        toast(message);
        setTimeout(() => armed === key && (armed = null), 3000);
        return;
    }
    armed = null;
    run();
}
let armed = null;
/**
 * 確認のメッセージボックス（消す操作の前など）。「今後このメッセージを表示しない」に印を付けて OK したら、
 * 次からは聞かずに実行する（skipKey ごとに、この端末に覚える）
 */
export function confirmDialog(opts, run) {
    const skipped = (() => {
        try {
            return localStorage.getItem(opts.skipKey) === "1";
        }
        catch {
            return false;
        }
    })();
    if (skipped)
        return run();
    document.getElementById("modal")?.remove();
    const prev = document.activeElement;
    const skip = h("input", { type: "checkbox" });
    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        prev?.focus?.();
    };
    const accept = () => {
        if (skip.checked) {
            try {
                localStorage.setItem(opts.skipKey, "1");
            }
            catch {
                /* 覚えられなくても実行はする */
            }
        }
        close();
        run();
    };
    const okBtn = h("button", { class: "danger", onclick: accept }, opts.ok);
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    };
    const overlay = h("div", { id: "modal", class: "modal", onpointerdown: (e) => e.target === overlay && close() }, h("div", { class: "box", role: "alertdialog", "aria-modal": "true", "aria-label": opts.message }, h("p", { class: "msg" }, opts.message), h("label", { class: "skip" }, skip, "今後このメッセージを表示しない"), h("div", { class: "btns" }, h("button", { onclick: close }, "キャンセル"), okBtn)));
    document.body.append(overlay);
    document.addEventListener("keydown", onKey, true);
    okBtn.focus();
}
