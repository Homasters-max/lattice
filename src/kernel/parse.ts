// The strict parse (KR-10, D-04): input must be I-JSON in UTF-8 with every
// string in NFC, and is refused, never repaired. `parseJson` is the one
// function that parses JSON in the code of LATTICE; `JSON.parse` keeps the last
// of duplicate keys silently, so the parse is own code. It reads the grammar of
// RFC 8259 — a text that is not JSON is refused as a whole at the place given —
// and refuses inside the value, at the JSON Pointer under that place: a key met
// twice, and what canon refuses (canon.ts). It reads with its own stack, so no
// depth of nesting overflows, and the values it gives are frozen.
import { numberRejections, stringRejections } from "./canon.js";
import { hashBytes } from "./hash.js";
import { pointer, serialize, type JsonValue } from "./json.js";
import { refuse, refused, reject, ROOT, type Place, type Rejection, type Result } from "./rejection.js";
import { KR_10 } from "./rules.js";

/** The position in the text, the intent the text sits in and the refusals found so far; local to one parse. */
type Cursor = { readonly text: string; readonly intent: string | null; at: number; readonly found: Rejection[] };

type OpenArray = { readonly kind: "array"; readonly path: string; readonly items: JsonValue[] };
type OpenObject = { readonly kind: "object"; readonly path: string; readonly entries: [string, JsonValue][]; readonly keys: Set<string>; key: string };

/** An array or an object being read: its JSON Pointer and what it holds so far. */
type Open = OpenArray | OpenObject;

/** What reading at a position gives: a value, a container opened, or `undefined` — the text is not JSON there. */
type Read = { readonly value: JsonValue } | { readonly open: Open } | undefined;

const isSpace = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\n" || c === "\r";

/** RFC 8259 §2: skips whitespace; the next character, if any. */
function skip(c: Cursor): string | undefined {
  while (isSpace(c.text[c.at])) c.at++;
  return c.text[c.at];
}

const ESCAPES: { readonly [e: string]: string } = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const HEX4 = /^[0-9a-fA-F]{4}$/;

/** RFC 8259 §7: the escape at the backslash at `c.at`; a lone surrogate escaped is read as it is, and canon refuses it. */
function readEscape(c: Cursor): string | undefined {
  const e = c.text[c.at + 1];
  if (e === "u") {
    const hex = c.text.slice(c.at + 2, c.at + 6);
    if (!HEX4.test(hex)) return undefined;
    c.at += 6;
    return String.fromCharCode(Number.parseInt(hex, 16));
  }
  const s = e === undefined ? undefined : ESCAPES[e];
  if (s !== undefined) c.at += 2;
  return s;
}

/** RFC 8259 §7: the string at the quote at `c.at`; a control character unescaped is not JSON. */
function readString(c: Cursor): string | undefined {
  const parts: string[] = [];
  c.at++;
  for (let start = c.at; ; ) {
    const unit = c.text.charCodeAt(c.at);
    if (Number.isNaN(unit) || unit < 0x20) return undefined;
    if (unit !== 0x22 && unit !== 0x5c) {
      c.at++;
      continue;
    }
    parts.push(c.text.slice(start, c.at));
    if (unit === 0x22) {
      c.at++;
      return parts.join("");
    }
    const escaped = readEscape(c);
    if (escaped === undefined) return undefined;
    parts.push(escaped);
    start = c.at;
  }
}

const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const NUMBER_CHAR = /^[-+.eE0-9]$/;

/** RFC 8259 §6: the number at `c.at`; KR-10 refusals name it as written. */
function readNumber(c: Cursor, path: string): Read {
  const start = c.at;
  while (NUMBER_CHAR.test(c.text[c.at] ?? "")) c.at++;
  const written = c.text.slice(start, c.at);
  if (!NUMBER.test(written)) return undefined;
  const x = Number(written);
  c.found.push(...numberRejections(x, written, { intent: c.intent, path }));
  return { value: x };
}

const LITERALS: readonly (readonly [string, JsonValue])[] = [
  ["true", true],
  ["false", false],
  ["null", null],
];

/** RFC 8259 §3: `true`, `false` or `null` at `c.at`. */
function readLiteral(c: Cursor): Read {
  const hit = LITERALS.find(([word]) => c.text.startsWith(word, c.at));
  if (hit === undefined) return undefined;
  c.at += hit[0].length;
  return { value: hit[1] };
}

function readStringValue(c: Cursor, path: string): Read {
  const s = readString(c);
  if (s === undefined) return undefined;
  c.found.push(...stringRejections(s, { intent: c.intent, path }));
  return { value: s };
}

/** RFC 8259 §4: a member name and its colon; KR-10 refuses a name met twice, and a name canon refuses. */
function readKey(c: Cursor, open: OpenObject): boolean {
  if (skip(c) !== '"') return false;
  const key = readString(c);
  if (key === undefined || skip(c) !== ":") return false;
  c.at++;
  const place = { intent: c.intent, path: pointer(open.path, key) };
  c.found.push(...(open.keys.has(key) ? [reject(KR_10, { ...place, expected: "a key once", got: key })] : stringRejections(key, place)));
  open.keys.add(key);
  open.key = key;
  return true;
}

/** The value of a container read to its end, frozen; an object holds each key once, as its own property. */
const closed = (open: Open): JsonValue =>
  open.kind === "array" ? Object.freeze(open.items) : Object.freeze(Object.fromEntries(open.entries));

/** After `[` or `{` at `c.at`: the container closed at once, or open for its first member. */
function opened(c: Cursor, open: Open): Read {
  c.at++;
  if (skip(c) === (open.kind === "array" ? "]" : "}")) {
    c.at++;
    return { value: closed(open) };
  }
  return open.kind === "array" || readKey(c, open) ? { open } : undefined;
}

