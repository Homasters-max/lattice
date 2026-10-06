// The form of a refusal (LG-17, CONVENTIONS.md §2–3, §5–6): a hard check
// returns a Result; a rejection names its rule ID and is made only by
// `reject` from a row of a rule registry.
import { canon, compareText, type JsonValue } from "./json.js";

export type RulePrefix = "PR" | "KR" | "TY" | "RF" | "LG" | "TR" | "RT" | "DP" | "LN" | "BN" | "OB" | "AG" | "ST" | "SL" | "RM" | "GL";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
/** The ID of a row of a rule table; Z-blocks never name a rejection. */
export type RuleId = `${RulePrefix}-${Digit}${Digit}`;

/** Languages of message templates; S0 has only `en` (TR-40). */
export type Lang = "en";

/** A row of a module's rule registry. */
export interface Rule {
  readonly id: RuleId;
  readonly message: { readonly en: string } & { readonly [lang in Lang]?: string };
}

export interface Rejection {
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
}

export type Rejections = readonly [Rejection, ...Rejection[]];

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly rejections: Rejections };

const PLACEHOLDER = /\{(intent|path|expected|got|id)\}/g;

/** The rejection of a rule at a place; the message is the rule's template filled with canonical JSON. */
export function reject(rule: Rule, at: Omit<Rejection, "rule" | "message">): Rejection {
  const fields: { readonly [k: string]: JsonValue | undefined } = at;
  const message = rule.message.en.replace(PLACEHOLDER, (_, name: string) => canon(fields[name] ?? null));
  return { intent: at.intent, rule: rule.id, message, path: at.path, expected: at.expected, got: at.got, ...(at.id === undefined ? {} : { id: at.id }) };
}

const keyOf = (r: Rejection): readonly string[] => [r.intent === null ? "" : `~${r.intent}`, r.path, r.rule, r.id ?? "", canon(r.expected), canon(r.got)];

function compare(a: Rejection, b: Rejection): number {
  const [ka, kb] = [keyOf(a), keyOf(b)];
  const at = ka.findIndex((x, i) => x !== kb[i]);
  return at < 0 ? 0 : compareText(ka[at] ?? "", kb[at] ?? "");
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
