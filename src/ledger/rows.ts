// Rows (LG-35, LG-38), one module of the ledger: a row is canonical JSON with
// `from` and `to`, the `seq` that opened and closed it; `to` is `null` while it
// holds. Here are the key schema of the projections (LG-34), applying a delta,
// the order of keys (Q-18), `view(seq)` over rows — the read view (LG-38) — and
// the rows a store keeps: those the ledger hands it when it opens the store
// (LG-02) and those each delta leaves (Q-27). Fold reads the rows behind a
// view; every other reader asks only the questions of View, through the entry
// `ledger/view` (ST-01).
import { compareText, parseRef, serialize, type JsonValue, type Record } from "../kernel/index.js";
import { namespaceOf } from "../trust/index.js";
import type { Evidence } from "./commit.js";

export type Row = {
  readonly key: string;
  readonly from: number;
  readonly to: number | null;
  readonly value: JsonValue;
};

/** The rows one commit opens and closes. */
export type Delta = readonly Row[];

/** The rows behind a view. Fold reads them (LG-35); every other reader asks only the questions of View (LG-38). */
export interface Rows {
  /** The row that holds at the view's `seq` for a key. */
  row(key: string): Row | null;
}

/**
 * RF-09: one edge into a target — a reference to a block or an event, or an external link to a URI — from the record
 * `source` (`id@n` of an entity revision, the `id` of an event) at `path` of its body, with its edge label, `null`
 * where the schema names none (G-31), and the reference or URI as written.
 */
export type Referrer = {
  readonly target: string;
  readonly label: string | null;
  readonly source: string;
  readonly path: string;
  readonly ref: string;
};

/** LG-19, KR-19: a unique key — the value at `path` of a body of the type `type` (its `id`), among the entities of `namespace`. */
export type Unique = {
  readonly namespace: string;
  readonly type: string;
  readonly path: string;
  readonly value: JsonValue;
};

/** TR-25: the standing of a reference. Its rows and the rules of trust that compute them arrive with S0-14. */
export type Standing = {
  readonly inForce: boolean;
  readonly basis: string;
  readonly use: string;
  readonly live: boolean | null;
};

/** The read view (LG-38): the questions asked at one `seq`; `tuple` arrives with S1. */
export interface View {
  readonly seq: number;
  /** The current revision of an entity (TR-22), or `null`. Until S0-14 brings in force, the revision written last. */
  current(id: string): Record | null;
  /** The latest revision of an entity — the highest `rev` (TR-22) — or `null`. */
  latest(id: string): Record | null;
  /** The revision `n` of an entity, or `null`. */
  revision(id: string, n: number): Record | null;
  /** RF-09: who points at a target, by key; with `label`, only the edges of that label — `null` for edges with none. */
  referrers(target: string, label?: string | null): readonly Referrer[];
  /** LG-19: the `id` of the entity that holds a unique key, or `null`. */
  holder(unique: Unique): string | null;
  /** TR-25: the standing of a reference, or `null`. */
  standing(ref: string): Standing | null;
  /** The current revisions of the entities of these types (by `id`, any revision) in these namespaces, by `id`. */
  blocks(types: readonly string[], namespaces: readonly string[]): readonly Record[];
  /** LG-30: the bytes of an evidence file a commit up to `seq` cited, by its hash (KR-12), or `null`; opaque in S0. */
  evidence(hash: string): Uint8Array | null;
}

/*
 * The key schema of rows (LG-34): a prefix per kind of projection, then what names the row. An `id` (KR-06) and a hash
 * (KR-12) are written as they are — their grammars hold no `:` or `@` that would make two keys one; a key of several
 * parts is the canonical JSON of their array, so that a part may be any string or value and a prefix of the array is a
 * prefix of the key.
 */
export const KEYS = {
  current: "current:",
  latest: "latest:",
  revision: "revision:",
  referrers: "referrers:",
  holder: "holder:",
  standing: "standing:",
  evidence: "evidence:",
} as const;

/** The key of the current revision of an entity. */
export const currentKey = (id: string): string => `${KEYS.current}${id}`;

/** The key of the latest revision of an entity. */
export const latestKey = (id: string): string => `${KEYS.latest}${id}`;

/** The key of the revision `n` of an entity. */
export const revisionKey = (id: string, n: number): string => `${KEYS.revision}${id}@${n}`;

/** The key of one edge: its target, label, source and path. */
export const referrerKey = (r: Referrer): string => `${KEYS.referrers}${serialize([r.target, r.label, r.source, r.path])}`;

/** The prefix of the keys of the edges into a target, of one label if it is given: the canonical JSON of the array, open. */
function referrersPrefix(target: string, label: string | null | undefined): string {
  const parts = label === undefined ? [target] : [target, label];
  return `${KEYS.referrers}${serialize(parts).slice(0, -1)},`;
}

/** The key of a unique key. */
export const holderKey = (u: Unique): string => `${KEYS.holder}${serialize([u.namespace, u.type, u.path, u.value])}`;

/** The key of the standing of a pinned reference `id@n`, or of an event `id`. */
export const standingKey = (ref: string): string => `${KEYS.standing}${ref}`;

/** The key of an evidence file a commit cited. */
export const evidenceKey = (hash: string): string => `${KEYS.evidence}${hash}`;

const order = (a: Row, b: Row) => compareText(a.key, b.key) || a.from - b.from;

