// Ed25519 signatures and keys (TR-10, TR-12; D-06: `node:crypto`) as LATTICE
// writes them in records (G-10): a signature is `ed25519:<base64url without
// =>`, a public key an OpenSSH line `ssh-ed25519 AAAA…`. What is signed is the
// UTF-8 text of a hash, `sha256:<hex>` (KR-12; G-24): the hash of a commit
// (LG-06) or of a proposal (LG-10). The functions are pure: a key comes as a
// parameter — `cli` reads key files, never this module.
import { createPublicKey, sign, verify, type createPrivateKey } from "node:crypto";

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
