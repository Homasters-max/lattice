// JSON values and their canonical form (KR-10). The walking skeleton's canon
// sorts keys by UTF-16 code units and prints scalars as ECMAScript does, which
// is RFC 8785 for valid input; refusing -0 and the rest of KR-10 arrives with
// S0-04 (G-16).

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export type JsonObject = { readonly [key: string]: JsonValue };

export const isJsonObject = (v: JsonValue | undefined): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

/** The JSON kind of a value, as a check of a form reports it in `got`: absent, null, array, object, string, number or boolean. */
export const kindOf = (v: JsonValue | undefined): string => (v === undefined ? "absent" : v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** Compares strings by UTF-16 code units, as canon sorts keys (CONVENTIONS.md §5). */
export const compareText = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);

/** The canonical text of a value (RFC 8785). */
export function canon(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (!isJsonObject(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k] ?? null)}`).join(",")}}`;
}
