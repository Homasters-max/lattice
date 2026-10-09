// A git repository of signed commits and tags, for the tests of `acts-local`
// (TR-14, Q-04): a temporary repository where a change request is a branch and
// a local act a commit or tag signed by SSH with a dev key of test/keys/ —
// `dev-owner`, the key a policy lists, or `dev-land`, a key it does not. Git
// signs with `ssh-keygen`, on every system the tests run on (R5); it reads no
// configuration of the machine, and every commit and tag is made at SIGNED_AT.
import { createHash } from "node:crypto";
import { owned, scratch, type Scratch } from "./files.js";
import { NO_MAINTENANCE } from "./git.js";
import { program } from "./program.js";

export type DevKey = "dev-owner" | "dev-land";

/** The time of every commit and tag, as git takes it and as KR-11 writes it. */
export const SIGNED_AT = "2026-10-09T12:00:00.000000Z";

/** The OpenSSH public key of a dev key, as a policy lists it (TR-10). */
export const publicKeyOf = (key: DevKey): string => owned.text(`test/keys/${key}.pub`).trim();

/** TR-09: the identity of a dev key — `ssh:` and its fingerprint as `ssh-keygen -l` prints it. */
export function identityOf(key: DevKey): string {
  const blob = Buffer.from(publicKeyOf(key).split(" ")[1] ?? "", "base64");
  return `ssh:SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

export interface SignedRepo {
  readonly dir: string;
  /** A commit on `branch` — on its tip, or a root where there is none — signed by `by`, or unsigned with `null`; its id. */
  commit(branch: string, message: string, by: DevKey | null): string;
  /** A branch at the tip of `from`. */
  branch(name: string, from: string): void;
  /** An annotated tag of `target`, signed by `by`, or unsigned with `null`; the id of the tag object. */
  tag(name: string, target: string, message: string, by: DevKey | null): string;
  /**
   * Q-04: the machine allows signers by `key` — its global configuration of git names a file of them; the
   * environment that makes git read that configuration.
   */
  allowOnMachine(key: DevKey): { readonly GIT_CONFIG_GLOBAL: string };
  /** Whether git, with the configuration of the machine, verifies the signature of the commit `rev`. */
  machineVerifies(rev: string): boolean;
  remove(): void;
}

const git = program("git");

export function signedRepo(): SignedRepo {
  const home: Scratch = scratch("lattice-acts-");
  const dir = home.mkdir("repo");
  const global = home.write("gitconfig", "");
  // ssh-keygen refuses a private key others may read.
  const keyFile = (key: DevKey) => (home.exists(`keys/${key}`) ? home.path("keys", key) : home.write(`keys/${key}`, owned.bytes(`test/keys/${key}`), 0o600));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: global, GIT_AUTHOR_DATE: SIGNED_AT, GIT_COMMITTER_DATE: SIGNED_AT };
  const run = (args: readonly string[], input?: string): string => {
    const ran = git.run(["-C", dir, "-c", "user.name=dev", "-c", "user.email=dev@lattice.invalid", "-c", "gpg.format=ssh", ...args], { env, ...(input === undefined ? {} : { input }) });
    if (ran.status !== 0) throw new Error(`bug: git ${args.join(" ")} failed: ${ran.stderr}`);
    return ran.stdout.trim();
  };
  const signer = (by: DevKey | null) => (by === null ? [] : ["-c", `user.signingkey=${keyFile(by)}`]);
  run(["init", "-q", "-b", "main"]);
  run(NO_MAINTENANCE);
  const empty = run(["mktree"], "");
  return {
    dir,
    allowOnMachine: (key) => {
      const signers = home.write("machine_signers", `* ${publicKeyOf(key)}\n`);
      run(["config", "--file", global, "gpg.ssh.allowedSignersFile", signers]);
      return { GIT_CONFIG_GLOBAL: global };
    },
    machineVerifies: (rev) => git.run(["-C", dir, "verify-commit", rev], { env }).status === 0,
    commit: (branch, message, by) => {
      const tip = git.run(["-C", dir, "rev-parse", "--verify", "-q", `refs/heads/${branch}`], { env }).stdout.trim();
      const signing = by === null ? ["--no-gpg-sign"] : ["-S"];
      const id = run([...signer(by), "commit-tree", empty, ...(tip === "" ? [] : ["-p", tip]), ...signing, "-m", message]);
      run(["update-ref", `refs/heads/${branch}`, id]);
      return id;
    },
    branch: (name, from) => {
      run(["update-ref", `refs/heads/${name}`, `refs/heads/${from}`]);
    },
    tag: (name, target, message, by) => {
      run([...signer(by), "tag", "-a", ...(by === null ? [] : ["-s"]), "-m", message, name, target]);
      return run(["rev-parse", `refs/tags/${name}`]);
    },
    remove: () => home.remove(),
  };
}