/** Rows by key, then by `from` (CONVENTIONS.md §5.5). */
export const sortRows = (rows: readonly Row[]): Row[] => [...rows].sort(order);

const idOf = (r: Row) => `${r.key}@${r.from}`;

/**
 * The rows after a delta: a closed row replaces the open one it closes, an opened row is added. Fold closes only a row
 * its view holds (LG-35), so a delta that closes a row the rows do not hold open — none or one closed before — is a
 * bug of the ledger, never a no-op.
 */
export function withDelta(rows: readonly Row[], delta: Delta): Row[] {
  const closed = new Map(delta.filter((r) => r.to !== null).map((r) => [idOf(r), r]));
  const ids = new Set(rows.filter((r) => r.to === null).map(idOf));
  const unknown = [...closed.keys()].find((id) => !ids.has(id));
  if (unknown !== undefined) throw new Error(`bug: a delta closes the row ${unknown}, which the rows do not hold`);
  const kept = rows.map((r) => closed.get(idOf(r)) ?? r);
  return sortRows([...kept, ...delta.filter((r) => r.to === null)]);
}

/** The rows that hold at `seq` — `from ≤ seq`, `to` null or greater — by key; without `seq`, the rows that hold now. */
export function held(rows: readonly Row[], seq = Number.POSITIVE_INFINITY): ReadonlyMap<string, Row> {
  return new Map(rows.filter((r) => r.from <= seq && (r.to === null || r.to > seq)).map((r) => [r.key, r]));
}

/** The `id` of the entity a reference names — the type of a record, `type@n` — or `null`. */
function entityOf(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed.ok && parsed.value.kind === "entity" ? parsed.value.id : null;
}

/** A reference without its fragment, pinned: `id@n` of an entity — a floating one at its current revision — or an event `id`; `null` for none. */
function pinnedOf(ref: string, current: (id: string) => Record | null): string | null {
  const parsed = parseRef(ref);
  if (!parsed.ok) return null;
  const target = parsed.value;
  if (target.kind === "event") return target.id;
  const rev = target.rev ?? current(target.id)?.rev;
  return rev === undefined ? null : `${target.id}@${rev}`;
}

/**
 * `view(seq)`: the rows with `from ≤ seq` and `to` null or greater, and the evidence files the store holds, of which a
 * view gives only those a commit up to `seq` cited.
 */
export function viewOf(seq: number, rows: readonly Row[], files: readonly Evidence[] = []): View & Rows {
  const holding = held(rows, seq);
  let sorted: readonly Row[] | null = null;
  const row = (key: string) => holding.get(key) ?? null;
  const under = (prefix: string): JsonValue[] => (sorted ??= sortRows([...holding.values()])).filter((r) => r.key.startsWith(prefix)).map((r) => r.value);
  // Fold writes these rows (fold.ts): a revision row holds the record, a holder row `{id}`, an edge row its referrer.
  const record = (key: string) => (row(key)?.value ?? null) as Record | null;
  const current = (id: string) => record(currentKey(id));
  // TR-25: a floating reference stands as the current revision it resolves to (RF-02); a pinned one as written.
  const standing = (ref: string) => {
    const pinned = pinnedOf(ref, current);
    return pinned === null ? null : ((row(standingKey(pinned))?.value ?? null) as Standing | null);
  };
  return {
    seq,
    row,
    current,
    latest: (id) => record(latestKey(id)),
    revision: (id, n) => record(revisionKey(id, n)),
    referrers: (target, label) => under(referrersPrefix(target, label)) as Referrer[],
    holder: (unique) => (row(holderKey(unique))?.value as { readonly id: string } | undefined)?.id ?? null,
    standing,
    blocks: (types, namespaces) =>
      (under(KEYS.current) as Record[]).filter((r) => types.includes(entityOf(r.type) ?? "") && namespaces.includes(namespaceOf(r.id) ?? "")),
    evidence: (hash) => (row(evidenceKey(hash)) === null ? null : (files.find((f) => f.hash === hash)?.bytes ?? null)),
  };
}

/** What `keptRows` gives an adapter: the rows handed on opening, each delta, and `row` and `rows` of the port `store`. */
export interface KeptRows {
  readonly keep: (rows: readonly Row[]) => Promise<void>;
  /** The rows after the delta of an `append`, checked now — a bug is thrown before anything is written; kept once the returned function runs. */
  readonly apply: (delta: Delta) => () => void;
  readonly row: (key: string) => Promise<Row | null>;
  readonly rows: (prefix: string) => AsyncIterable<Row>;
}

/**
 * The rows a store keeps, for its adapter (LG-02, Q-27): `keep` takes the rows the ledger folds from genesis when it
 * opens the store, `apply` the delta of each `append` — so an append stays atomic: the rows change only after the line
 * is written; `row` and `rows` answer the port, in the order of `sortRows`.
 */
export function keptRows(): KeptRows {
  let rows: readonly Row[] = [];
  return {
    keep(folded) {
      rows = folded;
      return Promise.resolve();
    },
    apply(delta) {
      const after = withDelta(rows, delta);
      return () => {
        rows = after;
      };
    },
    row: (key) => Promise.resolve(held(rows).get(key) ?? null),
    async *rows(prefix) {
      for (const row of sortRows([...held(rows).values()].filter((r) => r.key.startsWith(prefix)))) yield await Promise.resolve(row);
    },
  };
}
