// `store-jsonl` (LG-02, LG-23): the git copy of `knowledge` — one canonical
// line per commit in `store/knowledge.jsonl` of a directory, read from the
// start when the store opens. It never decodes or parses a line and drops none:
// it gives the bytes between line feeds as they are, an empty line too, and the
// ledger refuses what is no commit (KR-10). The rows the ledger folds are kept
// in memory. Refusing a cut last line, writing `store/evidence/` and the rows
// handed on opening arrive with S0-11 (Q-09).
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { keptRows, type Append, type Store } from "../../ledger/ports/store.js";

export type StoreJsonlOptions = { readonly dir: string };

/** LG-50: the only path this adapter writes. */
const KNOWLEDGE = "store/knowledge.jsonl";

const LF = 0x0a;

/** The bytes of `store/knowledge.jsonl` that hold these commit lines, as `append` writes them: each line, then a line feed. */
export const fileOf = (commits: readonly string[]): Uint8Array => new TextEncoder().encode(commits.map((c) => `${c}\n`).join(""));

/** The lines of the file: the bytes before each line feed, then the bytes after the last one if there are any — a cut last line, refused from S0-11. */
async function linesOf(file: string): Promise<Uint8Array[]> {
  const read = await readFile(file).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : Promise.reject(e)));
  const bytes = read === null ? new Uint8Array() : new Uint8Array(read);
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let i = bytes.indexOf(LF); i !== -1; i = bytes.indexOf(LF, start)) {
    lines.push(bytes.subarray(start, i));
    start = i + 1;
  }
  return start < bytes.length ? [...lines, bytes.subarray(start)] : lines;
}

export function createStoreJsonl({ dir }: StoreJsonlOptions): Store {
  const file = join(dir, KNOWLEDGE);
  const rows = keptRows();
  const evidence = new Map<string, Uint8Array>();
  return {
    async append({ commit, delta, evidence: cited }: Append) {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, fileOf([commit]));
      rows.apply(delta);
      for (const e of cited) evidence.set(e.hash, e.bytes);
    },
    commits: async function* (from) {
      for (const line of (await linesOf(file)).slice(Math.max(from, 1) - 1)) yield line;
    },
    tail: async () => (await linesOf(file)).at(-1) ?? null,
    row: rows.row,
    rows: rows.rows,
    evidence: (hash) => Promise.resolve(evidence.get(hash) ?? null),
  };
}
