// The source tree the structure test reads (D-07): the files of `src/` parsed
// by the TypeScript compiler API, the declared dependencies, and a program for
// the type checker. A virtual tree serves the trigger and pass cases.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export interface Tree {
  /** Absolute, with forward slashes. */
  readonly root: string;
  /** Every `.ts` file under `src/`, by its path relative to the root. */
  readonly files: ReadonlyMap<string, ts.SourceFile>;
  /** `dependencies` of package.json. */
  readonly dependencies: ReadonlySet<string>;
  /** The program over `files`, built on first use. */
  readonly program: () => ts.Program;
}

const slash = (p: string) => p.replaceAll("\\", "/");
export const repoRoot = slash(join(import.meta.dirname, "../.."));

let parsedOptions: ts.CompilerOptions | undefined;
function compilerOptions(): ts.CompilerOptions {
  if (parsedOptions !== undefined) return parsedOptions;
  const file = `${repoRoot}/tsconfig.json`;
  const json = ts.readConfigFile(file, (f) => ts.sys.readFile(f)).config as unknown;
  parsedOptions = ts.parseJsonConfigFileContent(json, ts.sys, repoRoot, undefined, file).options;
  return parsedOptions;
}

// Lib and @types files are parsed once for every program of the test run.
const shared = new Map<string, ts.SourceFile>();

function createProgram(root: string, files: ReadonlyMap<string, ts.SourceFile>): ts.Program {
  const options = compilerOptions();
  const own = new Map([...files.values()].map((sf) => [sf.fileName, sf]));
  const dirs = new Set([...own.keys()].flatMap((f) => f.split("/").map((_, i, parts) => parts.slice(0, i).join("/"))));
  const host = ts.createCompilerHost(options, true);
  const base = { getSourceFile: host.getSourceFile, fileExists: host.fileExists, directoryExists: host.directoryExists };
  host.getSourceFile = (name, version, onError, fresh) => {
    const sf = own.get(slash(name)) ?? shared.get(name) ?? base.getSourceFile(name, version, onError, fresh);
    if (sf !== undefined && !own.has(slash(name))) shared.set(name, sf);
    return sf;
  };
  host.fileExists = (name) => own.has(slash(name)) || base.fileExists(name);
  host.directoryExists = (name) => dirs.has(slash(name)) || (base.directoryExists?.(name) ?? false);
  host.getCurrentDirectory = () => repoRoot;
  return ts.createProgram({ rootNames: [...own.keys()], options, host });
}

function makeTree(root: string, texts: ReadonlyMap<string, string>, dependencies: Iterable<string>): Tree {
  const files = new Map(
    [...texts].map(([path, text]) => [path, ts.createSourceFile(`${root}/${path}`, text, ts.ScriptTarget.ES2023, true)]),
  );
  let program: ts.Program | undefined;
  return { root, files, dependencies: new Set(dependencies), program: () => (program ??= createProgram(root, files)) };
}

/** The tree of this repository. */
export function repoTree(): Tree {
  const src = join(repoRoot, "src");
  const paths = readdirSync(src, { recursive: true, encoding: "utf8" })
    .map((p) => `src/${slash(p)}`)
    .filter((p) => p.endsWith(".ts"))
    .sort();
  const texts = new Map(paths.map((p) => [p, readFileSync(join(repoRoot, p), "utf8")]));
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: object };
  return makeTree(repoRoot, texts, Object.keys(pkg.dependencies ?? {}));
}

/** A tree of the given files, rooted where no real file lives. */
export function virtualTree(files: { readonly [path: string]: string }, dependencies: readonly string[] = []): Tree {
  const paths = Object.keys(files).sort();
  return makeTree(`${repoRoot}/.virtual-tree`, new Map(paths.map((p) => [p, files[p] ?? ""])), dependencies);
}
