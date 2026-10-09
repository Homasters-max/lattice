// Signatures and keys as LATTICE writes them (G-10, TR-10): Ed25519 by
// `node:crypto` (D-06), checked against RFC 8032 §7.1, test 1; what is signed
// is the UTF-8 text of a hash (G-24); the key file a participant signs with is
// an unencrypted OpenSSH file (Q-04).
import { sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isPublicKey, publicKeyOf, readOpenSshKey, signHash, verifyHash } from "../../src/trust/index.js";
import { owned } from "../support/files.js";
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

// An OpenSSH key file of ssh-keygen encrypted with a passphrase, and one of an ECDSA key: neither is the key file of
// Q-04. Generated once for this test; neither key signs anything.
const ENCRYPTED = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABBsrRJ3qO
wvCTljnHbcqLnQAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAIEZFW50Yfw4Nzxva
0k2Kb/bHN9+MlKdyvlP1ZAAXZjehAAAAkCaC5Grp+EQBiYi7hndEH7OKo5RayeFMNlSeJL
N3M8jf8IjZk2qTtyZmjb+ltc33sFK1xfOVh1M4W0nsXRU8kme+1pJiODefcRA+rUjEOg8y
hmSQnjoSJ6JAanF7/XM3y2iAXfwrribZV3JBdea/GIqNwquBYr7RDhducMy9C4eO5Rc55G
x1hB4AEg9x7hPd2g==
-----END OPENSSH PRIVATE KEY-----
`;
const ECDSA = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAaAAAABNlY2RzYS
1zaGEyLW5pc3RwMjU2AAAACG5pc3RwMjU2AAAAQQR6WolIhFO81NT3P+tBMUfO9oblig51
MNDQrh127LgEkkSDndsZyn9y7H6vFzwcj/iVUlqkXk3C3Zyr4rv/5t2MAAAAoBRqzqEUas
6hAAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBHpaiUiEU7zU1Pc/
60ExR872huWKDnUw0NCuHXbsuASSRIOd2xnKf3Lsfq8XPByP+JVSWqReTcLdnKviu//m3Y
wAAAAhAMdsa0MTQk/r6xvscgu6dgY5TvtIm+FJvy788NcpLv7sAAAABWVjZHNhAQI=
-----END OPENSSH PRIVATE KEY-----
`;

/** The OpenSSH line of a `.pub` file without its comment. */
const lineOf = (pub: string) => pub.split(" ").slice(0, 2).join(" ");

describe("OpenSSH key files (Q-04)", () => {
  it("TR-10, Q-04: the dev keys of test/keys are unencrypted Ed25519 OpenSSH files, each the key its .pub names", () => {
    for (const name of ["dev-owner", "dev-land"]) {
      const key = readOpenSshKey(owned.text(`test/keys/${name}`));
      expect(key, name).not.toBeNull();
      expect(publicKeyOf(key!)).toBe(lineOf(owned.text(`test/keys/${name}.pub`).trim()));
      expect(isPublicKey(owned.text(`test/keys/${name}.pub`).trim())).toBe(true);
    }
  });

  it("TR-11, Q-04: a key read from its file signs as the key itself, with CRLF line ends too", () => {
    const text = owned.text("test/keys/dev-owner");
    const key = readOpenSshKey(text.replaceAll("\n", "\r\n"))!;
    expect(verifyHash(HASH, signHash(HASH, key), lineOf(owned.text("test/keys/dev-owner.pub")))).toBe(true);
  });

  it("Q-04: an encrypted file, a key that is not Ed25519 and a text that is no key file are no key", () => {
    const text = owned.text("test/keys/dev-owner");
    const body = text.split("\n").slice(1, -2).join("");
    const bytes = Buffer.from(body, "base64");
    const flipped = Buffer.from(bytes);
    // The public half of the private pair, the last copy of the public key in the file, flipped: the pair is no longer that key.
    const raw = Buffer.from(lineOf(owned.text("test/keys/dev-owner.pub")).split(" ")[1]!, "base64").subarray(-32);
    const at = bytes.lastIndexOf(raw);
    flipped[at] = (flipped[at] ?? 0) ^ 1;
    const armored = (b: Buffer) => `-----BEGIN OPENSSH PRIVATE KEY-----\n${b.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----\n`;
    for (const file of [ENCRYPTED, ECDSA, "", text.replace("OPENSSH", "RSA"), armored(flipped), armored(bytes.subarray(0, 100))]) {
      expect(readOpenSshKey(file), file).toBeNull();
    }
    expect(readOpenSshKey(armored(bytes))).not.toBeNull();
  });

  it("TR-10: an OpenSSH line names a key; other text does not", () => {
    expect([isPublicKey(RFC_KEY), isPublicKey(`${RFC_KEY} with a comment`), isPublicKey(`ssh-rsa ${RFC_KEY.slice(12)}`), isPublicKey("")]).toEqual([true, true, false, false]);
  });
});
