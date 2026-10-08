// Norms of form that code can check (ST-16; S0-50 moved them here from
// CONVENTIONS.md): data at module level is readonly (ST-03), the root place is
// ROOT of the kernel (LG-17), code exports by name (only a tool config —
// vitest.config.ts, eslint.config.js — exports default), and a value of the md
// model is made by its builders, so only src/codec/build.ts casts to a type of
// the model, after its checks (LG-42). Each refusal names the norm it holds.
import ts from "typescript";
import type { Tree } from "./tree.js";

/** A cast to a type of the md model: where it is and the type it names. */
export type Cast = { readonly path: string; readonly line: number; readonly type: string };

const lineOf = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** Collections a module could change; their readonly twins are `ReadonlyMap` and `ReadonlySet`. */
const MUTABLE: ReadonlySet<string> = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

function mutable(type: ts.Type, checker: ts.TypeChecker): string | null {
  if (type.isUnion()) return type.types.map((t) => mutable(t, checker)).find((w) => w !== null) ?? null;
  if (checker.isTupleType(type)) return ((type as ts.TupleTypeReference).target.readonly ? null : "a mutable tuple");
  const name = type.getSymbol()?.getName();
  if (checker.isArrayType(type)) return name === "Array" ? "a mutable array" : null;
  return name !== undefined && MUTABLE.has(name) ? `a mutable ${name}` : null;
}

function moduleData(path: string, sf: ts.SourceFile, checker: ts.TypeChecker): string[] {
  return sf.statements.filter(ts.isVariableStatement).flatMap((s) =>
    s.declarationList.declarations.flatMap((d) => {
      const what = ts.isIdentifier(d.name) ? mutable(checker.getTypeAtLocation(d.name), checker) : null;
      return what === null ? [] : [`ST-03: ${path}:${lineOf(sf, d)} declares ${d.name.getText(sf)} at module level as ${what}; data at module level is readonly`];
    }),
  );
}

const valueIs = (o: ts.ObjectLiteralExpression, name: string, test: (e: ts.Expression) => boolean) =>
  o.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name && test(p.initializer));

const isRoot = (o: ts.ObjectLiteralExpression) =>
  valueIs(o, "intent", (e) => e.kind === ts.SyntaxKind.NullKeyword) && valueIs(o, "path", (e) => ts.isStringLiteral(e) && e.text === "");

function rootLiterals(path: string, sf: ts.SourceFile): string[] {
  if (path === "src/kernel/rejection.ts") return [];
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && isRoot(node)) out.push(`LG-17: ${path}:${lineOf(sf, node)} writes the root place as a literal; use ROOT of the kernel`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const isDefault = (s: ts.Statement) =>
  (ts.isExportAssignment(s) && s.isExportEquals !== true) ||
  (ts.canHaveModifiers(s) && (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) ||
  (ts.isExportDeclaration(s) && s.exportClause !== undefined && ts.isNamedExports(s.exportClause) && s.exportClause.elements.some((e) => e.name.text === "default"));

function defaultsOf(path: string, sf: ts.SourceFile): string[] {
  return sf.statements.filter(isDefault).map((s) => `ST-16: ${path}:${lineOf(sf, s)} exports default; code exports by name — only a tool config exports default`);
}

/** ST-16: the default exports of a file of code — a test, a script — read alone, without a program. */
export function defaultExports(path: string, text: string): string[] {
  const kind = /\.m?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return defaultsOf(path, ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true, kind));
}

const isMarked = (type: ts.Type): boolean =>
  type.isUnion() ? type.types.some(isMarked) : type.getProperties().some((p) => /^__@(BUILT|WHOLE)@/.test(String(p.escapedName)));

/** Every cast with `as` or `<T>` to a type of the md model — one that carries the mark of its builders — in the tree. */
export function modelCasts(tree: Tree): Cast[] {
  const checker = tree.program().getTypeChecker();
  const out: Cast[] = [];
  for (const [path, sf] of tree.files) {
    const visit = (node: ts.Node): void => {
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && isMarked(checker.getTypeFromTypeNode(node.type)))
        out.push({ path, line: lineOf(sf, node), type: node.type.getText(sf) });
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** Every problem of form in the tree, sorted by file and line as found. */
export function auditForm(tree: Tree): string[] {
  const checker = tree.program().getTypeChecker();
  const casts = modelCasts(tree)
    .filter((c) => c.path !== "src/codec/build.ts")
    .map((c) => `LG-42: ${c.path}:${c.line} casts to ${c.type}, a type of the md model; only the builders of src/codec/build.ts make one`);
  const files = [...tree.files].flatMap(([path, sf]) => [...moduleData(path, sf, checker), ...rootLiterals(path, sf), ...defaultsOf(path, sf)]);
  return [...files, ...casts];
}
