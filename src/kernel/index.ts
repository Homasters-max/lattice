// The kernel (KR-01): Record, Canon, Type, Schema and Ref — pure, importing no
// other module (KR-02). Every file it reaches is listed in
// test/structure/kernel-files.txt (ST-05).
export { canon } from "./canon.js";
export { checkFormat, isFormat, isUlid, type Format } from "./formats.js";
export { BODY_LIMIT, hash, hashBytes, hashRecord } from "./hash.js";
export { compareText, gotOf, isJsonObject, type JsonObject, type JsonValue } from "./json.js";
export { checkId, isEntityId, type Kind } from "./id.js";
export { parseJson, parseJsonBytes } from "./parse.js";
export { checkHeader, checkRev, type Record } from "./record.js";
export { formatRef, parseRef, type Ref } from "./ref.js";
export {
  refuse,
  refused,
  reject,
  sortRejections,
  type Place,
  type Rejection,
  type Rejections,
  type Result,
  type Rule,
} from "./rejection.js";
export { KR_04, KR_06, KR_07, KR_08, KR_10, KR_11, KR_13, KR_23, KR_24, RULES } from "./rules.js";
export { checkUri, isUri } from "./uri.js";
export { KERNEL_VERSION } from "./version.js";
