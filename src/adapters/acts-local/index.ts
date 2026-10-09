// `acts-local` (TR-14, Q-04): acts without a forge (GL-09, TR-41). A local act
// is a git commit or an annotated tag on the change request, signed by SSH,
// whose message ends with the trailer `Lattice-Act: <verb> <target>` — one act
// per trailer — and holds the text of an answer before its trailers. The
// commits of a change request are those on it and not on `base`; a tag counts
// where it points at one of them. The signature is checked by
// `git verify-commit` or `git verify-tag` against allowed signers made of the
// keys the caller gives — those of the writers of the policy — and of no other:
// git runs without the configuration of the machine, and the check sets every
// key that changes what verifies over that of the repository, so no allowed
// signers, revoked keys, program or trust level of either reaches it. The identity of an act is
// the fingerprint of the key that signed it (TR-09), the act is `verified`
// only where that key is allowed (TR-16), and its source time is the time of
// the commit or tag, which its author sets (TR-11). A commit or tag without a
// signature is no local act; a GPG signature is read on demand (Q-04), until
// then none is (G-55).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Act, Acts } from "../../ledger/ports/acts.js";

export type ActsLocalOptions = {
  /** The git repository whose branches are the change requests. */
  readonly dir: string;
  /** The ref change requests merge into: a commit on it is no change request's (LG-22). */
  readonly base: string;
  /** The OpenSSH public keys of the writers of the policy (TR-10): the only allowed signers. */
  readonly keys: readonly string[];
};

type Ran = { readonly status: number; readonly stdout: string; readonly stderr: string };

const MAX_BUFFER = 1 << 26;

/** A repository and the environment git runs in there. */
type Repo = { readonly dir: string; readonly env: NodeJS.ProcessEnv };

/**
 * G-55: the environment of git without the configuration of the machine — no system file, an empty global one, none
 * passed through the environment. The configuration of the repository (`.git/config`) git still reads: what of it
 * changes what verifies the check sets over it (`settingsOfCheck`).
 */
function isolated(global: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_CONFIG")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: global };
}

function run(repo: Repo, args: readonly string[]): Promise<Ran> {
  return new Promise((resolve) => {
    execFile("git", ["-C", repo.dir, ...args], { env: repo.env, encoding: "utf8", maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ status: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
    });
  });
}

