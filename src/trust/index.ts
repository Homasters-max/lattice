// trust (ST-01): namespace policy, certificates and signatures, bases, in
// force, standing, facts and verdicts — pure rules over records. S0-10 brings
// signatures and keys (G-10); the rest arrives with S0-14 and S0-16.
export { publicKeyOf, signHash, verifyHash, type PublicKey, type SessionKey } from "./signature.js";
