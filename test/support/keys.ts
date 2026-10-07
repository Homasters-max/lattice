// Session keys of the tests (TR-12): Ed25519 keys derived from a name, so a
// test and a fixture name a key and every run signs the same bytes (Ed25519
// is deterministic). Not secret and never a key of a real session; the dev
// keys of `std` and of the stores of tests are those of `test/keys/` (Q-04,
// S0-16, S0-24).
import { createHash, createPrivateKey } from "node:crypto";
import { publicKeyOf, type PublicKey, type SessionKey } from "../../src/trust/index.js";

/** RFC 8410: the PKCS #8 header of an Ed25519 private key, before its 32-byte seed. */
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

export type TestKey = { readonly key: SessionKey; readonly publicKey: PublicKey };

/** An Ed25519 private key by its 32-byte seed in hex (RFC 8032 §5.1.5), as the vectors of RFC 8032 give it. */
export function keyOfSeed(hex: string): SessionKey {
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(hex, "hex")]), format: "der", type: "pkcs8" });
}

/** The key of the session the tests call `name`, from the seed sha256(`lattice test key <name>`). */
export function testKey(name: string): TestKey {
  const key = keyOfSeed(createHash("sha256").update(`lattice test key ${name}`).digest("hex"));
  return { key, publicKey: publicKeyOf(key) };
}
