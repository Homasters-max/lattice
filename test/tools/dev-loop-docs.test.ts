// The documents of /dev-loop and its tool name the same agents, commands, jobs, statuses and files;
// these cases catch a contradiction between them before an agent meets it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const text = (path: string) => readFileSync(join(root, path), "utf8");
const tool = text("plan/tools/dev-loop.mjs");
const protocolCode = text("plan/tools/dev-loop/protocol.mjs");
const stateCode = text("plan/tools/dev-loop/state.mjs");
const protocol = text("plan/dev-loop.md");
const skill = text(".claude/skills/dev-loop/SKILL.md");
const agentDir = ".claude/agents";
const agentFiles = readdirSync(join(root, agentDir)).filter((f) => f.endsWith(".md"));
const listOf = (code: string, name: string) => [...new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(code)![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

describe("dev-loop documents, agents", () => {
  const spawned = ["executor", "fixer", ...listOf(protocolCode, "AXES").map((a) => (a === "verify" ? "verifier" : `reviewer-${a}`))];

  it("has a definition for every agent the tool spawns, and no other", () => {
    expect(agentFiles.map((f) => f.replace(/\.md$/, "")).sort()).toEqual([...spawned].sort());
  });

  // The tools of each role (S0-48): what the body asks of the agent and nothing more — gh is for no reviewer.
  const TOOLS: { readonly [agent: string]: string } = {
    executor: "Read, Edit, Write, Bash, Grep, Glob",
    fixer: "Read, Edit, Write, Bash, Grep, Glob",
    "reviewer-spec": "Read, Grep, Glob, Bash, Write",
    "reviewer-standards": "Read, Grep, Glob, Write",
    "reviewer-architecture": "Read, Grep, Glob, Write",
    verifier: "Read, Grep, Glob, Bash, Write",
  };
  const roleOf = (agent: string) => (["executor", "fixer"].includes(agent) ? agent : "reviewer");
  // The field names of a schema `{a, b?: [x], c: "y" | "z"}`: the first word of each top-level entry.
  const fieldsOf = (schema: string) => {
    let flat = schema.slice(1, -1).replace(/"[^"]*"/g, "");
    for (let prev = ""; prev !== flat; ) [prev, flat] = [flat, flat.replace(/\[[^[\]]*\]|\{[^{}]*\}/g, "")];
    return flat.split(",").map((s) => /^\s*(\w+)/.exec(s)?.[1]).filter((s) => s !== undefined);
  };
  const schemaIn = (text: string) => /`(\{[^`]*\})`/.exec(text)?.[1];

  it("gives every agent the tools of its role", () => {
    for (const file of agentFiles) expect(text(`${agentDir}/${file}`)).toMatch(new RegExp(`\\ntools: ${TOOLS[file.replace(/\.md$/, "")]}\\n`));
  });

  it("writes in the body of every agent the schema of its output that the protocol and the code check", () => {
    const fields = Object.fromEntries([...protocolCode.matchAll(/^ {2}(\w+): \[([^\]]*)\],$/gm)].map((m) => [m[1]!, [...m[2]!.matchAll(/"(\w+)"/g)].map((f) => f[1]!)]));
    for (const role of ["executor", "reviewer", "fixer"]) {
      const line = protocol.split("\n").find((l) => l.startsWith(`**${role}**`))!;
      const schema = schemaIn(protocol.slice(protocol.indexOf(line)).split("\n").find((l) => l.startsWith("- Выход:"))!)!;
      expect(fieldsOf(schema)).toEqual(fields[role]);
    }
    for (const file of agentFiles) {
      const body = text(`${agentDir}/${file}`);
      expect(fieldsOf(schemaIn(body.slice(body.indexOf("## Выход")))!)).toEqual(fields[roleOf(file.replace(/\.md$/, ""))]);
    }
  });

  it("gives every agent its name, a model, an effort and the protocol", () => {
    for (const file of agentFiles) {
      const body = text(`${agentDir}/${file}`);
      expect(body).toMatch(new RegExp(`^---\\nname: ${file.replace(/\.md$/, "")}\\n`));
      expect(body).toMatch(/\nmodel: \w+\n/);
      expect(body).toMatch(/\neffort: \w+\n/);
      expect(body).toContain("`plan/dev-loop.md`");
    }
  });
});

describe("dev-loop documents, commands and contract", () => {
  it("uses in the skill every command of the tool, and only those; start runs before the worktree exists", () => {
    // scope and restore are for debugging: start runs them inside.
    expect(skill).toContain("`node plan/tools/dev-loop.mjs start");
    const commands = [...tool.matchAll(/^\/\/ {3}(\w+) /gm)].map((m) => m[1]!).filter((c) => !["scope", "restore", "start"].includes(c));
    const used = new Set([...skill.matchAll(/`dl (\w+)/g)].map((m) => m[1]!));
    expect([...used].sort()).toEqual([...new Set(commands)].sort());
  });

  it("names in the protocol every job, status and outcome the code knows", () => {
    const jobs = [...listOf(protocolCode, "REVIEW_JOBS"), ...listOf(protocolCode, "FIXER_JOBS")];
    for (const job of listOf(protocolCode, "REVIEW_JOBS")) expect(tool + stateCode).toContain(`"${job}"`);
    for (const word of [...jobs, ...listOf(protocolCode, "STATUSES"), ...listOf(protocolCode, "KINDS"), "ready", "needs_owner", "done", "fixed", "disputed", "deferred", "declined"])
      expect(protocol).toMatch(new RegExp(`[\`"]${word}[\`"]`));
  });

  it("opens the gate of the skill with dl gate: the gate is the program, not a step of the model", () => {
    expect(skill.slice(skill.indexOf("## Ворота"))).toMatch(/^## Ворота\n\n`dl gate --worktree <work>`/);
  });

  it("routes in the skill every next step the tool can print", () => {
    const steps = new Set([...(tool + stateCode).matchAll(/next: "(\w+)"/g)].map((m) => m[1]!));
    expect(steps.size).toBeGreaterThan(8);
    const table = skill.slice(skill.indexOf("## Переходы"), skill.indexOf("## Начать"));
    for (const next of steps) expect(table).toContain(`\`${next}\``);
  });
});

describe("dev-loop documents, paths", () => {
  it("points only at files that exist", () => {
    const docs = [protocol, skill, text(".claude/skills/plan-task/SKILL.md"), text("AGENTS.md"), ...agentFiles.map((f) => text(`${agentDir}/${f}`))];
    const paths = docs.flatMap((d) => [...d.matchAll(/`((?:plan|docs|test|\.claude)\/[^`\s<>*]+\.(?:md|mjs|ts|txt))`/g)].map((m) => m[1]!));
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((p) => !existsSync(join(root, p)))).toEqual([]);
  });
});
