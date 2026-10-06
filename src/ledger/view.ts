// The read view (LG-38): the questions apply, the runtime, capabilities and
// checks ask at one `seq`. The walking skeleton answers `seq` and `current`;
// the other questions arrive with S0-12.
import { type Record, type Result } from "../kernel/index.js";
import { decodeCommit, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Store } from "./ports/store.js";
import { currentKey, withDelta, type Row, type Rows } from "./rows.js";

export interface View {
  readonly seq: number;
  /** The current revision of an entity (TR-22), or `null`. */
  current(id: string): Record | null;
}

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater. */
export function createView(seq: number, rows: readonly Row[]): View & Rows {
  const holding = new Map(rows.filter((r) => r.from <= seq && (r.to === null || r.to > seq)).map((r) => [r.key, r]));
  const row = (key: string) => holding.get(key) ?? null;
  // A current row holds the record fold wrote for it (fold.ts).
  return { seq, row, current: (id) => (row(currentKey(id))?.value as Record | undefined) ?? null };
}

/** A store opened: the view at its tail and the tail commit. */
type Opened = { readonly view: View & Rows; readonly tail: Commit | null };

/** The lines of a store's commits from genesis, as the store gives them. */
export async function linesOf(store: Store): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of store.commits(1)) lines.push(line);
  return lines;
}

/**
 * LG-02: opening a store folds its commits from genesis; a line that is not a commit is refused
 * at its index (KR-10, LG-06, KR-04). The walking skeleton keeps the rows in the view; verifying
 * the chain and handing the rows to the adapter arrive with S0-11.
 */
export function openLines(lines: readonly string[]): Result<Opened> {
  let rows: Row[] = [];
  let opened: Opened = { view: createView(0, []), tail: null };
  for (const [index, line] of lines.entries()) {
    const commit = decodeCommit(line, index);
    if (!commit.ok) return commit;
    rows = withDelta(rows, fold(opened.view, commit.value, []));
    opened = { view: createView(commit.value.seq, rows), tail: commit.value };
  }
  return { ok: true, value: opened };
}

/** LG-02: the store opened — its lines read and folded from genesis. */
export async function openView(store: Store): Promise<Result<Opened>> {
  return openLines(await linesOf(store));
}