/** The value at `c.at`, whose JSON Pointer is `path`. */
function readValue(c: Cursor, path: string): Read {
  const first = skip(c);
  if (first === "[") return opened(c, { kind: "array", path, items: [] });
  if (first === "{") return opened(c, { kind: "object", path, entries: [], keys: new Set(), key: "" });
  if (first === '"') return readStringValue(c, path);
  return first === "-" || (first !== undefined && first >= "0" && first <= "9") ? readNumber(c, path) : readLiteral(c);
}

/** The JSON Pointer of the next member or item of a container. */
const childPath = (open: Open): string => (open.kind === "array" ? pointer(open.path, open.items.length) : pointer(open.path, open.key));

function add(open: Open, value: JsonValue): void {
  if (open.kind === "array") open.items.push(value);
  else open.entries.push([open.key, value]);
}

/** After a member or an item: `,` and the next one, or the close of the container. */
function after(c: Cursor, open: Open): "more" | "closed" | undefined {
  const sep = skip(c);
  c.at++;
  if (sep === (open.kind === "array" ? "]" : "}")) return "closed";
  if (sep !== ",") return undefined;
  return open.kind === "array" || readKey(c, open) ? "more" : undefined;
}

/** The value of a whole JSON text and the refusals inside it, or `undefined` when the text is not JSON. */
function readText(text: string, root: Place): { readonly value: JsonValue; readonly found: readonly Rejection[] } | undefined {
  const c: Cursor = { text, intent: root.intent, at: 0, found: [] };
  const stack: Open[] = [];
  let read = readValue(c, root.path);
  while (read !== undefined) {
    if ("open" in read) {
      stack.push(read.open);
      read = readValue(c, childPath(read.open));
      continue;
    }
    const top = stack.at(-1);
    if (top === undefined) return skip(c) === undefined ? { value: read.value, found: c.found } : undefined;
    add(top, read.value);
    const next = after(c, top);
    if (next === "closed") stack.pop();
    read = next === "more" ? readValue(c, childPath(top)) : next === "closed" ? { value: closed(top) } : undefined;
  }
  return undefined;
}

/**
 * KR-10: the text of UTF-8 bytes, refused at the place the caller names — where the bytes sit in their input — when
 * they are not UTF-8. Bytes are no JSON value: the refusal names them by their hash (CONVENTIONS.md §3.3, Q-19).
 */
export function decodeUtf8(bytes: Uint8Array, place: Place = ROOT): Result<string> {
  try {
    // `ignoreBOM` keeps a byte order mark in the text, where the parse refuses it: by default the decoder drops it — a repair.
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return refuse(reject(KR_10, { ...place, expected: "UTF-8", got: hashBytes(bytes) }));
  }
}

/**
 * KR-10: the value of a JSON text, frozen, or its refusals: the text as a whole at the place the caller names — where
 * the text sits in its input — when it is not JSON; inside it, at the JSON Pointer under that place, what I-JSON in
 * NFC does not admit.
 */
export function parseJson(text: string, place: Place = ROOT): Result<JsonValue> {
  const read = readText(text, place);
  if (read === undefined) return refuse(reject(KR_10, { ...place, expected: "a JSON text", got: text }));
  return refused<JsonValue>(read.found) ?? { ok: true, value: read.value };
}

/** KR-10: the value of JSON in UTF-8 bytes, refused at the place the caller names as `decodeUtf8` and `parseJson` refuse. */
export function parseJsonBytes(bytes: Uint8Array, place: Place = ROOT): Result<JsonValue> {
  const text = decodeUtf8(bytes, place);
  return text.ok ? parseJson(text.value, place) : text;
}

/**
 * KR-10: the value of bytes that are its canonical form (RFC 8785), with those bytes — refused at the place the caller
 * names as `parseJsonBytes` refuses (a byte order mark among them: the decode keeps it, the parse refuses it), and as a
 * whole when they are other bytes of the same value (a carriage return, spaces, another order of keys): never
 * repaired. What it gives is known canonical, so its holder keeps the bytes and never encodes the value again to
 * compare. Bytes are no JSON value: the refusal names the canonical bytes and the bytes given by their hashes
 * (CONVENTIONS.md §3.3).
 */
export function parseCanonical(bytes: Uint8Array, place: Place = ROOT): Result<{ readonly value: JsonValue; readonly bytes: Uint8Array }> {
  const text = decodeUtf8(bytes, place);
  if (!text.ok) return text;
  const value = parseJson(text.value, place);
  if (!value.ok) return value;
  // The parse admits only I-JSON in NFC, so the value has a canonical text; UTF-8 is one to one on such text.
  const canonical = serialize(value.value);
  if (text.value === canonical) return { ok: true, value: { value: value.value, bytes } };
  return refuse(reject(KR_10, { ...place, expected: hashBytes(new TextEncoder().encode(canonical)), got: hashBytes(bytes) }));
}

const LF = 0x0a;

/**
 * KR-10, G-17: the value of a line — canonical bytes and a line feed — with those bytes, refused at the place the
 * caller names as `parseCanonical` refuses. A line without its line feed is cut — its write did not end — and is
 * refused as a whole, named by the hash of its bytes, never repaired.
 */
export function parseCanonicalLine(line: Uint8Array, place: Place = ROOT): Result<{ readonly value: JsonValue; readonly bytes: Uint8Array }> {
  if (line.at(-1) !== LF) return refuse(reject(KR_10, { ...place, expected: "a line ending in a line feed", got: hashBytes(line) }));
  return parseCanonical(line.subarray(0, -1), place);
}
