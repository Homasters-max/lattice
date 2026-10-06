// The imports of `src/` against ST-01: direction, entries, no cycles, adapters
// apart, vendor SDKs only in their adapter, the `judge` port only in `decide`
// (ST-04), the owners of adapters, `codec` and `generate` (ST-06), the adapters
// for tests outside `src/` (ST-07), and no code of another project but a pinned
// package (PR-13). Every problem starts with the rule ID it breaks.
import { importsOf, packageOf, type Import } from "./imports.js";
import { entryOf, grants, JUDGE_ENTRY, JUDGE_HOLDERS, MATRIX, placeOf, portOf, TEST_ADAPTERS, type Place } from "./modules.js";
import type { Tree } from "./tree.js";

type Context = {
  readonly tree: Tree;
  readonly ports: readonly string[];
};

type Check = (i: Import, at: string, cx: Context) => string | null;

const what = (p: Place) => (p.adapter === null ? p.module : `adapter ${p.adapter}`);

function allowed(p: Place): string {
  if (p.module === "adapters") return "only the port interface it implements";
  const list = MATRIX[p.module];
  return list.length === 0 ? "no other module" : list.join(", ");
}

const outside: Check = (i, at, { tree }) => {
  const target = i.target ?? "";
  if (!target.startsWith("src/")) return `PR-13: ${at} imports ${i.specifier} outside src/; another project's code comes only as a pinned library`;
  return tree.files.has(target) ? null : `ST-01: ${at} imports ${i.specifier}, which is no file of src/`;
};

const judge: Check = (i, at) => {
  if (entryOf(i.target ?? "") !== JUDGE_ENTRY || JUDGE_HOLDERS.some((r) => r.test(i.file))) return null;
  return `ST-04: ${at} imports the judge port; only decide receives it (DP-14)`;
};

function adapterBoundary(from: Place, to: Place, at: string): string | null {
  if (to.module !== "adapters") return null;
  const adapter = to.adapter ?? "";
  if (from.module === "adapters") return `ST-04: ${at} imports adapter ${adapter}; adapters never import each other`;
  if (from.module !== "assembly") return `ST-06: ${at} imports adapter ${adapter}; only assembly imports adapters`;
  return TEST_ADAPTERS.test(adapter) ? `ST-07: ${at} imports adapter ${adapter}, which exists for tests; only the test assembly in test/ uses it` : null;
}

function ownedBoundary(from: Place, to: Place, at: string): string | null {
  if (to.module !== "codec" && to.module !== "generate") return null;
  if (from.module === "assembly" || from.module === "cli") return null;
  return `ST-06: ${at} imports ${to.module}; only assembly and cli import codec and generate`;
}

const boundary = (from: Place, to: Place, at: string) => adapterBoundary(from, to, at) ?? ownedBoundary(from, to, at);

const matrix: Check = (i, at, { ports }) => {
  const target = i.target ?? "";
  const from = placeOf(i.file);
  const to = placeOf(target);
  if (from === null || to === null || (from.module === to.module && from.adapter === to.adapter)) return null;
  const crossed = boundary(from, to, at);
  if (crossed !== null) return crossed;
  const entry = entryOf(target);
  if (entry === null) return `ST-01: ${at} imports ${target}, which is not an entry of ${to.module}`;
  return grants(from, entry, ports) ? null : `ST-01: ${at} imports ${entry}; ${what(from)} may import ${allowed(from)}`;
};

const RELATIVE: readonly Check[] = [outside, judge, matrix];

/** One exact version (semver), no range or tag: the code of another project is pinned (PR-13); its hash is pinned by package-lock.json and `npm ci`. */
const PINNED = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function packageProblem(i: Import, at: string, { tree }: Context): string | null {
  const name = packageOf(i.specifier);
  if (placeOf(i.file)?.module !== "adapters") return `ST-04: ${at} imports ${name}; a vendor SDK lives only inside its adapter`;
  const version = tree.dependencies.get(name);
  if (version === undefined) return `PR-13: ${at} imports ${name}, which package.json does not declare in dependencies`;
  return PINNED.test(version) ? null : `PR-13: ${at} imports ${name}, which package.json declares as ${version}, not one pinned version`;
}

