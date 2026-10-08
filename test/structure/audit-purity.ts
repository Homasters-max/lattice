// Purity outside `adapters`, `assembly` and `cli` (ST-04; KR-02 for the
// kernel): no clock, randomness, environment, network, files, scheduler,
// locale, code evaluation, GC or console, and no state at module level —
// `let` or `var` outside a function. The lists below are the norm: a name
// declared in the file itself is no global and is not refused. Allowed:
// `node:crypto` for the names of PURE_CRYPTO, `TextEncoder`, `TextDecoder`,
// `new Date(x)` with an argument, `Date.UTC`, `getUTC*`, `toISOString`,
// `toUpperCase`, `toLowerCase`.
import ts from "typescript";
import { importsOf, type Import } from "./imports.js";
import { IMPURE, placeOf, PURE_CRYPTO } from "./modules.js";
import type { Tree } from "./tree.js";

/** Globals pure code never touches; a local binding of the same name is not one of them. */
const GLOBALS: ReadonlySet<string> = new Set([
  "process", "globalThis", "global", "require", "module", "exports", "__dirname", "__filename", "Buffer", "navigator",
  "performance", "Intl", "crypto", "console",
  "fetch", "WebSocket", "XMLHttpRequest", "EventSource",
  "setTimeout", "setInterval", "setImmediate", "queueMicrotask",
  "eval", "Function", "WeakRef", "FinalizationRegistry",
]);

/** Members that depend on the locale, on any object. */
const LOCALE: ReadonlySet<string> = new Set([
  "localeCompare", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toLocaleUpperCase", "toLocaleLowerCase",
]);

/** Methods of `Date` in local time; their UTC twins are allowed. */
const LOCAL_TIME: ReadonlySet<string> = new Set([
  "getDate", "getDay", "getFullYear", "getHours", "getMilliseconds", "getMinutes", "getMonth", "getSeconds", "getYear",
  "getTimezoneOffset", "setDate", "setFullYear", "setHours", "setMilliseconds", "setMinutes", "setMonth", "setSeconds",
  "setYear", "toDateString", "toTimeString", "toString",
]);

const STATIC: ReadonlyMap<string, string> = new Map([
  ["Date", "now"],
  ["Math", "random"],
]);

function isReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if ((p as { name?: ts.Node }).name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
  return !ts.isLabeledStatement(p) && !ts.isBreakOrContinueStatement(p);
}

function isGlobal(id: ts.Identifier, checker: ts.TypeChecker): boolean {
  const p = id.parent;
  const symbol = ts.isShorthandPropertyAssignment(p) ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(id);
  return (symbol?.declarations ?? []).every((d) => d.getSourceFile().isDeclarationFile);
}

const globalNamed = (n: ts.Node, name: string, checker: ts.TypeChecker) =>
  ts.isIdentifier(n) && n.text === name && isGlobal(n, checker);

function memberName(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) return node.argumentExpression.text;
  return null;
}

function isDate(n: ts.Expression, checker: ts.TypeChecker): boolean {
  const symbol = checker.getTypeAtLocation(n).getSymbol();
  return symbol?.getName() === "Date" && (symbol.declarations ?? []).every((d) => d.getSourceFile().isDeclarationFile);
}

function memberUse(node: ts.Node, checker: ts.TypeChecker): string | null {
  const name = memberName(node);
  if (name === null) return null;
  const object = (node as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression;
  if (LOCALE.has(name)) return name;
  for (const [owner, member] of STATIC) if (name === member && globalNamed(object, owner, checker)) return `${owner}.${member}`;
  return LOCAL_TIME.has(name) && isDate(object, checker) ? `${name} of a Date, in local time` : null;
}

const globalUse = (id: ts.Identifier, checker: ts.TypeChecker) =>
  GLOBALS.has(id.text) && isReference(id) && isGlobal(id, checker) ? id.text : null;

function dateUse(node: ts.NewExpression | ts.CallExpression, checker: ts.TypeChecker): string | null {
  if (!globalNamed(node.expression, "Date", checker)) return null;
  if (ts.isCallExpression(node)) return "Date() as a function";
  return (node.arguments ?? []).length === 0 ? "new Date() without an argument" : null;
}

function nodeUse(node: ts.Node, checker: ts.TypeChecker): string | null {
  if (ts.isIdentifier(node)) return globalUse(node, checker);
  if (ts.isMetaProperty(node)) return node.keywordToken === ts.SyntaxKind.ImportKeyword ? "import.meta" : null;
  if (ts.isNewExpression(node) || ts.isCallExpression(node)) return dateUse(node, checker);
  return memberUse(node, checker);
}

function importUse(i: Import): string | null {
  if (i.dynamic) return "import()";
  if (i.kind !== "node") return null;
  if (i.specifier !== "node:crypto" && i.specifier !== "crypto") return i.specifier;
  if (i.names === null) return "node:crypto as a whole; name what it uses";
  const refused = i.names.filter((n) => !PURE_CRYPTO.has(n));
  return refused.length === 0 ? null : `node:crypto ${refused.join(", ")}`;
}

/** `let` and `var` at module level: state a pure function would keep between calls. */
function moduleState(sf: ts.SourceFile): { readonly line: number; readonly decl: string }[] {
  return sf.statements.filter(ts.isVariableStatement).flatMap((s) => {
    const list = s.declarationList;
    const keyword = list.flags & ts.NodeFlags.Let ? "let" : list.flags & (ts.NodeFlags.Const | ts.NodeFlags.Using) ? null : "var";
    if (keyword === null) return [];
    return list.declarations.map((d) => ({ line: sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1, decl: `${keyword} ${d.name.getText(sf)}` }));
  });
}

function fileProblems(path: string, sf: ts.SourceFile, checker: ts.TypeChecker): string[] {
  const rule = placeOf(path)?.module === "kernel" ? "KR-02" : "ST-04";
  const say = (line: number, use: string) => `${rule}: ${path}:${line} uses ${use}; pure code reaches the world only through ports`;
  const out = importsOf(path, sf).flatMap((i) => {
    const use = importUse(i);
    return use === null ? [] : [say(i.line, use)];
  });
  for (const { line, decl } of moduleState(sf)) out.push(`${rule}: ${path}:${line} keeps state at module level (${decl}); pure code keeps no state between calls`);
  const visit = (node: ts.Node) => {
    const use = nodeUse(node, checker);
    if (use !== null) out.push(say(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, use));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Every purity problem of the pure modules of the tree, sorted. */
export function auditPurity(tree: Tree): string[] {
  const pure = [...tree.files].filter(([path]) => {
    const place = placeOf(path);
    return place !== null && !IMPURE.includes(place.module);
  });
  if (pure.length === 0) return [];
  const checker = tree.program().getTypeChecker();
  return [...new Set(pure.flatMap(([path, sf]) => fileProblems(path, sf, checker)))].sort();
}
