// RT-32, TR-11, Q-04: `lattice session` starts a session — its id and time from
// the ports, a new session key — and issues its certificate, signed by the
// participant's own key from an unencrypted OpenSSH file: a dev key of
// test/keys for a machine, a human's key file anywhere. The session, its key
// and the path of the key file are kept in `.lattice/`.
import { createPrivateKey } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";
import { ROOT, type JsonValue } from "../../src/kernel/index.js";
import { SESSION_TYPE } from "../../src/ledger/index.js";
import { publicKeyOf, verifySession, type Policy } from "../../src/trust/index.js";
import { assembleForTests } from "../support/assembly.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { owned, scratch, type Scratch } from "../support/files.js";

const AT = "2026-10-06T12:30:00.000000Z";

let home: Scratch;
beforeEach(() => {
  home = scratch("lattice-session-");
});
afterEach(() => home.remove());

const assembled = () => assembleForTests({ git: { dir: home.dir, branches: { main: { files: {} } } }, acts: { acts: {} }, clock: { at: AT }, ids: { time: "01JB2X0000" } });

async function lattice(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(deepFreeze(argv), { out: (t) => out.push(t), err: (t) => err.push(t), assembled: assembled(), cwd: home.dir });
  return { code, out: out.join(""), err: err.join("") };
}

/** The OpenSSH line of a dev key, without its comment. */
const devKey = (name: string) => owned.text(`test/keys/${name}.pub`).split(" ").slice(0, 2).join(" ");

/** A copy of a dev key file at `path` inside the scratch folder; its absolute path. */
function keyFileAt(name: string, path: string): string {
  owned.copy(`test/keys/${name}`, home.path(path));
  return home.path(path);
}

/** The session `.lattice/session.json` holds. */
const saved = () => JSON.parse(home.text(".lattice/session.json")) as JsonValue & { readonly body: { readonly certificate: { readonly key: string } } };

/** The chain of TR-12 of the saved session to its key, under a policy that lists `writer`. */
function chainOf(writer: Policy["writers"] & object) {
  const types = (ref: string) => (ref === "core/session@1" ? SESSION_TYPE.body : null);
  return verifySession(deepFreeze({ session: saved(), types, policy: { owner: "owner", writers: writer }, at: AT }), ROOT, (key) => ({ ok: true, value: key }));
}

describe("lattice session (RT-32, TR-11)", () => {
  it("RT-32, TR-11, Q-04: issues a machine session and its certificate with a dev key of test/keys", async () => {
    keyFileAt("dev-land", "keys/dev-land");
    expect(await lattice("session", "--participant", "land", "--kind", "machine", "--role", "land", "--purpose", "check", "--for", "demo/requirement@1", "--key", "keys/dev-land")).toEqual({
      code: 0,
      out: "session 01JB2X00000000000000000001: land (machine) as land for check, expires 2026-10-07T00:30:00.000000Z\n",
      err: "",
    });
    const session = saved();
    expect(session).toMatchObject({ id: "01JB2X00000000000000000001", at: AT, body: { participant: "land", kind: "machine", software: "lattice", version: "0" } });
    expect(chainOf([{ participant: "land", kind: "machine", keys: [devKey("dev-land")], roles: ["land"] }])).toEqual({ ok: true, value: session.body.certificate.key });
    // The session key kept in .lattice/ is the key the certificate names.
    expect(publicKeyOf(createPrivateKey(home.text(".lattice/session.key")))).toBe(session.body.certificate.key);
    expect(home.text(".lattice/participant-key").trim()).toBe(home.path("keys/dev-land"));
  });

  it("TR-11, Q-04: a human signs the certificate with the key of an OpenSSH file; the next session takes the file named in .lattice/", async () => {
    const file = keyFileAt("dev-owner", ".ssh/id_ed25519");
    const first = await lattice("session", "--participant", "alice", "--role", "author", "--for", "demo/requirement@1", "--hours", "1", "--key", file);
    expect([first.code, first.out]).toEqual([0, "session 01JB2X00000000000000000001: alice (human) as author for work, expires 2026-10-06T13:30:00.000000Z\n"]);
    expect(saved()).toMatchObject({ body: { for: { reason: "requirement", requirement: "demo/requirement@1" } } });
    const policy = [{ participant: "alice", kind: "human" as const, keys: [devKey("dev-owner")], roles: ["author"] }];
    expect(chainOf(policy).ok).toBe(true);
    const next = await lattice("session", "--participant", "alice", "--role", "author", "--purpose", "explore", "--parent", "01JB2X000000000000000STEP1");
    expect([next.code, next.err]).toEqual([0, ""]);
    expect(saved()).toMatchObject({ body: { purpose: "explore", parent: "01JB2X000000000000000STEP1" } });
    expect(chainOf(policy).ok).toBe(true);
  });

});