function importProblem(i: Import, cx: Context): string | null {
  const at = `${i.file}:${i.line}`;
  if (i.kind === "computed") return `ST-04: ${at} imports a computed specifier, which the structure test cannot check`;
  if (i.kind === "package") return packageProblem(i, at, cx);
  if (i.kind === "node") return null;
  for (const check of RELATIVE) {
    const problem = check(i, at, cx);
    if (problem !== null) return problem;
  }
  return null;
}

function placeProblems({ tree, ports }: Context): string[] {
  const adapters = new Set<string>();
  const problems = [...tree.files.keys()].flatMap((path) => {
    const place = placeOf(path);
    if (place?.adapter != null) adapters.add(place.adapter);
    return place === null ? [`ST-01: ${path} is in no module of ST-01`] : [];
  });
  for (const a of adapters) {
    if (portOf(a, ports) === null) problems.push(`ST-01: adapter ${a} names no port of ledger/ports or runtime/ports`);
  }
  return problems;
}

function vendorShared(imports: readonly Import[]): string[] {
  const owners = new Map<string, Set<string>>();
  for (const i of imports) {
    const adapter = i.kind === "package" ? placeOf(i.file)?.adapter : null;
    if (adapter == null) continue;
    const name = packageOf(i.specifier);
    owners.set(name, (owners.get(name) ?? new Set()).add(adapter));
  }
  return [...owners]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => `ST-04: ${name} is imported by adapters ${[...set].sort().join(", ")}; a vendor SDK lives inside one adapter`);
}

/** Strongly connected sets of files with more than one member, or a file importing itself (Tarjan). */
function cycles(files: readonly string[], edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const found: string[][] = [];
  const at = (m: ReadonlyMap<string, number>, v: string) => m.get(v) ?? 0;
  const out = (v: string) => edges.get(v) ?? [];
  const close = (v: string) => {
    const scc = stack.splice(stack.indexOf(v));
    if (scc.length > 1 || out(v).includes(v)) found.push(scc.sort());
  };
  const visit = (v: string) => {
    index.set(v, index.size);
    low.set(v, at(index, v));
    stack.push(v);
    for (const w of out(v)) {
      if (!index.has(w)) visit(w);
      if (stack.includes(w)) low.set(v, Math.min(at(low, v), at(low, w)));
    }
    if (at(low, v) === at(index, v)) close(v);
  };
  for (const f of files) if (!index.has(f)) visit(f);
  return found;
}

function cycleProblems(tree: Tree, imports: readonly Import[]): string[] {
  const edges = new Map<string, string[]>();
  for (const i of imports) {
    if (i.target !== null && tree.files.has(i.target)) edges.set(i.file, [...(edges.get(i.file) ?? []), i.target]);
  }
  return cycles([...tree.files.keys()], edges).map((scc) => `ST-04: import cycle among ${scc.join(", ")}`);
}

/** The port entries the tree defines: `ledger/ports/store`, `runtime/ports/llm`. */
export function portEntries(tree: Tree): string[] {
  return [...tree.files.keys()].map((p) => entryOf(p) ?? "").filter((e) => /^(ledger|runtime)\/ports\//.test(e));
}

/** Every import problem of the tree, sorted; empty when the imports hold ST-01, ST-04, ST-06 and PR-13. */
export function auditImports(tree: Tree): string[] {
  const cx: Context = { tree, ports: portEntries(tree) };
  const imports = [...tree.files].flatMap(([path, sf]) => importsOf(path, sf));
  const problems = [
    ...placeProblems(cx),
    ...imports.map((i) => importProblem(i, cx)).filter((p) => p !== null),
    ...vendorShared(imports),
    ...cycleProblems(tree, imports),
  ];
  return [...new Set(problems)].sort();
}
