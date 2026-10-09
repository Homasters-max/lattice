// Ed25519 signatures and keys (TR-10, TR-12; D-06: `node:crypto`) as LATTICE
// writes them in records (G-10): a signature is `ed25519:<base64url without
// =>`, a public key an OpenSSH line `ssh-ed25519 AAAA…`. What is signed is the
// UTF-8 text of a hash, `sha256:<hex>` (KR-12; G-24): the hash of a commit
// (LG-06), of a proposal (LG-10) or of a session for its certificate (TR-11).
// The functions are pure: a key comes as a parameter — `cli` reads key files,
// never this module; it reads the text of one (Q-04).
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

/** A public key of a session or a participant (TR-10): an OpenSSH line `ssh-ed25519 <base64> [comment]`. */
export type PublicKey = string;

/** The private key of a session that signs (TR-12), as the platform holds it; the caller makes it from its file. */
export type SessionKey = ReturnType<typeof createPrivateKey>;

const SIGNATURE = "ed25519:";
const ALGORITHM = "ssh-ed25519";
const SIGNATURE_BYTES = 64;
const KEY_BYTES = 32;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/** Base64 without its padding; `url` — the alphabet of RFC 4648 §5. */
function encode(bytes: Uint8Array, url: boolean): string {
  const text = toBase64(bytes);
  return url ? text.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : text;
}

/** The bytes of base64 text, or `null` where the text is not the one spelling `encode` writes for them. */
function decode(text: string, url: boolean): Uint8Array | null {
  // Within these alphabets and lengths `atob` refuses nothing; the spelling check is the round trip below.
  const fits = url ? /^[A-Za-z0-9_-]*$/.test(text) && text.length % 4 !== 1 : /^[A-Za-z0-9+/]*={0,2}$/.test(text) && text.length % 4 === 0;
  if (!fits) return null;
  const bytes = Uint8Array.from(atob(url ? text.replaceAll("-", "+").replaceAll("_", "/") : text), (c) => c.charCodeAt(0));
  return encode(bytes, url) === text ? bytes : null;
}

/** G-10: the bytes of a signature written `ed25519:<base64url>`, or `null` for any other text. */
function signatureBytes(sig: string): Uint8Array | null {
  if (!sig.startsWith(SIGNATURE)) return null;
  const bytes = decode(sig.slice(SIGNATURE.length), true);
  return bytes?.length === SIGNATURE_BYTES ? bytes : null;
}

/** An SSH wire string (RFC 4251 §5): a 32-bit big-endian length and the bytes. */
function wire(parts: readonly Uint8Array[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) out.push((p.length >>> 24) & 255, (p.length >>> 16) & 255, (p.length >>> 8) & 255, p.length & 255, ...p);
  return Uint8Array.from(out);
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** RFC 8709: the raw Ed25519 key an OpenSSH line holds, or `null` where the line is not one. */
function rawKey(key: PublicKey): Uint8Array | null {
  const [algorithm, blob] = key.split(" ");
  if (algorithm !== ALGORITHM || blob === undefined) return null;
  const bytes = decode(blob, false);
  if (bytes === null) return null;
  const raw = bytes.slice(bytes.length - KEY_BYTES);
  const same = wire([utf8(ALGORITHM), raw]);
  return same.length === bytes.length && same.every((b, i) => b === bytes[i]) ? raw : null;
}

/** TR-10: whether a text is an Ed25519 public key in OpenSSH format, `ssh-ed25519 <base64> [comment]`. */
export const isPublicKey = (key: string): boolean => rawKey(key) !== null;

/** G-10: the OpenSSH line of the public key of a session key — what a certificate names (TR-11). */
export function publicKeyOf(key: SessionKey): PublicKey {
  const { x } = createPublicKey(key).export({ format: "jwk" });
  const raw = x === undefined ? null : decode(x, true);
  if (raw === null) throw new Error("bug: a session key is not an Ed25519 key");
  return `${ALGORITHM} ${encode(wire([utf8(ALGORITHM), raw]), false)}`;
}

/** LG-06, LG-10: the signature, by a session key, of a hash `sha256:<hex>` (G-24). */
export function signHash(hash: string, key: SessionKey): string {
  return `${SIGNATURE}${encode(sign(null, utf8(hash), key), true)}`;
}

/** LG-06, LG-10: whether `sig` is the signature of `hash` by the key; a text that is no signature or no key never is. */
export function verifyHash(hash: string, sig: string, key: PublicKey): boolean {
  const bytes = signatureBytes(sig);
  const raw = rawKey(key);
  if (bytes === null || raw === null) return false;
  const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: encode(raw, true) }, format: "jwk" });
  return verify(null, utf8(hash), publicKey, bytes);
}

