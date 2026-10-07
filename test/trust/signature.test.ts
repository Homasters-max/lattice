// Signatures and keys as LATTICE writes them (G-10, TR-10): Ed25519 by
// `node:crypto` (D-06), checked against RFC 8032 §7.1, test 1; what is signed
// is the UTF-8 text of a hash (G-24).
import { sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicKeyOf, signHash, verifyHash } from "../../src/trust/index.js";
import { keyOfSeed, testKey } from "../support/keys.js";

// RFC 8032 §7.1, test 1: the empty message.
const RFC_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const RFC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdamAGCsQq31Uv+08lkBzoO4XLz2qYjJa8CGmj3B1Ea";
const RFC_SIG = "ed25519:5VZDAMNgrHKQhuLMgG6CioSHfx645dl02HPgZSJJAVVfuIIVkKM7rMYeOXAc-bRr0lv18FlbviRlUUFDjnoQCw";

const HASH = `sha256:${"ab".repeat(32)}`;

describe("signatures and keys (G-10)", () => {
  it("TR-10, LG-10, G-10: a public key is an OpenSSH line and a signature ed25519:<base64url without =>, as RFC 8032 test 1 gives them", () => {
    const key = keyOfSeed(RFC_SEED);
    expect(publicKeyOf(key)).toBe(RFC_KEY);
    expect(signHash("", key)).toBe(RFC_SIG);
    expect(verifyHash("", RFC_SIG, RFC_KEY)).toBe(true);
  });

  it("TR-10, G-10: an OpenSSH line with a comment is the same key", () => {
    expect(verifyHash("", RFC_SIG, `${RFC_KEY} owner@example`)).toBe(true);
  });

});

describe("signing a hash (LG-06, LG-10)", () => {
  it("LG-06, LG-10, G-24: what is signed is the UTF-8 text of the hash, sha256:<hex>", () => {
    const { key } = testKey("alice");
    expect(signHash(HASH, key)).toBe(`ed25519:${sign(null, Buffer.from(HASH, "utf8"), key).toString("base64url")}`);
  });

  it("LG-06, LG-10: Ed25519 is deterministic — the same key and hash give the same signature", () => {
    const { key } = testKey("alice");
    expect(signHash(HASH, key)).toBe(signHash(HASH, key));
  });

  it("LG-06, LG-10: a signature verifies by its own key over its own hash, never by another key or over another hash", () => {
    const [alice, mallory] = [testKey("alice"), testKey("mallory")];
    const sig = signHash(HASH, alice.key);
    expect(verifyHash(HASH, sig, alice.publicKey)).toBe(true);
    expect(verifyHash(HASH, sig, mallory.publicKey)).toBe(false);
    expect(verifyHash(`sha256:${"cd".repeat(32)}`, sig, alice.publicKey)).toBe(false);
  });

});

describe("spellings that are no signature or key (G-10)", () => {
  it("LG-06, LG-10, G-10: a text that is not a signature in the one spelling never verifies", () => {
    const body = RFC_SIG.slice("ed25519:".length);
    expect(Buffer.from(`${body.slice(0, -1)}x`, "base64url")).toEqual(Buffer.from(body, "base64url"));
    const spellings = [
      body, // no prefix
      `ED25519:${body}`,
      `ed25519:${body}==`, // padding
      `ed25519:${body.slice(0, -1)}D`, // trailing bits that are not zero: another spelling of other bytes
      `ed25519:${body.slice(0, -1)}x`, // "w" with a trailing bit set: the same 64 bytes in another spelling
      `ed25519:${body.slice(0, -2)}`, // 63 bytes
      `ed25519:${Buffer.from(RFC_SIG).toString("base64")}`,
      `ed25519:${body.replaceAll("-", "+")}`, // the standard alphabet
      "",
    ];
    for (const sig of spellings) expect(verifyHash("", sig, RFC_KEY), sig).toBe(false);
  });

  it("TR-10, G-10: a text that is not an OpenSSH Ed25519 key never verifies", () => {
    const blob = RFC_KEY.slice("ssh-ed25519 ".length);
    const keys = [
      blob,
      `ssh-rsa ${blob}`,
      `ssh-ed25519 ${blob.slice(0, -4)}`,
      `ssh-ed25519 ${blob.replace("AAAAI", "AAAAJ")}`, // a length the bytes do not have
      `ssh-ed25519 ${blob}=`,
      "",
    ];
    for (const key of keys) expect(verifyHash("", RFC_SIG, key), key).toBe(false);
  });
});
