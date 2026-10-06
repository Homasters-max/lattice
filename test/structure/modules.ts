// ST-01 as data (D-07): the modules, their entry files and what each may
// import. The structure test checks `src/` against it and checks it against
// the table of ST-01 in docs/design/13-structure.md. A change here is a change
// of the design, and this file belongs to the walking skeleton (ST-15).

export const MODULES = [
  "kernel",
  "trust",
  "evidence",
  "measure",
  "ledger",
  "codec",
  "generate",
  "runtime",
  "capabilities",
  "adapters",
  "assembly",
  "cli",
] as const;

export type Module = (typeof MODULES)[number];

/** The module folders of the current slice (SL-05); the rest of the matrix has no folder yet. */
export const SLICE_MODULES: readonly Module[] = ["kernel", "trust", "ledger", "codec", "generate", "adapters", "assembly", "cli"];

/** Outside these, code is pure (ST-04). */
export const IMPURE: readonly Module[] = ["adapters", "assembly", "cli"];

/**
 * What each module may import, as grants over entries. A grant `m` admits every
 * entry of module `m`; a grant `m/part` admits that entry and the entries under
 * it. Refinements of ST-01 mapped onto files:
 * - `ledger/view` — the read view (`src/ledger/view.ts`);
 * - `ledger/runtime-append`, `ledger/tape` — the `runtime` append and the tape lookup;
 * - `ledger/ports/<port>`, `runtime/ports/<port>` — one port interface (`src/<m>/ports/<port>.ts`).
 * An adapter has no grant here: it may import only the port interface it implements (`adapterGrants`).
 */
export const MATRIX: { readonly [m in Module]: readonly string[] } = {
  kernel: [],
  trust: ["kernel"],
  evidence: ["kernel"],
  measure: ["kernel", "evidence"],
  ledger: ["kernel", "trust", "measure", "evidence"],
  codec: ["kernel", "ledger"],
  generate: ["kernel"],
  runtime: ["kernel", "evidence", "ledger/view", "ledger/runtime-append", "ledger/tape", "ledger/ports/clock", "ledger/ports/ids"],
  capabilities: ["kernel", "measure", "runtime/ports", "ledger/view"],
  adapters: [],
  assembly: ["kernel", "trust", "evidence", "measure", "ledger", "codec", "generate", "runtime", "capabilities", "adapters"],
  cli: ["assembly"],
};

/** Named entries besides `src/<module>/index.ts`, relative to `src/`. */
const PART_ENTRIES: ReadonlyMap<string, string> = new Map([
  ["ledger/view.ts", "ledger/view"],
  ["ledger/runtime-append.ts", "ledger/runtime-append"],
  ["ledger/tape.ts", "ledger/tape"],
]);

const PORT_FILE = /^(ledger|runtime)\/ports\/([a-z][a-z0-9-]*)\.ts$/;

/**
 * ST-04, DP-14: only `decide` receives the `judge` port. A judge adapter implements it and imports its
 * interface, as every adapter does (ST-01); assembly hands the adapter to `decide` without importing the port (Q-14).
 */
export const JUDGE_ENTRY = "runtime/ports/judge";
export const JUDGE_HOLDERS: readonly RegExp[] = [/^src\/capabilities\/decide\//, /^src\/adapters\/judge-[^/]+\//];

/** Adapters that exist for tests — every `fixture` adapter (TR-14, LG-23) and the deterministic ones (ST-07): only the test assembly in `test/` uses them (Q-13). */
export const TEST_ADAPTERS = /^(?:[a-z][a-z0-9]*-fixture|clock-fixed|ids-counter)$/;

/** ST-04, KR-02: `node:crypto` names pure code may use; every other `node:*` module is refused. */
export const PURE_CRYPTO: ReadonlySet<string> = new Set(["createHash", "verify", "sign", "createPublicKey", "createPrivateKey"]);

/** Where a file of `src/` lives: its module and, under `adapters`, its adapter. */
export type Place = {
  readonly module: Module;
  readonly adapter: string | null;
};

const isModule = (name: string | undefined): name is Module => (MODULES as readonly string[]).includes(name ?? "");

/** The place of a path like `src/ledger/fold.ts`; `null` outside every module. */
export function placeOf(path: string): Place | null {
  const [src, name, adapter, rest] = path.split("/");
  if (src !== "src" || !isModule(name)) return null;
  if (name !== "adapters") return { module: name, adapter: null };
  return adapter !== undefined && rest !== undefined ? { module: name, adapter } : null;
}

/** The entry a path is — `kernel`, `ledger/ports/store`, `adapters/store-memory` — or `null` for a file inside a module. */
export function entryOf(path: string): string | null {
  const inner = path.startsWith("src/") ? path.slice(4) : "";
  const port = PORT_FILE.exec(inner);
  if (port !== null && port[2] !== "index") return `${port[1]}/ports/${port[2]}`;
  return indexEntry(inner) ?? PART_ENTRIES.get(inner) ?? null;
}

function indexEntry(inner: string): string | null {
  const adapter = /^adapters\/([a-z][a-z0-9-]*)\/index\.ts$/.exec(inner)?.[1];
  if (adapter !== undefined) return `adapters/${adapter}`;
  const module = /^([a-z]+)\/index\.ts$/.exec(inner)?.[1];
  return isModule(module) && module !== "adapters" ? module : null;
}

/** The port an adapter implements, given the port entries that exist: `store-memory` → `store`. */
export function portOf(adapter: string, ports: readonly string[]): string | null {
  const names = ports.map((p) => p.split("/").at(-1) ?? "").filter((p) => adapter.startsWith(`${p}-`));
  return names.sort((a, b) => b.length - a.length)[0] ?? null;
}

const covers = (grant: string, entry: string) => entry === grant || entry.startsWith(`${grant}/`);

/** Whether a file in `from` may import `entry` of another module (ST-01). */
export function grants(from: Place, entry: string, ports: readonly string[]): boolean {
  if (from.module !== "adapters") return MATRIX[from.module].some((g) => covers(g, entry));
  const port = from.adapter === null ? null : portOf(from.adapter, ports);
  return port !== null && (entry === `ledger/ports/${port}` || entry === `runtime/ports/${port}`);
}
