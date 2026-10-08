// The perimeter of the kernel (ST-05, KR-01): every file reachable from the
// kernel entry is on an explicit list, and no `std` type name appears in the
// code of those files.
import ts from "typescript";
import { importsOf } from "./imports.js";
import type { Tree } from "./tree.js";

export const KERNEL_ENTRY = "src/kernel/index.ts";

/** Files reachable from the kernel entry through relative imports, sorted. */
export function kernelReach(tree: Tree): string[] {
  const seen = new Set<string>();
  const visit = (path: string) => {
    const sf = tree.files.get(path);
    if (sf === undefined || seen.has(path)) return;
    seen.add(path);
    for (const i of importsOf(path, sf)) if (i.target !== null) visit(i.target);
  };
  visit(KERNEL_ENTRY);
  return [...seen].sort();
}

/** ST-05: the reach of the kernel entry equals the list, in both directions. */
export function auditKernelFiles(tree: Tree, listed: readonly string[]): string[] {
  if (!tree.files.has(KERNEL_ENTRY)) return [`ST-05: no kernel entry ${KERNEL_ENTRY}`];
  const reach = kernelReach(tree);
  const list = new Set(listed);
  return [
    ...reach.filter((f) => !list.has(f)).map((f) => `ST-05: ${f} is reachable from the kernel entry but not listed in test/structure/kernel-files.txt`),
    ...listed.filter((f) => !reach.includes(f)).map((f) => `ST-05: ${f} is listed in test/structure/kernel-files.txt but not reachable from the kernel entry`),
  ].sort();
}

type Text = { readonly text: string; readonly line: number; readonly identifier: boolean };

/**
 * The string literals and identifiers of a file — names, types, properties; comments are not code. A name the platform
 * declares — `charCodeAt`, `fromCharCode` — is the platform's, not one the kernel gives: the checker says whose it is.
 */
function texts(sf: ts.SourceFile, program: ts.Program): Text[] {
  const checker = program.getTypeChecker();
  const platform = (node: ts.Identifier) => {
    const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
    return declarations.length > 0 && declarations.every((d) => program.isSourceFileDefaultLibrary(d.getSourceFile()));
  };
  const out: Text[] = [];
  const visit = (node: ts.Node) => {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node);
    if (literal || (ts.isIdentifier(node) && !platform(node))) {
      out.push({ text: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, identifier: !literal });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** An identifier in kebab case: `reviewNote`, `ReviewNote`, `REVIEW_NOTE` → `review-note`; an abbreviation is a word, `HTTPRequirement` → `http-requirement`. */
const kebab = (id: string) =>
  id
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();

function namesIn({ text, identifier }: Text, names: ReadonlySet<string>): string | null {
  // A std type name as whole words of an identifier: `isRequirement`, `REVIEW_NOTE_COUNT`.
  if (identifier) return [...names].some((n) => `-${kebab(text)}-`.includes(`-${n}-`)) ? text : null;
  if (text.includes("std/")) return text;
  const bare = /^(?:std\/)?([a-z][a-z0-9-]*)(?:@\d+)?$/.exec(text)?.[1];
  return bare !== undefined && names.has(bare) ? text : null;
}

/** KR-01: string literals that name `std` or one of its types, and identifiers named after a `std` type, in kernel code. */
export function auditStdNames(tree: Tree, names: ReadonlySet<string>): string[] {
  const program = tree.program();
  return kernelReach(tree)
    .flatMap((path) => {
      const sf = program.getSourceFile(tree.files.get(path)?.fileName ?? "");
      if (sf === undefined) return [];
      return texts(sf, program).flatMap((t) => {
        const hit = namesIn(t, names);
        return hit === null ? [] : [`KR-01: ${path}:${t.line} names the std type ${JSON.stringify(hit)}; the kernel knows no std type`];
      });
    })
    .sort();
}

/**
 * KR-01, S0-08: the `std` type names, read from the sources of `std` — the files
 * of std/source/, one type body per file named by the slug of its `id`.
 */
export function stdTypeNames(files: readonly string[]): string[] {
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/**
 * KR-01: the `std` type names of TY-Z02…TY-Z05 in docs/design/03-types.md — the
 * first column of TY-Z02…TY-Z04, and the types of TY-Z05 except the `core` ones.
 * std/source/ holds only the types of S0 (S0-08); the rest of `std` — `pipeline`,
 * `review-note`, `live`, `report`, `step`, `run`… — has no source until S0-09
 * writes it, and the kernel must not name those either.
 */
export function designTypeNames(md: string): string[] {
  const names = ["TY-Z02", "TY-Z03", "TY-Z04", "TY-Z05"].flatMap((block) =>
    blockRows(md, block).flatMap((row) => [...typeCell(block, row).matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1] ?? "")),
  );
  return [...new Set(names.filter((n) => n !== "core"))].sort();
}

function blockRows(md: string, block: string): string[] {
  const start = md.indexOf(`\n${block}.`);
  if (start < 0) throw new Error(`03-types.md has no block ${block}`);
  return md.slice(start).split("\n\n")[1]?.split("\n").slice(2) ?? [];
}

/** The cell that names types: the first, or in TY-Z05 the second without its `core` types. */
function typeCell(block: string, row: string): string {
  const cells = row.split(" | ");
  if (block !== "TY-Z05") return cells[0] ?? "";
  return (cells[1] ?? "").replace(/`[a-z-]+` \(`core`[^)]*\)/g, "");
}
