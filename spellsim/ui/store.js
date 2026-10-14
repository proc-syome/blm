// この端末（ブラウザ）に覚えておく値。プライベートモードなどで使えなくても、画面はそのまま動く。
// URL に入れないもの（人ごとの好み・前回の続き）だけをここに置く。
/**
 * 動作確認用に /verification/ に置いたときは、前回の回しを別の名前で覚える
 * （公開中の版と同じサイトなので、同じ名前だと公開中の版の「前回の回し」を上書きしてしまう）
 */
const VERIFY = typeof location !== "undefined" && location.pathname.includes("/verification/");
/** 使っている名前。値を変えると、今まで覚えていたものが読めなくなるので変えない */
export const KEYS = {
    /** 前回の回し（URL を付けずに開いたときに読む） */
    last: VERIFY ? "spellsim:verification:last" : "spellsim:last",
    /** ライト / ダーク（入口のページとも共有） */
    theme: "blm:theme",
    /** 「設定」を閉じているか */
    options: "blm:spellsim:options",
    /** メモの削除の確認を出さない */
    skipMemoDelete: "blm:spellsim:skip-confirm-memo-delete",
};
export function readStore(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
export function writeStore(key, value) {
    try {
        localStorage.setItem(key, value);
    }
    catch {
        /* 覚えられなくても動く */
    }
}
