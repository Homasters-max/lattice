// `lattice session` (RT-Z03, TR-11): thin — it parses arguments, reads the
// participant's key file, asks assembly to start a session and writes it into
// `.lattice/`: the session event, the session key and the path of the key
// file (Q-04), which the next session takes when no `--key` is given.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SessionOutcome, SessionRequest } from "../assembly/index.js";
import { rejectionLines, type Print, type Reach } from "./reach.js";

const USAGE =
  "usage: lattice session --participant <name> --role <role> [--kind human|machine] [--purpose <purpose>] [--for <requirement>] " +
  "[--parent <step>] [--software <name>] [--version <version>] [--hours <n>] [--key <OpenSSH private key file>]\n";

const FLAGS = ["participant", "role", "kind", "purpose", "for", "parent", "software", "version", "hours", "key"] as const;
type Flag = (typeof FLAGS)[number];
type Options = { readonly [flag in Flag]?: string };

/** `--flag value` pairs, each flag once; `null` for anything else. */
function optionsOf(args: readonly string[]): Options | null {
  const options: { [flag: string]: string } = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i]?.replace(/^--/, "") ?? "", args[i + 1]];
    if (!args[i]?.startsWith("--") || !FLAGS.some((f) => f === flag) || value === undefined || Object.hasOwn(options, flag)) return null;
    options[flag] = value;
  }
  return options;
}

const HOURS = /^[1-9][0-9]{0,3}$/;

/** The request of the options, but the key file; `null` where a required option is missing or `--hours` is not whole hours. */
function requestOf(o: Options): Omit<SessionRequest, "participantKey"> | null {
  if (o.participant === undefined || o.role === undefined || (o.hours !== undefined && !HOURS.test(o.hours))) return null;
  const optional = { requirement: o.for, parent: o.parent, software: o.software, version: o.version };
  const given = Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined));
  return { participant: o.participant, role: o.role, kind: o.kind ?? "human", purpose: o.purpose ?? "work", hours: Number(o.hours ?? "12"), ...given };
}

const STATE = ".lattice";
const KEY_PATH = "participant-key";

/** Whether a failure of the file system is that the file is not there. */
const isMissing = (e: unknown) => e instanceof Error && "code" in e && e.code === "ENOENT";

/**
 * Q-04: the key file named by `--key`, or the one the last session named in `.lattice/`; `null` for none — no such
 * file, or an empty one; `undefined`, the reason printed, where that file is there but cannot be read: a failure of
 * the outside world is no "no key".
 */
function keyFile(cwd: string, key: string | undefined, err: Print): string | null | undefined {
  if (key !== undefined) return resolve(cwd, key);
  const path = join(cwd, STATE, KEY_PATH);
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch (e) {
    if (isMissing(e)) return null;
    err(`lattice session: cannot read ${path}, the path of the last key file (Q-04)\n`);
    return undefined;
  }
}

/** Writes the session into `.lattice/`: its event, its key — readable by its owner only — and the path of the key file. */
function save(cwd: string, o: Extract<SessionOutcome, { outcome: "session" }>, file: string): void {
  const dir = join(cwd, STATE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "session.json"), `${o.text}\n`);
  writeFileSync(join(dir, "session.key"), o.key, { mode: 0o600 });
  writeFileSync(join(dir, KEY_PATH), `${file}\n`);
}

function report(o: SessionOutcome, file: string, { out, err, cwd }: Reach): number {
  switch (o.outcome) {
    case "not-a-key":
      err(`lattice session: ${file} is not an unencrypted Ed25519 OpenSSH private key (Q-04)\n`);
      return 2;
    case "rejections":
      out(rejectionLines(o.rejections));
      return 1;
    case "session": {
      save(cwd, o, file);
      const { participant, kind, role, purpose, certificate } = o.session.body;
      out(`session ${o.session.id}: ${participant} (${kind}) as ${role} for ${purpose}, expires ${certificate.expires}\n`);
      return 0;
    }
  }
}

/** Reads the key file; `null` with the reason printed where it cannot be read. */
function read(file: string, err: Print): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    err(`lattice session: cannot read the key file ${file}\n`);
    return null;
  }
}

export function sessionCommand(args: readonly string[], reach: Reach): Promise<number> {
  const options = optionsOf(args);
  const request = options === null ? null : requestOf(options);
  if (options === null || request === null) return Promise.resolve((reach.err(USAGE), 2));
  if (reach.assembled === null) {
    reach.err("lattice session: no store is configured — store/lattice.json arrives with plan task S0-23\n");
    return Promise.resolve(2);
  }
  const file = keyFile(reach.cwd, options.key, reach.err);
  if (file === undefined) return Promise.resolve(2);
  if (file === null) {
    reach.err("lattice session: no key — give --key <file>, the unencrypted OpenSSH private key of the participant (Q-04)\n");
    return Promise.resolve(2);
  }
  const text = read(file, reach.err);
  return Promise.resolve(text === null ? 2 : report(reach.assembled.session({ ...request, participantKey: text }), file, reach));
}
