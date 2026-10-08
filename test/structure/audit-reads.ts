// What a test reads and starts (ST-18): a file of test/ reaches files only through owned, knowledge and scratch of
// test/support/files.ts and programs only through program of test/support/program.ts. Those two files are the only
// ones of test/ that import node:fs or node:child_process; the source of a program a test writes into its scratch
// folder is a string, not an import, and is not refused.
import ts from "typescript";
import { importsOf } from "./imports.js";

/** The helpers of ST-18: the only files of test/ that touch files and processes. */
export const READERS: readonly string[] = ["test/support/files.ts", "test/support/program.ts"];

/** Modules that read, write or start: a test reaches them through the helpers. */
const REFUSED: ReadonlySet<string> = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises", "child_process", "node:child_process"]);

/** Each import of `path` that reaches files or processes past the helpers, as a refusal of ST-18. */
export function auditReads(path: string, text: string): string[] {
  if (READERS.includes(path) || !/\.(ts|mts|js|mjs)$/.test(path)) return [];
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);
  return importsOf(path, sf)
    .filter((i) => !i.typeOnly && REFUSED.has(i.specifier))
    .map((i) => `ST-18: ${path}:${i.line} imports ${i.specifier}; a test reads through owned, knowledge or scratch and starts programs through program (test/support/)`);
}
