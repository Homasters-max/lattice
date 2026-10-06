// JSON values and their canonical form (KR-10). The walking skeleton's canon
// sorts keys by UTF-16 code units and prints scalars as ECMAScript does, which
// is RFC 8785 for valid input; the strict parser and the refusals of KR-10
// arrive with S0-04.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

const isObject = (v: JsonValue): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

/** The canonical text of a value (RFC 8785). */
export function canon(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k] ?? null)}`).join(",")}}`;
}

/** The value of a JSON text. The skeleton takes what JSON.parse takes; S0-04 refuses what KR-10 refuses. */
export function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw new Error("not in the walking skeleton: refusing a text that is not JSON (KR-10) arrives with S0-04");
  }
}
