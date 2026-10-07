// External links (KR-24): a `format: uri` value is not a reference; the kernel
// checks only that it is an absolute URI — the `URI` of RFC 3986 §3: a scheme
// is required and a fragment is allowed (G-06). Nothing is resolved,
// normalised or fetched.
import type { JsonValue } from "./json.js";
import { reject, type Place, type Rejection } from "./rejection.js";
import { KR_24 } from "./rules.js";

// RFC 3986 §2: unreserved, sub-delims and a percent-encoded octet.
const UNRESERVED = "A-Za-z0-9\\-._~";
const SUB_DELIMS = "!$&'()*+,;=";
const PCT = "%[0-9A-Fa-f]{2}";

/** RFC 3986 §3.3: path characters — pchar and `/`; §3.4, §3.5: a query and a fragment add `?`. */
const PATH = new RegExp(`^(?:[${UNRESERVED}${SUB_DELIMS}:@/]|${PCT})*$`);
const QUERY = new RegExp(`^(?:[${UNRESERVED}${SUB_DELIMS}:@/?]|${PCT})*$`);

/** RFC 3986 §3: `scheme ":" hier-part [ "?" query ] [ "#" fragment ]`, split before the parts are checked. */
const PARTS = /^([A-Za-z][A-Za-z0-9+.-]*):([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s;

/** RFC 3986 §3.2: `[ userinfo "@" ] host [ ":" port ]`; a host is an IP literal or a reg-name (an IPv4 address too). */
const AUTHORITY = new RegExp(`^(?:(?:[${UNRESERVED}${SUB_DELIMS}:]|${PCT})*@)?(\\[[^\\]]*\\]|(?:[${UNRESERVED}${SUB_DELIMS}]|${PCT})*)(?::[0-9]*)?$`);

/** RFC 3986 §3.2.2: `IPvFuture = "v" 1*HEXDIG "." 1*( unreserved / sub-delims / ":" )`. */
const IP_FUTURE = new RegExp(`^v[0-9A-Fa-f]+\\.[${UNRESERVED}${SUB_DELIMS}:]+$`);

const H16 = /^[0-9A-Fa-f]{1,4}$/;
const IPV4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

/** The 16-bit groups of one side of `::`, an IPv4 address as the last counted as two; `null` when a group is broken. */
function groups(s: string, last: boolean): number | null {
  if (s === "") return 0;
  const parts = s.split(":");
  const tail = parts[parts.length - 1] ?? "";
  const ipv4 = last && IPV4.test(tail);
  const h16 = ipv4 ? parts.slice(0, -1) : parts;
  return h16.every((p) => H16.test(p)) ? h16.length + (ipv4 ? 2 : 0) : null;
}

/** RFC 3986 §3.2.2: an IPv6 address — eight groups, or fewer around one `::`. */
function isIpv6(s: string): boolean {
  const halves = s.split("::");
  if (halves.length > 2) return false;
  const [head = "", tail] = halves;
  const counts = tail === undefined ? [groups(head, true)] : [groups(head, false), groups(tail, true)];
  if (counts.some((c) => c === null)) return false;
  const total = counts.reduce<number>((a, c) => a + (c ?? 0), 0);
  return tail === undefined ? total === 8 : total < 8;
}

/** RFC 3986 §3.2: an authority, with an IP literal checked inside its brackets. */
function isAuthority(s: string): boolean {
  const host = AUTHORITY.exec(s)?.[1];
  if (host === undefined) return false;
  if (!host.startsWith("[")) return true;
  const literal = host.slice(1, -1);
  return IP_FUTURE.test(literal) || isIpv6(literal);
}

/** RFC 3986 §3: `"//" authority path-abempty`, or a path without an authority. */
function isHierPart(s: string): boolean {
  if (!s.startsWith("//")) return PATH.test(s);
  const slash = s.indexOf("/", 2);
  const [authority, path] = slash < 0 ? [s.slice(2), ""] : [s.slice(2, slash), s.slice(slash)];
  return isAuthority(authority) && PATH.test(path);
}

/** KR-24: whether a string is an absolute URI — a scheme, then a hier-part, a query and a fragment (G-06). */
export function isUri(s: string): boolean {
  const [, , hier, query, fragment] = PARTS.exec(s) ?? [];
  if (hier === undefined) return false;
  return isHierPart(hier) && QUERY.test(query ?? "") && QUERY.test(fragment ?? "");
}

/** KR-24: an absolute URI, refused at the place the caller names — a value that is not a string too. */
export function checkUri(value: JsonValue, place: Place): Rejection[] {
  return typeof value === "string" && isUri(value) ? [] : [reject(KR_24, { ...place, expected: "an absolute URI", got: value })];
}