/** A reader of the SSH wire format (RFC 4251 §5): 32-bit big-endian integers and strings of that length. */
function reader(bytes: Uint8Array) {
  let at = 0;
  const uint32 = (): number | null => {
    if (at + 4 > bytes.length) return null;
    const n = bytes.slice(at, at + 4).reduce((sum, b) => sum * 256 + b, 0);
    at += 4;
    return n;
  };
  const string = (): Uint8Array | null => {
    const n = uint32();
    if (n === null || at + n > bytes.length) return null;
    at += n;
    return bytes.slice(at - n, at);
  };
  return { uint32, string };
}

const text = (bytes: Uint8Array | null): string | null => (bytes === null ? null : new TextDecoder().decode(bytes));
const same = (a: Uint8Array | null, b: Uint8Array) => a !== null && a.length === b.length && a.every((x, i) => x === b[i]);

const MAGIC = "openssh-key-v1\0";
const ARMOR = /^-----BEGIN OPENSSH PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n-----END OPENSSH PRIVATE KEY-----\r?\n?$/;

/** PROTOCOL.key of OpenSSH: the private section of a key file that holds one key, unencrypted, or `null`. */
function privateSection(bytes: Uint8Array): Uint8Array | null {
  if (text(bytes.slice(0, MAGIC.length)) !== MAGIC) return null;
  const r = reader(bytes.slice(MAGIC.length));
  const [cipher, kdf, options, count, publicBlob] = [text(r.string()), text(r.string()), r.string(), r.uint32(), r.string()];
  if (cipher !== "none" || kdf !== "none" || options?.length !== 0 || count !== 1 || publicBlob === null) return null;
  return r.string();
}

/** The seed and the public key of the one Ed25519 key of a private section, or `null`. */
function ed25519Of(section: Uint8Array): { readonly seed: Uint8Array; readonly raw: Uint8Array } | null {
  const r = reader(section);
  const [check, again, type, raw, pair] = [r.uint32(), r.uint32(), text(r.string()), r.string(), r.string()];
  if (check === null || check !== again || type !== ALGORITHM || raw?.length !== KEY_BYTES || pair?.length !== 2 * KEY_BYTES) return null;
  return same(pair.slice(KEY_BYTES), raw) ? { seed: pair.slice(0, KEY_BYTES), raw } : null;
}

/**
 * Q-04: the Ed25519 key of an unencrypted OpenSSH private key file — the format `ssh-keygen` writes — with which a
 * participant signs the certificate of its session (TR-11); `null` for any other text, an encrypted file too.
 */
export function readOpenSshKey(file: string): SessionKey | null {
  const body = ARMOR.exec(file)?.[1];
  const bytes = body === undefined ? null : decode(body.replace(/\r?\n/g, ""), false);
  const section = bytes === null ? null : privateSection(bytes);
  const found = section === null ? null : ed25519Of(section);
  if (found === null) return null;
  const jwk = { kty: "OKP", crv: "Ed25519", d: encode(found.seed, true), x: encode(found.raw, true) };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  // The public key a file names is the one its seed gives; a file where they differ is no key of that name.
  return same(rawKey(publicKeyOf(key)), found.raw) ? key : null;
}
