// Reads rule registries, fixture folders and the design from disk for the
// fitness tests of ST-17; the checks themselves are in coverage.ts and run.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FixtureCase, FixtureFolder } from "./coverage.js";

const root = join(import.meta.dirname, "../..");
export const fixturesDir = join(root, "test/fixtures");

function filesNamed(dir: string, name: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => p.split(/[\\/]/).at(-1) === name)
    .map((p) => join(dir, p));
}

/** Rule IDs listed by `RULES` of every registry `src/**\/rules.ts`. */
export async function loadRegistered(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const file of filesNamed(join(root, "src"), "rules.ts")) {
    const mod = (await import(pathToFileURL(file).href)) as { RULES?: unknown };
    const rules: unknown[] = Array.isArray(mod.RULES) ? mod.RULES : [];
    if (rules.length === 0) throw new Error(`${file}: a registry exports a non-empty RULES`);
    for (const rule of rules) {
      const id = (rule as { id?: unknown }).id;
      if (typeof id !== "string") throw new Error(`${file}: every entry of RULES has a string id`);
      ids.add(id);
    }
  }
  return ids;
}

function readCases(dir: string): FixtureCase[] | null {
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .sort()
    .map((name) => ({ name, data: name.endsWith(".json") ? parse(readFileSync(join(dir, name), "utf8")) : null }));
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Every folder directly under `test/fixtures/`. */
export function loadFolders(): FixtureFolder[] {
  return readdirSync(fixturesDir)
    .filter((name) => statSync(join(fixturesDir, name)).isDirectory())
    .sort()
    .map((name) => ({
      name,
      trigger: readCases(join(fixturesDir, name, "trigger")),
      pass: readCases(join(fixturesDir, name, "pass")),
    }));
}

/** The text of every document of `docs/design`. */
export function loadDesignTexts(): string[] {
  const dir = join(root, "docs/design");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
}
