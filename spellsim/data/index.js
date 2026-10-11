import { ACTIONS } from "./actions.js";
/** 公式サイトのアイコン画像の URL */
export function iconUrl(a) {
    if (!a.icon)
        return undefined;
    return a.icon.includes("/") ? `https://lds-img.finalfantasyxiv.com/${a.icon}` : `https://lds-img.finalfantasyxiv.com/d/${a.icon}.png`;
}
export const actions = ACTIONS;
const byNameJa = new Map(actions.map((a) => [a.nameJa, a]));
const byId = new Map(actions.map((a) => [a.id, a]));
export function actionByNameJa(name) {
    return byNameJa.get(name);
}
export function actionById(id) {
    return byId.get(id);
}
/** アビリティとアイテム（タイマーを持つもの） */
export const abilities = actions.filter((a) => a.kind !== "spell");
