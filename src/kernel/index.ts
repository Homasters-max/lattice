// The kernel (KR-01): Record, Canon, Type, Schema and Ref — pure, importing no
// other module (KR-02). Every file it reaches is listed in
// test/structure/kernel-files.txt (ST-05).
export { checkAgainstType } from "./against-type.js";
export { canon } from "./canon.js";
export { closedForm, JSON_VALUE, NUMBER, STRING, STRING_OR_NULL, type Member, type Members, type MembersOf } from "./closed-form.js";
export { compare, type Comparison, type Mode, type Relation } from "./compare.js";
export type { Aspect } from "./compare-shown.js";
export { checkFormat, isFormat, isUlid, type CanonicalFormat, type Format } from "./formats.js";
export { BODY_LIMIT, hash, hashBytes, hashRecord } from "./hash.js";
export { compareText, gotOf, isJsonObject, serialize, type JsonObject, type JsonValue } from "./json.js";
export { checkId, isEntityId, type Kind } from "./id.js";
export { decodeUtf8, parseCanonical, parseCanonicalLine, parseJson, parseJsonBytes } from "./parse.js";
export { checkHeader, type Record } from "./record.js";
export { formatRef, isPinned, parseRef, type Ref } from "./ref.js";
export {
  isId,
  isIdLike,
  isRuleId,
  isZBlockId,
  refuse,
  refused,
  reject,
  rejectionsOf,
  ROOT,
  sortRejections,
  type Place,
  type Rejection,
  type Rejections,
  type Result,
  type Rule,
} from "./rejection.js";
export { META_TYPE, type MetaType } from "./meta-type.js";
export { KR_04, KR_06, KR_07, KR_08, KR_10, KR_11, KR_13, KR_14, KR_15, KR_16, KR_18, KR_19, KR_21, KR_23, KR_24, RULES } from "./rules.js";
export { checkSchema, type Schema } from "./schema.js";
export type { ResolveType, Type } from "./type.js";
export { checkUri, isUri } from "./uri.js";
export { validate, type Violation, type Violations } from "./validate.js";
export { valuesOf, type ValueAt } from "./values-of.js";
export { KERNEL_VERSION } from "./version.js";
