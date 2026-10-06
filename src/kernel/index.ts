// The kernel (KR-01): Record, Canon, Type, Schema and Ref — pure, importing no
// other module (KR-02). Every file it reaches is listed in
// test/structure/kernel-files.txt (ST-05).
export { hash, hashBytes, hashRecord } from "./hash.js";
export { canon, compareText, gotOf, isJsonObject, type JsonObject, type JsonValue } from "./json.js";
export { decodeUtf8, parseJson } from "./parse.js";
export { checkHeader, checkId, isEntityId, isUlid, type Kind, type Record } from "./record.js";
export {
  refuse,
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
export { KR_04, KR_06, KR_10, RULES } from "./rules.js";
export { KERNEL_VERSION } from "./version.js";
