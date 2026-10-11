import { confirmDialog, confirmTwice, h } from "./dom.js";
import { app, gcdCs, render, setMarks, update } from "./state.js";
import { KINDS, clampLaneEm, fits, formatTime, insertLane, parseTime, removeLane } from "./timeline.js";
/** ドラッグで動かす単位（1/100 秒）。足す印の長さも同じ */
const STEP = 250;
/** 右端の「+」の列の幅（em）。1列の幅は app.laneEm（見出しの右端をつかんで広げられる） */
const ADD_EM = 1.6;
/** 吹き出しを出している印（marks の番号）、出した直後に文字の欄を選ぶ印 */
let popMark = null;
let focusMark = null;
/** 編集一覧を開いているか */
let editorOpen = false;
/** 前回描いたときの列の数（増減したときに幅を動きで見せる） */
let prevLaneCount = 0;
/** ドラッグを離した直後のクリックで印が増えないようにする */
let draggedAt = 0;
const justDragged = () => Date.now() - draggedAt < 300;
const kindOf = (id) => KINDS.find((k) => k.id === id);
// ---- 印の追加・列の挿入と削除
/** 印を足す（2.5 秒。吹き出しは出さない）。同じ列の次の印にぶつからない長さにする */
function addMark(start, lane) {
    const next = app.marks.filter((m) => m.lane === lane && m.start >= start).reduce((t, m) => Math.min(t, m.start), Infinity);
    const end = Math.min(start + STEP, next);
    if (end <= start)
        return;
    setMarks((m) => (m.push({ start, end, kind: "gimmick", text: "", lane }), m));
}
/** 列の挿入（k の位置。0 なら一番左） */
function addLaneAt(k) {
    update(() => {
        app.marks = insertLane(app.marks, k);
        app.laneTotal += 1;
    });
}
/** 列の削除。印のある列は、もう一度押したら印ごと消す */
function removeLaneAt(k) {
    const run = () => {
        popMark = null;
        update(() => {
            app.marks = removeLane(app.marks, k);
            app.laneTotal = Math.max(0, app.laneTotal - 1);
        });
    };
    const n = app.marks.filter((m) => m.lane === k).length;
    if (n === 0)
        run();
    else
        confirmTwice(`lane:${k}`, `この列にはメモが ${n} 個あります。もう一度押すとメモごと消します`, run);
}
// ---- 表の見出しとセル
/** 見出し：列ごとの「×」（削除）と、列の左端・一番右の「+」（挿入） */
export function timelineHead() {
    const n = app.laneTotal;
    if (n === 0) {
        return h("th", { class: "tlh" }, h("div", { class: "lanehead empty" }, h("span", {}, "タイムライン"), h("button", { class: "ins solo", title: "列を足す", onclick: () => addLaneAt(0) }, "+")));
    }
    const cols = Array.from({ length: n }, (_, k) => h("div", { class: "lh" }, h("button", { class: "ins", title: k === 0 ? "一番左に列を足す" : `${k} 列目と ${k + 1} 列目の間に列を足す`, onclick: () => addLaneAt(k) }, "+"), h("button", { class: "rm", title: `${k + 1} 列目を消す`, onclick: () => removeLaneAt(k) }, "×")));
    const tail = h("div", { class: "lh tail" }, h("button", { class: "ins", title: "一番右に列を足す", onclick: () => addLaneAt(n) }, "+"));
    const grip = h("div", { class: "lanegrip", title: "左右にずらして列の幅を変える", onpointerdown: (e) => startWidthDrag(e) });
    return h("th", { class: "tlh", title: "タイムライン" }, h("div", { class: "lanehead", style: `--lanes:${n}` }, ...cols, tail), grip);
}
/** 見出しの右端をつかんで、列の幅を変える（どの列も同じ幅。今の幅が最小） */
function startWidthDrag(e) {
    if (e.button !== 0)
        return;
    e.preventDefault();
    e.stopPropagation();
    const th = e.target.closest("th");
    const emPx = parseFloat(getComputedStyle(th.closest("table")).fontSize) || 14;
    const x0 = e.clientX;
    const w0 = app.laneEm;
    const n = Math.max(1, app.laneTotal);
    document.body.classList.add("widening");
    const move = (ev) => {
        const w = clampLaneEm(w0 + (ev.clientX - x0) / emPx / n);
        if (w === app.laneEm)
            return;
        app.laneEm = w;
        render();
    };
    const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.classList.remove("widening");
        draggedAt = Date.now();
        update(() => { });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
}
/** 印の帯（その行の部分）。最初の行に文字と上端のつかむ所、最後の行に下端のつかむ所 */
function markLane(m, j, isFirst, isLast, rows) {
    const kind = kindOf(m.kind);
    const cls = ["lane", "mark", `k-${m.kind}`, isFirst ? "first" : "", isLast ? "last" : ""];
    return h("div", {
        class: cls.filter(Boolean).join(" "),
        // 文字は最初の行に置き、印の続く行の高さまで下へはみ出して書く
        style: isFirst ? `--rows:${rows}` : undefined,
        title: `${formatTime(m.start)}〜${formatTime(m.end)} ${kind.label}${m.text ? `：${m.text}` : ""}（押すと編集、つかんで移動）`,
        "data-mark": String(j),
        onpointerdown: (e) => startDrag(e, j, "move"),
        onclick: (e) => e.stopPropagation(),
    }, isFirst ? h("span", { class: "lbl" }, m.text || kind.label) : null, isFirst ? h("div", { class: "grip top", title: "上下にずらして開始を変える（2.5 秒単位）", onpointerdown: (e) => startDrag(e, j, "start") }) : null, isLast ? h("div", { class: "grip bottom", title: "上下にずらして終了を変える（2.5 秒単位）", onpointerdown: (e) => startDrag(e, j, "end") }) : null);
}
/** 押すと印を足すだけの、空いている所 */
function emptyLane(sp, lane) {
    return h("div", {
        class: "lane empty",
        title: sp ? `${formatTime(sp[0])} から始まるメモをこの列に足す` : undefined,
        onclick: (e) => {
            e.stopPropagation();
            if (sp && !justDragged())
                addMark(sp[0], lane);
        },
    });
}
/** 表の各行のタイムラインのセル。行の範囲 [この手の時間, 次の手の時間) に重なる印を、列ごとに帯で出す */
export function timelineCells(results) {
    const count = app.laneTotal;
    const from = prevLaneCount;
    prevLaneCount = count;
    // タイムラインの列が広がるぶん、画面幅の上限も広げる
    document.body.style.setProperty("--tlw", `${count * app.laneEm + ADD_EM}em`);
    document.body.style.setProperty("--lane-w", `${app.laneEm}em`);
    const times = results.map((r) => r.state.time);
    const spans = times.map((t, i) => {
        if (t === null)
            return null;
        const next = times.slice(i + 1).find((x) => x !== null);
        return [t, next ?? t + gcdCs()];
    });
    const hits = (m, sp) => !!sp && m.start < sp[1] && m.end > sp[0];
    const first = app.marks.map((m) => spans.findIndex((sp) => hits(m, sp)));
    const last = app.marks.map((m) => spans.length - 1 - [...spans].reverse().findIndex((sp) => hits(m, sp)));
    return spans.map((sp, i) => {
        const lanes = Array.from({ length: count }, () => null);
        app.marks.forEach((m, j) => {
            if (hits(m, sp))
                lanes[m.lane] = markLane(m, j, first[j] === i, last[j] === i, last[j] - first[j] + 1);
        });
        const cells = lanes.map((l, lane) => l ?? emptyLane(sp, lane));
        // 右端：一番右の列に印がある行だけ「+」を出し、新しい列に印を足せる
        if (count > 0) {
            const full = !!lanes[count - 1];
            cells.push(h("div", {
                class: `lane add${full ? " on" : ""}`,
                title: full ? "右に新しい列を作ってメモを足す" : undefined,
                onclick: (e) => {
                    e.stopPropagation();
                    if (full && sp && !justDragged())
                        addMark(sp[0], count);
                },
            }, full ? "+" : ""));
        }
        return h("td", {
            class: `tl${lanes.some((l) => l) ? "" : " none"}`,
            style: `--lanes:${count}; --from:${from}`,
            title: count === 0 && sp ? `${formatTime(sp[0])} から始まるメモを足す` : undefined,
            onclick: () => count === 0 && sp && !justDragged() && addMark(sp[0], 0),
        }, h("div", { class: "lanes" }, ...cells), 
        // 帯は絶対配置なので、幅はこの空の箱で確保する（列の数が変わったときは少しずつ変える）
        h("div", { class: `tlsp${from !== count ? " anim" : ""}` }));
    });
}
// ---- ドラッグ
/** 1 行ぶん上下に動かすごとに 2.5 秒。本体は移動（左右で列も移る）、上端・下端は伸び縮み */
function startDrag(e, j, mode) {
    if (e.button !== 0)
        return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    const rowPx = target.closest("tr")?.getBoundingClientRect().height || 39;
    const lanePx = (target.closest(".lane")?.getBoundingClientRect().width || 60) + 2;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const orig = { ...app.marks[j] };
    const maxLane = app.laneTotal;
    let moved = false;
    let key = "";
    const move = (ev) => {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4)
            return;
        if (!moved) {
            moved = true;
            document.body.classList.add(mode === "move" ? "moving" : "resizing");
            popMark = null;
            document.getElementById("tlpop")?.remove();
        }
        const steps = Math.round(dy / rowPx);
        const dl = mode === "move" ? Math.round(dx / lanePx) : 0;
        if (`${steps},${dl}` === key)
            return;
        key = `${steps},${dl}`;
        const cand = { ...orig };
        if (mode === "move") {
            cand.start += steps * STEP;
            cand.end += steps * STEP;
            cand.lane = Math.min(maxLane, Math.max(0, orig.lane + dl));
        }
        else {
            cand[mode] += steps * STEP;
            // 短くしすぎない（最低 2.5 秒）
            if (cand.end - cand.start < STEP) {
                if (mode === "start")
                    cand.start = cand.end - STEP;
                else
                    cand.end = cand.start + STEP;
            }
        }
        // 同じ列の他の印と重なるなら止める（移動なら、列を変えずに時間だけ動かすのも試す）
        const tries = mode === "move" ? [cand, { ...cand, lane: orig.lane }] : [cand];
        const ok = tries.find((c) => fits(app.marks, j, c));
        if (ok) {
            app.marks[j] = ok;
            render();
        }
    };
    const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.classList.remove("moving", "resizing");
        if (moved) {
            draggedAt = Date.now();
            setMarks((m) => m);
        }
        else if (mode === "move") {
            // 動かさずに離したら、その場で編集する吹き出しを出す
            popMark = focusMark = j;
            renderPopover();
        }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
}
// ---- 編集の部品（吹き出しと一覧で共通）
const editInput = (cls, value, attrs) => h("input", { class: cls, value, ...attrs });
/** 開始・終了の欄。読めない値は onBad（描き直して元に戻す） */
function timeInput(m, k, onTimes, onBad) {
    return editInput("t", formatTime(m[k]), {
        "aria-label": k === "start" ? "開始" : "終了",
        onchange: (e) => {
            const v = parseTime(e.target.value);
            if (v === null)
                return onBad();
            const t = { start: m.start, end: m.end, [k]: v };
            if (t.end <= t.start)
                t.end = t.start + 100;
            onTimes(t);
        },
    });
}
function kindSelect(kind, cls, onKind) {
    return h("select", { class: cls, "aria-label": "種類", onchange: (e) => onKind(e.target.value) }, ...KINDS.map((k) => {
        const o = h("option", { value: k.id }, k.label);
        o.selected = k.id === kind;
        return o;
    }));
}
const TEXT_PLACEHOLDER = "内容（例：頭割り、ここは動きたい）";
/** 内容の欄（複数行）。打つと行の数に合わせて高さが伸びる */
function textArea(value, attrs) {
    const ta = h("textarea", { class: "text", rows: String(Math.max(1, value.split("\n").length)), ...attrs });
    ta.value = value;
    ta.addEventListener("input", () => fitHeight(ta));
    return ta;
}
function fitHeight(ta) {
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
}
const patchMark = (j, patch) => setMarks((ms) => ((ms[j] = { ...ms[j], ...patch }), ms));
/** メモを消す。誤って押したときのため、消す前に確認する（「今後表示しない」も選べる） */
const deleteMark = (j) => confirmDialog({ message: "このメモを削除しますか？", ok: "削除する", skipKey: "blm:spellsim:skip-confirm-memo-delete" }, () => setMarks((ms) => (ms.splice(j, 1), ms)));
// ---- その場で編集する吹き出し
/**
 * 印を押したときに出す吹き出し。文字は Enter・OK・吹き出しの外を押したときに確定し、Esc で取り消す。
 * 他の項目を変えたときも、打ちかけの文字を一緒に保存する
 */
