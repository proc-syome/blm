// 計算（src/sim）の入口。画面やテストはここから読む。外部依存も DOM も使わない。
export * from "./types.js";
export { kitFor, LEVELS, DEFAULT_LEVEL } from "../data/level.js";
export { simulate, initialState, castTime, cs, isWait, EMPTY_ROW, underLines, weaveOverruns } from "./engine.js";
export { actionOptions, abilityOptions, allActionNames, allAbilityLabels, resolveCast } from "./options.js";
export { parseCast, castLabel, splitLabel } from "./label.js";
export { mpCost } from "./rules.js";
export { damageReport, elementMultiplier, sortByDamage } from "./damage.js";
export { summarize } from "./summary.js";
