// KR-11: the canonical scalar formats; a value in another spelling is refused.
// A date is a proleptic Gregorian calendar date, years 0000…9999; a date-time
// is that date with a time in UTC — hours 00…23, minutes and seconds 00…59,
// no leap second (G-21) — and exactly six fraction digits; a ULID is at most
// 128 bits, its first character at most `7` (G-07).
import type { JsonValue } from "./json.js";
import { reject, type Place, type Rejection } from "./rejection.js";
import { KR_11 } from "./rules.js";

export type Format = "date-time" | "date" | "decimal" | "ulid";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `YYYY-MM-DD`, a day that exists in its month. */
function isDate(s: string): boolean {
  const [, y, m, d] = DATE.exec(s) ?? [];
  const [year, month, day] = [Number(y), Number(m), Number(d)];
  const days = month === 2 && isLeap(year) ? 29 : DAYS[month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

/** `<date>T<time>Z` with exactly six fraction digits. */
const isDateTime = (s: string): boolean => s.length === 27 && s[10] === "T" && isDate(s.slice(0, 10)) && TIME.test(s.slice(11));

const SPELLINGS: { readonly [format in Format]: (s: string) => boolean } = {
  "date-time": isDateTime,
  date: isDate,
  decimal: (s) => DECIMAL.test(s) && s !== "-0",
  ulid: (s) => ULID.test(s),
};

/** KR-11: whether a string is the canonical spelling of the format. */
export const isFormat = (format: Format, s: string): boolean => SPELLINGS[format](s);

/** KR-06, KR-11: a ULID — 26 upper-case Crockford base32 characters, at most 128 bits (G-07). */
export const isUlid = (s: string): boolean => isFormat("ulid", s);

/** KR-11: a value of the format, refused at the place the caller names — a value that is not a string too. */
export function checkFormat(format: Format, value: JsonValue, place: Place): Rejection[] {
  return typeof value === "string" && isFormat(format, value) ? [] : [reject(KR_11, { ...place, expected: format, got: value })];
}
