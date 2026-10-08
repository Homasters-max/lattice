// The source tree the structure test reads (D-07): the files of `src/` parsed
// by the TypeScript compiler API, the declared dependencies, and a program for
// the type checker. A virtual tree serves the trigger and pass cases.
import { join } from "node:path";
import ts from "typescript";
import { owned } from "../support/files.js";

/** What package-lock.json pins a package by: its version and the hash of its tarball. */
export type Locked = { readonly version?: string; readonly integrity?: string };

export interface Tree {
  /** Absolute, with forward slashes. */
  readonly root: string;
  /** Every `.ts` file under `src/`, by its path relative to the root. */
  readonly files: ReadonlyMap<string, ts.SourceFile>;
  /** `dependencies` of package.json: name → version as declared. */
  readonly dependencies: ReadonlyMap<string, string>;
  /** The entry of package-lock.json for each of `dependencies` it holds (PR-13, Q-21). */
  readonly locked: ReadonlyMap<string, Locked>;
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
  const base = {
    getSourceFile: host.getSourceFile.bind(host),
    fileExists: host.fileExists.bind(host),
    directoryExists: host.directoryExists?.bind(host),
  };
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

type Packages = { readonly [name: string]: Locked };

function makeTree(root: string, texts: ReadonlyMap<string, string>, dependencies: { readonly [name: string]: string }, locked: Packages): Tree {
  const files = new Map(
    [...texts].map(([path, text]) => [path, ts.createSourceFile(`${root}/${path}`, text, ts.ScriptTarget.ES2023, true)]),
  );
  let program: ts.Program | undefined;
  return {
    root,
    files,
    dependencies: new Map(Object.entries(dependencies)),
    locked: new Map(Object.entries(locked)),
    program: () => (program ??= createProgram(root, files)),
  };
}

/** The tree of this repository, read through owned (ST-18): the test set that calls it owns src/ and package.json. */
export function repoTree(): Tree {
  const paths = owned
    .list("src", { recursive: true })
    .map((p) => `src/${p}`)
    .filter((p) => p.endsWith(".ts"))
    .sort();
  const texts = new Map(paths.map((p) => [p, owned.text(p)]));
  const pkg = JSON.parse(owned.text("package.json")) as { dependencies?: { readonly [name: string]: string } };
  const lock = JSON.parse(owned.text("package-lock.json")) as { packages?: Packages };
  const dependencies = pkg.dependencies ?? {};
  const locked = Object.keys(dependencies).flatMap((name) => {
    const entry = lock.packages?.[`node_modules/${name}`];
    return entry === undefined ? [] : [[name, entry] as const];
  });
  return makeTree(repoRoot, texts, dependencies, Object.fromEntries(locked));
}

/** Every dependency locked at its declared version with a sha512 integrity, as `npm install` writes it. */
const lockedAsDeclared = (dependencies: { readonly [name: string]: string }): Packages =>
  Object.fromEntries(Object.entries(dependencies).map(([name, version]) => [name, { version, integrity: `sha512-${"A".repeat(86)}==` }]));

/** A tree of the given files, rooted where no real file lives. */
export function virtualTree(
  files: { readonly [path: string]: string },
  dependencies: { readonly [name: string]: string } = {},
  locked: Packages = lockedAsDeclared(dependencies),
): Tree {
  const paths = Object.keys(files).sort();
  return makeTree(`${repoRoot}/.virtual-tree`, new Map(paths.map((p) => [p, files[p] ?? ""])), dependencies, locked);
}