describe("lattice session that does not start a session", () => {
  it("TR-11: refuses a session out of its form with its rejections, exit 1, and keeps nothing", async () => {
    keyFileAt("dev-owner", "owner");
    const init = await lattice("session", "--participant", "alice", "--role", "owner", "--purpose", "init", "--for", "demo/requirement@1", "--key", "owner");
    expect([init.code, init.out.split("\n")[0], init.out.split("\n")[1]?.split(":")[0]]).toEqual([1, "rejections: 1", "TR-11 at /body/for"]);
    const agent = await lattice("session", "--participant", "claude", "--kind", "agent", "--role", "author", "--for", "demo/requirement@1", "--key", "owner");
    expect([agent.code, agent.out.split("\n")[1]?.split(":")[0]]).toEqual([1, "TR-11 at /body/kind"]);
    const work = await lattice("session", "--participant", "alice", "--role", "author", "--key", "owner");
    expect([work.code, work.out.split("\n")[1]?.split(":")[0]]).toEqual([1, "TR-11 at /body/for"]);
    expect(home.exists(".lattice/session.json")).toBe(false);
  });

  it("Q-04: a key file that is no unencrypted Ed25519 OpenSSH key, or none at all, does not start a session", async () => {
    home.write("not-a-key", "ssh-ed25519 AAAA\n");
    expect(await lattice("session", "--participant", "alice", "--role", "author", "--key", "not-a-key")).toEqual({
      code: 2,
      out: "",
      err: `lattice session: ${home.path("not-a-key")} is not an unencrypted Ed25519 OpenSSH private key (Q-04)\n`,
    });
    expect((await lattice("session", "--participant", "alice", "--role", "author", "--key", "missing")).err).toBe(`lattice session: cannot read the key file ${home.path("missing")}\n`);
    const noKey = "lattice session: no key — give --key <file>, the unencrypted OpenSSH private key of the participant (Q-04)\n";
    expect((await lattice("session", "--participant", "alice", "--role", "author")).err).toBe(noKey);
    // An empty file of the path names no key file either.
    home.write(".lattice/participant-key", "\n");
    expect((await lattice("session", "--participant", "alice", "--role", "author")).err).toBe(noKey);
    // A path file that is there but cannot be read is no "no key": the command says so.
    home.remove(".lattice/participant-key");
    home.write(".lattice/participant-key/inside", "\n");
    const unread = await lattice("session", "--participant", "alice", "--role", "author");
    expect([unread.code, unread.err]).toEqual([2, `lattice session: cannot read ${home.path(".lattice/participant-key")}, the path of the last key file (Q-04)\n`]);
  });

  it("RT-32: asks for the participant and the role, and takes each option once", async () => {
    for (const argv of [
      ["--role", "author"],
      ["--participant", "alice"],
      ["--participant", "alice", "--role", "author", "--hours", "0"],
      ["--participant", "alice", "--role", "author", "--hours", "1.5"],
      ["--participant", "alice", "--role", "author", "--color", "red"],
      ["--participant", "alice", "--role", "author", "--role", "owner"],
      ["--participant", "alice", "--role"],
      ["alice", "author"],
      ["participant", "alice", "--role", "author"],
    ]) {
      const used = await lattice("session", ...argv);
      expect([argv, used.code, used.err.startsWith("usage: lattice session --participant <name> --role <role>")]).toEqual([argv, 2, true]);
    }
  });

  it("RT-32: names the task that brings the store configuration", async () => {
    const err: string[] = [];
    const code = await run(deepFreeze(["session", "--participant", "alice", "--role", "author"]), { out: () => undefined, err: (t) => err.push(t), assembled: null, cwd: home.dir });
    expect([code, err.join("")]).toEqual([2, "lattice session: no store is configured — store/lattice.json arrives with plan task S0-23\n"]);
  });
});
