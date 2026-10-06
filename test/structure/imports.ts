// Every import of a source file, read from its syntax: static and dynamic
// imports, re-exports and `import("…")` types (D-07).
import { builtinModules } from "node:module";
import { posix } from "node:path";
import ts from "typescript";

export type Import = {
  /** The importing file, relative to the root. */
  readonly file: string;
  readonly line: number;
  /** As written; empty for an `import()` of a computed specifier. */
  readonly specifier: string;
  readonly kind: "relative" | "node" | "package" | "computed";
  /** A relative import resolved against the root: `src/kernel/index.ts`, or a path outside `src/`. */
  readonly target: string | null;
  /** The names bound; `null` for a default, namespace or side-effect import, `export *` and `import()`. */
  readonly names: readonly string[] | null;
  readonly typeOnly: boolean;
  readonly dynamic: boolean;
};

const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

function kindOf(specifier: string): Import["kind"] {
  if (specifier === "") return "computed";
  if (specifier.startsWith(".")) return "relative";
  const isNode = specifier.startsWith("node:") || BUILTINS.has(specifier.split("/")[0] ?? "");
  return isNode ? "node" : "package";
}

/** The package an import names: `@scope/name/sub` → `@scope/name`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return (specifier.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join("/");
}

function resolve(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.js$/, ".ts");
}

type Found = {
  readonly node: ts.Node;
  readonly specifier: string;
  readonly names: readonly string[] | null;
  readonly typeOnly: boolean;
  readonly dynamic?: boolean;
};

const literal = (n: ts.Node | undefined) => (n !== undefined && ts.isStringLiteral(n) ? n.text : "");

function namedImports(node: ts.ImportDeclaration): readonly string[] | null {
  const clause = node.importClause;
  if (clause === undefined || clause.name !== undefined) return null;
  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return null;
  return bindings.elements.map((e) => (e.propertyName ?? e.name).text);
}

function namedExports(node: ts.ExportDeclaration): readonly string[] | null {
  const clause = node.exportClause;
  if (clause === undefined || ts.isNamespaceExport(clause)) return null;
  return clause.elements.map((e) => (e.propertyName ?? e.name).text);
}

function typeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : [];
  return clause.name === undefined && named.length > 0 && named.every((e) => e.isTypeOnly);
}

function found(node: ts.Node): Found | null {
  if (ts.isImportDeclaration(node)) {
    return { node, specifier: literal(node.moduleSpecifier), names: namedImports(node), typeOnly: typeOnlyImport(node) };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
    return { node, specifier: literal(node.moduleSpecifier), names: namedExports(node), typeOnly: node.isTypeOnly };
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return { node, specifier: literal(node.moduleReference.expression), names: null, typeOnly: node.isTypeOnly };
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return { node, specifier: literal(node.arguments[0]), names: null, typeOnly: false, dynamic: true };
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { node, specifier: literal(node.argument.literal), names: null, typeOnly: true };
  }
  return null;
}

/** The imports of one file, in source order. */
export function importsOf(file: string, sf: ts.SourceFile): Import[] {
  const out: Import[] = [];
  const visit = (node: ts.Node) => {
    const f = found(node);
    if (f !== null) {
      const kind = kindOf(f.specifier);
      const line = sf.getLineAndCharacterOfPosition(f.node.getStart(sf)).line + 1;
      const target = kind === "relative" ? resolve(file, f.specifier) : null;
      out.push({ file, line, specifier: f.specifier, kind, target, names: f.names, typeOnly: f.typeOnly, dynamic: f.dynamic ?? false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
