// RT-32, RT-Z03: the command table of S0 — `--help` lists the store commands
// of the slice with the text of RT-Z03, a stub names the plan task where its
// command arrives, and the commands of later slices do not exist.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../src/cli/commands.js";
import { run } from "../../src/cli/run.js";

const S0 = ["init", "draft", "land", "verify-store", "export", "migrate", "session"];
const LATER = ["run", "replay", "sync", "import-md", "cite", "report", "act", "upgrade", "rebind", "trace"];
const STUBS: readonly (readonly [string, string])[] = [
  ["init", "S0-23"],
  ["draft", "S0-21"],
  ["verify-store", "S0-12"],
  ["export", "S0-27"],
  ["migrate", "S0-18"],
  ["session", "S0-16"],
];

async function lattice(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (t) => out.push(t), err: (t) => err.push(t), assembled: null });
  return { code, out: out.join(""), err: err.join("") };
}

/** RT-Z03: store command → what it does, backticks removed. */
function storeCommands(): Map<string, string> {
  const md = readFileSync(join(import.meta.dirname, "../../docs/design/07-runtime.md"), "utf8");
  const table = md.slice(md.indexOf("RT-Z03.")).split("\n\n")[1] ?? "";
  return new Map(
    table
      .split("\n")
      .slice(2)
      .map((row) => row.slice(2, -2).replaceAll("`", "").split(" | ") as [string, string]),
  );
}

describe("command table (RT-32)", () => {
  it("RT-32: holds the store commands of S0 in the order of RT-Z03, with their text", () => {
    const design = storeCommands();
    expect(COMMANDS.map((c) => c.name)).toEqual(S0);
    for (const c of COMMANDS) expect([c.name, c.does]).toEqual([c.name, design.get(c.name)]);
  });

  it("RT-32: --help lists every command of S0 and none of a later slice", async () => {
    const help = await lattice("--help");
    expect(help.code).toBe(0);
    for (const name of S0) expect(help.out).toMatch(new RegExp(`^  ${name} `, "m"));
    for (const name of LATER) expect(help.out).not.toMatch(new RegExp(`^  ${name} `, "m"));
    expect((await lattice()).out).toBe(help.out);
  });

  it("RT-32: a stub names the plan task where its command arrives", async () => {
    for (const [name, task] of STUBS) {
      const stub = await lattice(name);
      expect([name, stub.code, stub.err]).toEqual([name, 2, `lattice ${name}: not yet — arrives with plan task ${task}\n`]);
    }
  });

  it("RT-32: a command of a later slice is unknown", async () => {
    for (const name of LATER) {
      const unknown = await lattice(name);
      expect([name, unknown.code, unknown.err]).toEqual([name, 2, `lattice: unknown command ${name}; see lattice --help\n`]);
    }
  });
});

describe("land without a store", () => {
  it("RT-32: names the task that brings the store configuration", async () => {
    expect(await lattice("land", "cr/x")).toEqual({
      code: 2,
      out: "",
      err: "lattice land: no store is configured — store/lattice.json arrives with plan task S0-23\n",
    });
  });

  it("RT-32: asks for the change request", async () => {
    expect(await lattice("land", "--dry-run")).toEqual({ code: 2, out: "", err: "usage: lattice land <request> [--dry-run]\n" });
  });
});
