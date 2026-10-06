// The kernel (KR-01): Record, Canon, Type, Schema and Ref — pure, importing no
// other module (KR-02). Every file it reaches is listed in
// test/structure/kernel-files.txt (ST-05).
export { hash, hashRecord } from "./hash.js";
export { canon, parseJson, type JsonObject, type JsonValue } from "./json.js";
export { checkId, isEntityId, isUlid, type Kind, type Record } from "./record.js";
export {
  refused,
  reject,
  sortRejections,
  type Lang,
  type Rejection,
  type Rejections,
  type Result,
  type Rule,
  type RuleId,
} from "./rejection.js";
export { KR_06, RULES } from "./rules.js";
export { KERNEL_VERSION } from "./version.js";
