// What a test reads and writes at run time (ST-18 after S0-39; S0-42): only the files its test set owns (`owned`),
// `knowledge` — the design, docs/design — and what it has written itself in that run, in a folder of its own
// (`scratch`); the programs it starts go through `program` (program.ts). The structure test refuses node:fs and
// node:child_process anywhere else in test/ (test/structure/audit-reads.ts), so the hash of a test set
// (scripts/prove.mjs) covers what its tests read. What a test set owns is the classifier's (scripts/paths.mjs).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { expect } from "vitest";
import { owns, testSetOf } from "../../scripts/paths.mjs";

/** The root of the repository, with forward slashes. */
export const repoRoot = join(import.meta.dirname, "../..").replaceAll("\\", "/");

/** Reads of files under one root; a path is relative to that root, with `/`. */
export interface Files {
  /** The text of a file, as UTF-8. */
  text(path: string): string;
  bytes(path: string): Uint8Array;
  /** The names in a folder, sorted; with `recursive`, every path under it, relative to it, with `/`. */
  list(path: string, options?: { readonly recursive?: boolean }): string[];
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  /** Copies a file or a folder to `to`, a path inside a scratch folder of this run. */
  copy(path: string, to: string): void;
}

const slash = (p: string) => p.replaceAll("\\", "/");

function filesAt(absolute: (path: string) => string): Files {
  return {
    text: (path) => readFileSync(absolute(path), "utf8"),
    bytes: (path) => new Uint8Array(readFileSync(absolute(path))),
    list: (path, options = {}) => readdirSync(absolute(path), { recursive: options.recursive ?? false, encoding: "utf8" }).map(slash).sort(),
    exists: (path) => existsSync(absolute(path)),
    isDirectory: (path) => existsSync(absolute(path)) && statSync(absolute(path)).isDirectory(),
    copy: (path, to) => cpSync(absolute(path), inScratch(to), { recursive: true }),
  };
}

/** The test set of the test file that runs now (ST-10): its folder test/<set>/, per the classifier. */
export function currentTestSet(): string {
  const file = expect.getState().testPath;
  const set = file === undefined ? null : testSetOf(slash(relative(repoRoot, file)));
  if (set === null) throw new Error(`bug: owned reads in a test file of test/, not in ${String(file)}`);
  return set;
}

/**
 * The files the test set of the running test owns (ST-18), by their path from the root of the repository; a read of
 * any other file is refused.
 */
export const owned: Files = filesAt((path) => {
  const set = currentTestSet();
  const at = inRepository(path);
  if (!owns(set, at) && !owns(set, `${at}/`)) {
    throw new Error(`ST-18: test set ${set} does not own ${path}; a test reads only the files its test set owns (scripts/paths.mjs)`);
  }
  return join(repoRoot, at);
});

/** The design, `knowledge` until the switch (LG-01): the files of docs/design, by their path inside it. */
export const knowledge: Files = filesAt((path) => {
  const at = inRepository(join("docs/design", path));
  if (at !== "docs/design" && !at.startsWith("docs/design/")) throw new Error(`ST-18: ${path} is outside docs/design; knowledge is the design`);
  return join(repoRoot, at);
});

/** `path` from the root of the repository, normalised with `/` and without a trailing one; a refusal outside it. */
export function inRepository(path: string): string {
  const at = slash(posix.normalize(slash(path))).replace(/\/$/, "").replace(/^\.$/, "");
  if (isAbsolute(path) || at === ".." || at.startsWith("../")) throw new Error(`ST-18: ${path} is outside the repository`);
  return at;
}

/** A folder a test writes in and reads back in this run; a path is relative to it or absolute inside it. */
export interface Scratch extends Files {
  readonly dir: string;
  /** The absolute path of `parts` inside the folder. */
  path(...parts: string[]): string;
  /** Writes a file, making its folder — with `mode`, a new file has those permissions; returns its absolute path. */
  write(path: string, data: string | Uint8Array, mode?: number): string;
  /** Makes a folder with its parents; returns its absolute path. */
  mkdir(path: string): string;
  /** Removes a file or a folder inside, or the whole folder without `path`. */
  remove(path?: string): void;
}

const scratches: string[] = [];
const sameCase = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);

function within(root: string, path: string): boolean {
  const rel = relative(sameCase(root), sameCase(path));
  return !rel.startsWith("..") && !isAbsolute(rel);
}

/** Both spellings of a path: as given and, where it exists, as the file system names it (a short name on Windows). */
function spellings(path: string): string[] {
  const full = resolve(path);
  let real = full;
  for (let at = full; ; at = resolve(at, "..")) {
    if (existsSync(at)) {
      real = join(realpathSync.native(at), relative(at, full));
      break;
    }
    if (resolve(at, "..") === at) break;
  }
  return [full, real];
}

/** `path` itself if it is inside a scratch folder of this run; a refusal of ST-18 otherwise. */
export function inScratch(path: string): string {
  const roots = scratches.flatMap(spellings);
  if (!spellings(path).some((p) => roots.some((r) => within(r, p)))) {
    throw new Error(`ST-18: ${path} is not in a scratch folder of this run; a test reads what it wrote itself only there`);
  }
  return path;
}

/** A new folder for this run, named from `prefix`, under the folder for temporary files. */
export function scratch(prefix: string): Scratch {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratches.push(dir);
  const at = (path: string) => inScratch(isAbsolute(path) ? path : join(dir, path));
  return {
    ...filesAt(at),
    dir,
    path: (...parts) => at(join(...parts)),
    write: (path, data, mode) => {
      const file = at(path);
      mkdirSync(resolve(file, ".."), { recursive: true });
      writeFileSync(file, data, mode === undefined ? {} : { mode });
      return file;
    },
    mkdir: (path) => {
      const folder = at(path);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
    remove: (path) => rmSync(path === undefined ? dir : at(path), { recursive: true, force: true }),
  };
}
