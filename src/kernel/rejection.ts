// The form of a refusal (LG-17, CONVENTIONS.md §2–3, §5–6): a hard check
// returns a Result and takes the Place where its input sits; a rejection
// names its rule ID and is made only by `reject` from a row of a rule
// registry. The grammar of an ID (RM-02) is written here once, beside
// `RuleId`: the codec reads `md` by it.
import { compareText, serialize, type JsonValue } from "./json.js";

type RulePrefix = "PR" | "KR" | "TY" | "RF" | "LG" | "TR" | "RT" | "DP" | "LN" | "BN" | "OB" | "AG" | "ST" | "SL" | "RM" | "GL";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
/** The ID of a row of a rule table; Z-blocks never name a rejection. Every `RuleId` is of the grammar `isRuleId` reads. */
type RuleId = `${RulePrefix}-${Digit}${Digit}`;

// RM-02: `<PREFIX>-<NN>` for a rule, `<PREFIX>-Z<NN>` for prose and examples. Whether the prefix is its document's
// is checked by `lint-ids` on the text, where the file name is known (S0-01).
const RULE_ID = /^[A-Z]{2}-\d{2}$/;
const Z_BLOCK_ID = /^[A-Z]{2}-Z\d{2}$/;
/** What an author meant as an ID: letters, a dash, maybe one letter, digits. */
const ID_LIKE = /^[A-Za-z]+-[A-Za-z]?\d+$/;

/** RM-02: the ID of a rule, `<PREFIX>-<NN>`. */
export const isRuleId = (s: string): boolean => RULE_ID.test(s);

/** RM-02: the ID of prose or an example — a Z-block, which never names a rejection — `<PREFIX>-Z<NN>`. */
export const isZBlockId = (s: string): boolean => Z_BLOCK_ID.test(s);

/** RM-01, RM-02: the ID of a paragraph, which is a rule or prose. */
export const isId = (s: string): boolean => isRuleId(s) || isZBlockId(s);

/** RM-02: whether a string was meant as an ID — refused by RM-02 when it is not of the grammar. */
export const isIdLike = (s: string): boolean => ID_LIKE.test(s);

/** Languages of message templates; S0 has only `en` (TR-40). */
type Lang = "en";

/** A row of a module's rule registry. */
export type Rule = {
  readonly id: RuleId;
  readonly message: { readonly en: string } & { readonly [lang in Lang]?: string };
};

export type Rejection = {
  /** The `id` written in the intent, as written; `null` when the rejection is not about an intent (G-13). */
  readonly intent: string | null;
  readonly rule: RuleId;
  readonly message: string;
  /** A JSON Pointer (RFC 6901) inside the intent, or from the root of the input. */
  readonly path: string;
  readonly expected: JsonValue;
  readonly got: JsonValue;
  /** For a duplicate: the `id` it collided with (LG-17). */
  readonly id?: string;
};

/** Where a check refuses: the intent it is about, or `null`, and a JSON Pointer (G-13). */
export type Place = Pick<Rejection, "intent" | "path">;

/** The root of the checked input, outside any intent (G-13). */
export const ROOT: Place = { intent: null, path: "" };

export type Rejections = readonly [Rejection, ...Rejection[]];

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly rejections: Rejections };

const PLACEHOLDER = /\{(intent|path|expected|got|id)\}/g;

/** The rejection of a rule at a place; the message is the rule's template filled with canonical JSON. */
export function reject(rule: Rule, place: Omit<Rejection, "rule" | "message">): Rejection {
  const fields: { readonly [k: string]: JsonValue | undefined } = place;
  const message = rule.message.en.replace(PLACEHOLDER, (_, name: string) => serialize(fields[name] ?? null));
  return { intent: place.intent, rule: rule.id, message, path: place.path, expected: place.expected, got: place.got, ...(place.id === undefined ? {} : { id: place.id }) };
}

const keyOf = (r: Rejection): readonly string[] => [r.intent === null ? "" : `~${r.intent}`, r.path, r.rule, r.id ?? "", serialize(r.expected), serialize(r.got)];

function compare(a: Rejection, b: Rejection): number {
  const [ka, kb] = [keyOf(a), keyOf(b)];
  const first = ka.findIndex((x, i) => x !== kb[i]);
  return first < 0 ? 0 : compareText(ka[first] ?? "", kb[first] ?? "");
}

/** CONVENTIONS.md §5: by intent (null first), path, rule, id, then canonical expected and got. */
export function sortRejections(rejections: readonly Rejection[]): Rejection[] {
  return [...rejections].sort(compare);
}

/** A refused Result with these rejections, sorted. */
export function refuse<T>(first: Rejection, ...rest: readonly Rejection[]): Result<T> {
  const [head = first, ...tail] = sortRejections([first, ...rest]);
  return { ok: false, rejections: [head, ...tail] };
}

/** A refused Result, or `null` when there is nothing to refuse. */
export function refused<T>(rejections: readonly Rejection[]): Result<T> | null {
  const [first, ...rest] = rejections;
  return first === undefined ? null : refuse<T>(first, ...rest);
}

/** The rejections of a Result; none when it is ok. */
export const rejectionsOf = (result: Result<unknown>): readonly Rejection[] => (result.ok ? [] : result.rejections);
