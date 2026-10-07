// JSON values and how they are written (KR-10, RFC 8785). `serialize` writes
// any JSON value as RFC 8785 does: keys sorted by UTF-16 code units, numbers
// as ECMAScript prints them, strings escaped as JCS. It refuses nothing — it is
// the writer under `canon`, which first refuses what KR-10 does not admit, and
// the printer of values in rejection messages, whose `got` may be exactly such
// a value. It walks with its own stack, so no depth of nesting overflows.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

export const isJsonObject = (v: JsonValue | undefined): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

/** The member of an object under a key — its own, never one of `Object.prototype`: a field may be named `constructor`. */
export const own = (o: JsonObject, key: string): JsonValue | undefined => (Object.hasOwn(o, key) ? o[key] : undefined);

/** An array of JSON values — `Array.isArray` narrows to `any[]`. */
export const isJsonArray = (v: JsonValue | undefined): v is readonly JsonValue[] => Array.isArray(v);

/** `got` of a check of a form (CONVENTIONS.md §3): the value that came, or the description "absent" for a field that has none. */
export const gotOf = (v: JsonValue | undefined): JsonValue => (v === undefined ? "absent" : v);

/** Compares strings by UTF-16 code units, as canon sorts keys (CONVENTIONS.md §5). */
export const compareText = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

/** The JSON Pointer (RFC 6901) of a member or an item under `path`. */
export const pointer = (path: string, key: string | number): string => `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;

const SHORT: { readonly [c: string]: string } = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

// RFC 8785 §3.2.2.2: `"`, `\` and the controls are escaped; so is a lone surrogate, which only a message holds — canon refuses it.
const ESCAPED = /["\\]|[^\u0020-\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

const escape = (c: string): string => SHORT[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** RFC 8785 §3.2.2.2: a string as JCS writes it. */
const quote = (s: string): string => `"${s.replace(ESCAPED, escape)}"`;

/** RFC 8785 §3.2.2.1, §3.2.2.3: the literals, and a number by the ECMAScript rule. */
const scalar = (v: null | boolean | number | string): string => (typeof v === "string" ? quote(v) : String(v));

/** A part of writing: text to emit, or a value to expand into parts. */
type Part = { readonly text: string } | { readonly value: JsonValue };

/** The parts of one value, in the order they are written. */
function partsOf(value: JsonValue): Part[] {
  if (typeof value !== "object" || value === null) return [{ text: scalar(value) }];
  if (!isJsonObject(value)) {
    return [{ text: "[" }, ...value.flatMap((v, i): Part[] => (i === 0 ? [{ value: v }] : [{ text: "," }, { value: v }])), { text: "]" }];
  }
  const members = Object.keys(value)
    .sort(compareText)
    .flatMap((k, i): Part[] => [{ text: `${i === 0 ? "" : ","}${quote(k)}:` }, { value: value[k] ?? null }]);
  return [{ text: "{" }, ...members, { text: "}" }];
}

/** RFC 8785: the canonical text of a value KR-10 admits; any other value is written in the same form, unchecked. */
export function serialize(value: JsonValue): string {
  const out: string[] = [];
  const pending: Part[] = [{ value }];
  for (let part = pending.pop(); part !== undefined; part = pending.pop()) {
    if ("text" in part) {
      out.push(part.text);
      continue;
    }
    const parts = partsOf(part.value);
    for (let i = parts.length - 1; i >= 0; i--) pending.push(parts[i] as Part);
  }
  return out.join("");
}
