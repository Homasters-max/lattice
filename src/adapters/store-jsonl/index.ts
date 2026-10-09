// `store-jsonl` (LG-02, LG-23, LG-30): the git copy of `knowledge` — the line
// of each commit in `store/knowledge.jsonl` of a directory, read from the
// start when the store opens, and the evidence files it cites in
// `store/evidence/`. It never decodes or parses a line and drops none: it gives
// the bytes of each line with its line feed as they are, an empty line too, and
// the bytes after the last line feed as a line — a cut line, which the ledger
// refuses (KR-10, G-17). The rows the ledger folds on opening and those of each
// delta are kept in memory: git holds commits and evidence, never rows.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EVIDENCE, keptRows, KNOWLEDGE, type Append, type Store } from "../../ledger/ports/store.js";

export type StoreJsonlOptions = { readonly dir: string };

const LF = 0x0a;

/** A hash of KR-12: an algorithm and hex digits, so its name is a file name and never a path. */
const HASH = /^([a-z0-9]+):([0-9a-f]+)$/;

/**
 * G-46: the name of the evidence file of a hash, `sha256:<hex>` as `sha256-<hex>.jsonl` — `:` names no file on
 * Windows; `null` for a string that is no hash, which names no file.
 */
function evidenceName(hash: string): string | null {
  const parts = HASH.exec(hash);
  return parts === null ? null : `${parts[1]}-${parts[2]}.jsonl`;
}

/** The bytes of a file, or `null` where there is none; any other failure of the disk is thrown (CONVENTIONS.md §2.3). */
async function bytesOf(file: string): Promise<Uint8Array | null> {
  const read = await readFile(file).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : Promise.reject(e)));
  return read === null ? null : new Uint8Array(read);
}

/** The lines of the file: the bytes up to and with each line feed, then the bytes after the last one if there are any — a cut line. */
async function linesOf(file: string): Promise<Uint8Array[]> {
  const bytes = (await bytesOf(file)) ?? new Uint8Array();
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let i = bytes.indexOf(LF); i !== -1; i = bytes.indexOf(LF, start)) {
    lines.push(bytes.subarray(start, i + 1));
    start = i + 1;
  }
  return start < bytes.length ? [...lines, bytes.subarray(start)] : lines;
}

/** The evidence files an append writes; a hash that is no hash of KR-12 is a bug of the ledger, thrown before any write. */
function filesOf(dir: string, evidence: Append["evidence"]): { readonly file: string; readonly bytes: Uint8Array }[] {
  return evidence.map((e) => {
    const name = evidenceName(e.hash);
    if (name === null) throw new Error(`bug: evidence is cited by a hash of KR-12, not ${e.hash}`);
    return { file: join(dir, EVIDENCE, name), bytes: e.bytes };
  });
}

export function createStoreJsonl({ dir }: StoreJsonlOptions): Store {
  const file = join(dir, KNOWLEDGE);
  const rows = keptRows();
  return {
    async append({ commit, delta, evidence }: Append) {
      // A delta the rows refuse is a bug, thrown before anything is written; the rows change once the line is.
      const hold = rows.apply(delta);
      // LG-02: the evidence first, then the line in one write — a store cut short holds evidence no line cites, never a line without its evidence.
      for (const e of filesOf(dir, evidence)) {
        await mkdir(dirname(e.file), { recursive: true });
        await writeFile(e.file, e.bytes);
      }
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, commit);
      hold();
    },
    commits: async function* (from) {
      for (const line of (await linesOf(file)).slice(Math.max(from, 1) - 1)) yield line;
    },
    tail: async () => (await linesOf(file)).at(-1) ?? null,
    keep: rows.keep,
    row: rows.row,
    rows: rows.rows,
    evidence: async (hash) => {
      const name = evidenceName(hash);
      return name === null ? null : bytesOf(join(dir, EVIDENCE, name));
    },
  };
}
