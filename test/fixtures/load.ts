// Reads rule registries, fixture folders and the design from disk for the
// fitness tests of ST-17; the checks themselves are in coverage.ts and run.ts.
// The files are read through the helpers of ST-18: the fixtures set owns the repository.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { knowledge, owned, repoRoot } from "../support/files.js";
import type { DesignDocument, FixtureCase, FixtureFolder } from "./coverage.js";

const fixturesDir = "test/fixtures";

/** The paths from the root of the files named `name` under the folder `dir`. */
function filesNamed(dir: string, name: string): string[] {
  if (!owned.exists(dir)) return [];
  return owned
    .list(dir, { recursive: true })
    .filter((p) => p.split("/").at(-1) === name)
    .map((p) => `${dir}/${p}`);
}

/** Rule IDs listed by `RULES` of every registry `src/**\/rules.ts`. */
export async function loadRegistered(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const file of filesNamed("src", "rules.ts")) {
    const mod = (await import(pathToFileURL(join(repoRoot, file)).href)) as { RULES?: unknown };
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
  if (!owned.exists(dir)) return null;
  return owned.list(dir).map((name) => ({ name, data: name.endsWith(".json") ? parse(owned.text(`${dir}/${name}`)) : null }));
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
  return owned
    .list(fixturesDir)
    .filter((name) => owned.isDirectory(`${fixturesDir}/${name}`))
    .map((name) => ({
      name,
      trigger: readCases(`${fixturesDir}/${name}/trigger`),
      pass: readCases(`${fixturesDir}/${name}/pass`),
    }));
}

/** Every document of `docs/design`, by file name, as bytes — the codec reads them. */
export function loadDesign(): DesignDocument[] {
  return knowledge
    .list("")
    .filter((f) => f.endsWith(".md"))
    .map((name) => ({ name, bytes: knowledge.bytes(name) }));
}