/** The output of a git command that must succeed; a failure of git is a failure of the outside world (CONVENTIONS.md §2.3). */
async function output(repo: Repo, args: readonly string[]): Promise<string> {
  const ran = await run(repo, args);
  if (ran.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${ran.stderr.trim()}`);
  return ran.stdout;
}

const VERBS: ReadonlySet<string> = new Set(["approve", "answer", "acknowledge"]);
const TRAILER = /^Lattice-Act:[ \t]*(\S+)[ \t]+(\S(?:.*\S)?)[ \t]*$/;
const SSH_SIGNATURE = "-----BEGIN SSH SIGNATURE-----";
const GPG_SIGNATURE = "-----BEGIN PGP SIGNATURE-----";

/** A commit or a tag as git stores it: its header lines, its message and its signature, if it has one. */
type Signed = { readonly kind: "commit" | "tag"; readonly id: string; readonly head: readonly string[]; readonly message: string; readonly signature: string | null };

/** The signature of a commit: the header `gpgsig`, its lines continued by a leading space. */
function commitSignature(head: readonly string[]): string | null {
  const start = head.findIndex((l) => l.startsWith("gpgsig ") || l.startsWith("gpgsig-sha256 "));
  if (start < 0) return null;
  const rest = head.slice(start + 1);
  const end = rest.findIndex((l) => !l.startsWith(" "));
  const lines = [head[start] ?? "", ...(end < 0 ? rest : rest.slice(0, end))];
  return lines.map((l, i) => (i === 0 ? l.slice(l.indexOf(" ") + 1) : l.slice(1))).join("\n");
}

function parsed(kind: Signed["kind"], id: string, raw: string): Signed {
  const blank = raw.indexOf("\n\n");
  const head = (blank < 0 ? raw : raw.slice(0, blank)).split("\n");
  const body = blank < 0 ? "" : raw.slice(blank + 2);
  if (kind === "commit") return { kind, id, head, message: body, signature: commitSignature(head) };
  // A tag carries its signature after its message.
  const at = [SSH_SIGNATURE, GPG_SIGNATURE].map((s) => body.indexOf(s)).find((i) => i >= 0) ?? -1;
  return { kind, id, head, message: at < 0 ? body : body.slice(0, at), signature: at < 0 ? null : body.slice(at) };
}

/**
 * The fingerprint of the key in an SSH signature — PROTOCOL.sshsig: the magic "SSHSIG", a version of 4 bytes, then
 * the public key as a string, its length in 4 bytes before it — or `null` for one that holds no key so.
 */
function signerOf(signature: string): string | null {
  if (!signature.startsWith(SSH_SIGNATURE)) return null;
  const blob = Buffer.from(signature.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""), "base64");
  const length = blob.length < 14 ? 0 : blob.readUInt32BE(10);
  const key = blob.subarray(14, 14 + length);
  if (blob.subarray(0, 6).toString("latin1") !== "SSHSIG" || length === 0 || key.length !== length) return null;
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

/** KR-11: the time of the commit or tag — of its committer or tagger — as a `date-time` in UTC with microseconds. */
function timeOf(s: Signed): string {
  const who = s.kind === "commit" ? "committer " : "tagger ";
  const line = s.head.find((l) => l.startsWith(who)) ?? "";
  const seconds = /\s(\d+)\s[+-]\d{4}$/.exec(line)?.[1];
  if (seconds === undefined) throw new Error(`git ${s.kind} ${s.id} has no ${who.trim()} time`);
  return new Date(Number(seconds) * 1000).toISOString().replace(/Z$/, "000Z");
}

/** The paragraphs of a message: its trailers are the last one, after at least one other. */
const paragraphs = (message: string): string[] => message.trim().split(/\n[ \t]*\n/);

/** The `Lattice-Act` trailers of a message, as verb and target; a verb TR-14 does not name is no act. */
function trailersOf(message: string): { readonly verb: Act["verb"]; readonly target: string }[] {
  const parts = paragraphs(message);
  if (parts.length < 2) return [];
  const found = (parts.at(-1) ?? "").split("\n").flatMap((l) => {
    const m = TRAILER.exec(l);
    return m === null ? [] : [{ verb: m[1] ?? "", target: m[2] ?? "" }];
  });
  return found.filter((t): t is { verb: Act["verb"]; target: string } => VERBS.has(t.verb));
}

/** TR-14: the text of an answer — the message before its trailers. */
const textOf = (message: string): string => paragraphs(message).slice(0, -1).join("\n\n");

async function signedOf(repo: Repo, kind: Signed["kind"], id: string): Promise<Signed> {
  return parsed(kind, id, await output(repo, ["cat-file", kind, id]));
}

/** The commits of a change request, oldest first, and the annotated tags that point at them, in the order of their names. */
async function sourcesOf(repo: Repo, base: string, request: string): Promise<Signed[]> {
  const commits = (await output(repo, ["rev-list", "--reverse", "--topo-order", `${base}..${request}`])).split("\n").filter((l) => l !== "");
  // `%(*objectname)` is what an annotated tag points at, and empty for a lightweight one, which no one signs.
  const refs = (await output(repo, ["for-each-ref", "--format=%(objectname) %(*objectname)", "refs/tags"])).split("\n");
  const tags = refs.map((l) => l.split(" ")).filter(([, target]) => commits.includes(target ?? ""));
  const all = [...commits.map((c) => ["commit", c] as const), ...tags.map(([tag]) => ["tag", tag ?? ""] as const)];
  return Promise.all(all.map(([kind, id]) => signedOf(repo, kind, id)));
}

/**
 * G-55: the keys of the configuration of git that change what verifies an SSH signature, set on the command line,
 * which wins over every file git reads — that of the repository too: these allowed signers and no others, the
 * program `ssh-keygen`, an empty file of revoked keys, and no trust level above the one an allowed signer has.
 */
function settingsOfCheck(signers: string, revoked: string): readonly string[] {
  const settings = [`gpg.ssh.allowedSignersFile=${signers}`, "gpg.ssh.program=ssh-keygen", `gpg.ssh.revocationFile=${revoked}`, "gpg.minTrustLevel=undefined"];
  return settings.flatMap((setting) => ["-c", setting]);
}

/** TR-16: whether git verifies the signature of a commit or tag with these settings of the check. */
async function verified(repo: Repo, check: readonly string[], s: Signed): Promise<boolean> {
  const ran = await run(repo, [...check, s.kind === "commit" ? "verify-commit" : "verify-tag", s.id]);
  return ran.status === 0;
}

/** The acts of one commit or tag: one per trailer, under the key that signed it; none without an SSH signature. */
async function actsIn(repo: Repo, check: readonly string[], s: Signed): Promise<Act[]> {
  const signer = s.signature === null ? null : signerOf(s.signature);
  const trailers = trailersOf(s.message);
  if (signer === null || trailers.length === 0) return [];
  const [ok, at] = [await verified(repo, check, s), timeOf(s)];
  const source = { identity: `ssh:${signer}`, uri: `git:${s.id}`, at, verified: ok };
  return trailers.map(({ verb, target }) => (verb === "answer" ? { verb, target, ...source, text: textOf(s.message) } : { verb, target, ...source }));
}

/** Q-04: the allowed signers file of these keys, for every principal, for signatures of git. */
function allowedSigners(keys: readonly string[]): string {
  const bad = keys.find((k) => /[\r\n]/.test(k));
  if (bad !== undefined) throw new Error("bug: a key of the policy spans lines; the policy admits only OpenSSH public keys (TR-10)");
  return keys.map((k) => `* namespaces="git" ${k}\n`).join("");
}

export function createActsLocal({ dir, base, keys }: ActsLocalOptions): Acts {
  return {
    read: async (request) => {
      const home = await mkdtemp(join(tmpdir(), "lattice-acts-"));
      try {
        const [signers, revoked, global] = [join(home, "allowed_signers"), join(home, "revoked_keys"), join(home, "gitconfig")];
        await Promise.all([writeFile(signers, allowedSigners(keys)), writeFile(revoked, ""), writeFile(global, "")]);
        const repo: Repo = { dir, env: isolated(global) };
        const check = settingsOfCheck(signers, revoked);
        const sources = await sourcesOf(repo, base, request);
        return (await Promise.all(sources.map((s) => actsIn(repo, check, s)))).flat();
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  };
}
