// アクションのデータの入口：アクション・アビリティの一覧と、名前・ID からの引き方。
import { ACTIONS } from "./actions.js";
/** 公式サイトのアイコン画像の URL */
export function iconUrl(a) {
    if (!a.icon)
        return undefined;
    return a.icon.includes("/") ? `https://lds-img.finalfantasyxiv.com/${a.icon}` : `https://lds-img.finalfantasyxiv.com/d/${a.icon}.png`;
}
export const actions = ACTIONS;
const byNameJa = new Map(actions.map((a) => [a.nameJa, a]));
export function actionByNameJa(name) {
    return byNameJa.get(name);
}
/** アビリティとアイテム（タイマーを持つもの） */
export const abilities = actions.filter((a) => a.kind !== "spell");