export function renderPopover() {
    document.getElementById("tlpop")?.remove();
    const j = popMark;
    const m = j === null ? undefined : app.marks[j];
    const anchor = j === null ? null : document.querySelector(`.lane.first[data-mark="${j}"]`);
    if (j === null || !m || !anchor) {
        popMark = null;
        return;
    }
    const typed = () => document.querySelector("#tlpop textarea.text")?.value;
    const commit = (patch, keepOpen = true) => {
        if (!keepOpen)
            popMark = null;
        const t = typed();
        patchMark(j, { ...(t !== undefined ? { text: t } : {}), ...patch });
    };
    const close = () => {
        popMark = null;
        renderPopover();
    };
    // Enter で確定、Shift+Enter で改行（変換中の Enter は変換の確定）
    const text = textArea(m.text, {
        placeholder: TEXT_PLACEHOLDER,
        onkeydown: (e) => {
            const ev = e;
            if (ev.isComposing || ev.keyCode === 229)
                return;
            if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                commit({ text: e.target.value }, false);
            }
            if (ev.key === "Escape")
                close();
        },
    });
    const pop = h("div", { id: "tlpop", class: `tlpop k-${m.kind}`, role: "dialog", "aria-label": "メモの編集" }, text, h("div", { class: "row" }, timeInput(m, "start", (t) => commit(t), renderPopover), h("span", { class: "sep" }, "〜"), timeInput(m, "end", (t) => commit(t), renderPopover), kindSelect(m.kind, "kind", (kind) => commit({ kind })), h("span", { class: "spacer" }), h("button", { class: "del", title: "このメモを消す", "aria-label": "このメモを消す", onclick: () => {
            // 吹き出しは閉じてから確認する（打ちかけの文字は消すので保存しない）
            popMark = null;
            document.getElementById("tlpop")?.remove();
            deleteMark(j);
        },
    }, "×"), h("button", { class: "ok", title: "閉じる（Enter で確定、Shift+Enter で改行、Esc で取り消し）", onclick: () => commit({}, false) }, "OK")));
    document.body.append(pop);
    // 印の最初の行の右に出す。画面からはみ出すなら左や上にずらす
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = r.right + 6 + w > window.innerWidth - 8 ? Math.max(8, r.left - w - 6) : r.right + 6;
    const top = Math.min(r.top, window.innerHeight - pop.offsetHeight - 8);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${Math.max(8, top) + window.scrollY}px`;
    fitHeight(text);
    if (focusMark === j) {
        text.focus();
        text.setSelectionRange(text.value.length, text.value.length);
        focusMark = null;
    }
}
// 吹き出しの外を押したら閉じる（入力中の文字は保存）
document.addEventListener("pointerdown", (e) => {
    const pop = document.getElementById("tlpop");
    if (!pop || pop.contains(e.target) || e.target.closest?.(".lane.mark"))
        return;
    const inp = pop.querySelector("textarea.text");
    const j = popMark;
    popMark = null;
    if (inp && j !== null && app.marks[j] && inp.value !== app.marks[j].text)
        patchMark(j, { text: inp.value });
    else
        pop.remove();
});
// ---- 設定の下の編集一覧（開閉できる）
export function timelineEditor() {
    const item = (m, j) => h("div", { class: "tl-item", "data-mark": String(j) }, timeInput(m, "start", (t) => patchMark(j, t), render), h("span", { class: "sep" }, "〜"), timeInput(m, "end", (t) => patchMark(j, t), render), kindSelect(m.kind, `kind k-${m.kind}`, (kind) => patchMark(j, { kind })), textArea(m.text, { placeholder: TEXT_PLACEHOLDER, onchange: (e) => patchMark(j, { text: e.target.value }) }), h("button", { class: "del", title: "このメモを消す", onclick: () => deleteMark(j) }, "×"));
    const el = h("details", { class: "tl-edit", ontoggle: (e) => (editorOpen = e.target.open) }, h("summary", {}, `タイムライン・メモ（${app.marks.length}）`), h("div", { class: "tl-list" }, 
    // 足した順のまま（並べ替えない）
    ...app.marks.map(item), h("div", { class: "tl-foot" }, h("button", { onclick: () => addMark(app.marks.reduce((t, m) => Math.max(t, m.end), 0), 0) }, "＋ メモを追加"), h("span", { class: "hint" }, "表の「タイムライン」列の空いている所を押すと、その手の時間から始まるメモを足せます。メモはつかんで上下（2.5 秒単位）・左右（列）に動かせます。列の幅は見出しの右端をつかんで広げられます。内容は改行できます（表の上の吹き出しでは Shift+Enter）。時間は 1:23.4 や 83.4 の形で。"))));
    el.open = editorOpen;
    return el;
}
