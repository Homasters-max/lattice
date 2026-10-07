// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md §4).
// The checks of landing run through `land` itself, as a dry run on a
// `git-fixture` of the fixture's branches; the checks with no glue around them
// — a JSON text, a proposal value, apply, the lines of a store — run alone.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileOf } from "../../src/adapters/store-jsonl/index.js";
import { LG_42, parse, RM_01, RM_02 } from "../../src/codec/index.js";
import {
  checkBody,
  checkFormat,
  checkHeader,
  checkRev,
  checkSchema,
  checkUri,
  isJsonObject,
  KR_04,
  KR_06,
  KR_07,
  KR_08,
  KR_10,
  KR_11,
  KR_13,
  KR_18,
  KR_19,
  KR_21,
  KR_23,
  KR_24,
  parseJson,
  parseJsonBytes,
  parseRef,
  refused,
  type Format,
  type JsonValue,
  type Kind,
  type Rejection,
  type Schema,
} from "../../src/kernel/index.js";
import {
  apply,
  createView,
  encodeCommit,
  land,
  LG_04,
  LG_05,
  LG_06,
  LG_09,
  LG_10,
  LG_23,
  LG_54,
  NO_FACTS,
  openLines,
  readProposal,
  signCommit,
  signProposal,
  verifyChain,
  verifyProposal,
  type Commit,
} from "../../src/ledger/index.js";
import { landingPortsForTests, type GitFixtureOptions } from "../support/assembly.js";
// The land session of every fixture: apply takes the commit's `by` and `at` from it (LG-22).
import { keyOfLand, LAND, landedChain } from "../support/chain.js";
import { testKey } from "../support/keys.js";
import type { CheckOutcome, FixtureCheck } from "./run.js";


const field = (input: unknown, name: string): unknown => (input as { readonly [k: string]: unknown })[name];

/** `input`: `{ text }`, or `{ bytes }` — the numbers of the bytes — for input that is not UTF-8. */
const json: FixtureCheck = {
  enforces: [KR_10.id],
  run: (input) => {
    const bytes = field(input, "bytes");
    return Array.isArray(bytes) ? parseJsonBytes(Uint8Array.from(bytes as number[])) : parseJson(String(field(input, "text")));
  },
};

/** `input`: `{ format, value }` — a format of KR-11 and a JSON value, checked from the root. */
const format: FixtureCheck = {
  enforces: [KR_11.id],
  run: (input) => refused(checkFormat(field(input, "format") as Format, field(input, "value") as JsonValue, { intent: null, path: "" })) ?? { ok: true },
};

/** `rev` against the kind of the record's type, when the fixture gives the kind (KR-05). */
function revOf(record: JsonValue, kind: Kind | undefined): readonly Rejection[] {
  return kind === undefined ? [] : checkRev(kind, isJsonObject(record) ? record.rev : undefined, { intent: null, path: "/rev" });
}

/**
 * `input`: `{ record, kind? }` — the header of a record, checked from the root as a store opens; with `kind`, the kind
 * of its type, `rev` against it too, as phase 2 of apply will (KR-05).
 */
const header: FixtureCheck = {
  enforces: [KR_04.id, KR_06.id, KR_07.id, KR_08.id, KR_11.id],
  run: (input) => {
    const record = field(input, "record") as JsonValue;
    return refused([...checkHeader(record, ""), ...revOf(record, field(input, "kind") as Kind | undefined)]) ?? { ok: true };
  },
};

/** `input`: `{ ref }` — a string parsed as a reference from the root. */
const ref: FixtureCheck = {
  enforces: [KR_23.id],
  run: (input) => parseRef(String(field(input, "ref"))),
};

/** `input`: `{ value }` — a JSON value checked as an external link from the root. */
const uri: FixtureCheck = {
  enforces: [KR_24.id],
  run: (input) => refused(checkUri(field(input, "value") as JsonValue, { intent: null, path: "" })) ?? { ok: true },
};

/** `input`: `{ schema, kind }` — the schema of a type of this kind, checked from the root (KR-18, KR-19). */
const schema: FixtureCheck = {
  enforces: [KR_18.id, KR_19.id],
  run: (input) => refused(checkSchema(field(input, "schema") as JsonValue, field(input, "kind") as Kind, { intent: null, path: "" })) ?? { ok: true },
};

/** The schema `types` gives a pinned reference, as the caller of validate resolves `$ref` (KR-21); `null` when it gives none. */
function resolveFrom(types: unknown): (ref: string) => Schema | null {
  const known = (types ?? {}) as { readonly [ref: string]: Schema };
  return (ref) => (Object.hasOwn(known, ref) ? (known[ref] ?? null) : null);
}

/** `input`: `{ body, schema, types? }` — a body against a schema, checked from the root; `$ref` resolved from `types`. */
const body: FixtureCheck = {
  enforces: [KR_21.id],
  run: (input) => {
    const resolve = resolveFrom(field(input, "types"));
    return refused(checkBody(field(input, "body") as JsonValue, field(input, "schema") as Schema, resolve, { intent: null, path: "" })) ?? { ok: true };
  },
};

/** `input`: `{ proposal }`, read as a proposal value, refused from its root. */
const proposal: FixtureCheck = {
  enforces: [LG_09.id],
  run: (input) => readProposal(field(input, "proposal") as JsonValue),
};

/** A proposal applied on an empty ledger. */
function applied(value: JsonValue) {
  const read = readProposal(value);
  return read.ok ? apply(createView(0, []), read.value, LAND, []) : read;
}

/** `input`: `{ proposal }`, applied on an empty ledger: phase 1 checks ids, canon and the body limit. */
const applyCheck: FixtureCheck = {
  enforces: [KR_06.id, KR_10.id, KR_13.id],
  run: (input) => applied(field(input, "proposal") as JsonValue),
};

/** The line of the commit apply forms for a proposal on an empty ledger. */
function lineOf(value: JsonValue): string {
  const commit = applied(value);
  if (!commit.ok || commit.value === "no-op") throw new Error("bug: the pass proposal of a store fixture applies to a commit");
  return encodeCommit(commit.value);
}

/** Bytes given in a fixture: a string, as UTF-8, or the numbers of the bytes, for bytes that are not UTF-8. */
const bytesOf = (v: unknown): Uint8Array => (Array.isArray(v) ? Uint8Array.from(v as number[]) : new TextEncoder().encode(String(v)));

/**
 * `input`: `{ lines }` — the raw lines of `store/knowledge.jsonl`, each a string or the numbers of its bytes, as a
 * broken file can hold them; a trigger needs lines apply never forms (Q-23) — or `{ proposal }`, whose line apply
 * forms.
 */
const store: FixtureCheck = {
  enforces: [KR_10.id, LG_06.id, KR_04.id],
  run: (input) => {
    const raw = field(input, "lines");
    return openLines(raw === undefined ? [new TextEncoder().encode(lineOf(field(input, "proposal") as JsonValue))] : (raw as unknown[]).map(bytesOf));
  },
};

/** `input`: `{ proposal, signedBy?, session }` — a proposal, signed first by the test key `signedBy` if given, verified by the test key `session`. */
const signature: FixtureCheck = {
  enforces: [LG_10.id],
  run: (input) => {
    const read = readProposal(field(input, "proposal") as JsonValue);
    if (!read.ok) return read;
    const by = field(input, "signedBy");
    const p = typeof by === "string" ? signProposal(read.value, testKey(by).key, NO_FACTS) : read.value;
    return refused(verifyProposal(p, testKey(String(field(input, "session"))).publicKey, NO_FACTS)) ?? { ok: true };
  },
};

/** A change of a landed commit in a trigger: fields set by JSON Pointer, then signed again by the test key `signedBy` if given. */
type Edit = { readonly line: number; readonly set?: { readonly [pointer: string]: JsonValue }; readonly signedBy?: string };

/** `value` with the value at a JSON Pointer replaced; the pointer names a member or an item that is there. */
function setAt(value: JsonValue, [head, ...rest]: readonly string[], to: JsonValue): JsonValue {
  if (head === undefined) return to;
  const name = head.replaceAll("~1", "/").replaceAll("~0", "~");
  if (Array.isArray(value)) return value.map((v: JsonValue, i) => (String(i) === name ? setAt(v, rest, to) : v));
  if (!isJsonObject(value) || !(name in value)) throw new Error(`bug: a fixture edits ${name}, which the commit has not`);
  return { ...value, [name]: setAt(value[name]!, rest, to) };
}

function edited(c: Commit, edit: Edit): Commit {
  const set = Object.entries(edit.set ?? {}).reduce<JsonValue>((v, [pointer, to]) => setAt(v, pointer.split("/").slice(1), to), c);
  return edit.signedBy === undefined ? (set as Commit) : signCommit(set as Commit, testKey(edit.signedBy).key);
}

/**
 * `input`: `{ proposals, edits? }` — the chain landing forms for the proposals (`landedChain`), verified as the lines
 * of `store/knowledge.jsonl` with the key of the land session. `edits` change landed commits as a broken store holds
 * them: the raw input of a trigger only (Q-23).
 */
const chain: FixtureCheck = {
  enforces: [LG_04.id, LG_05.id, LG_06.id],
  run: (input) => {
    const edits = (field(input, "edits") ?? []) as readonly Edit[];
    const commits = landedChain(field(input, "proposals") as readonly JsonValue[]).map((c, i) => edits.filter((e) => e.line === i + 1).reduce(edited, c));
    return refused(verifyChain(commits, keyOfLand, "/store/knowledge.jsonl")) ?? { ok: true };
  },
};

/** `input`: `{ text }` — a document in md, parsed as the codec reads it, refused from the root by line (LG-42, RM-01, RM-02). */
const md: FixtureCheck = {
  enforces: [LG_42.id, RM_01.id, RM_02.id],
  run: (input) => parse(bytesOf(field(input, "text"))),
};

type FixtureFile = string | Uint8Array | null;

/**
 * A file of a branch in a fixture: a string, its text; `null`, removed; `{ json }`, the JSON text of a value;
 * `{ landed }`, the `store/knowledge.jsonl` landing writes for one proposal on an empty store — the line apply forms,
 * framed by `fileOf` of `store-jsonl`; `{ bytes }`, the numbers of bytes that are not UTF-8. A raw store or tree that
 * no landing writes is the input of a trigger only (Q-23).
 */
function fileOfFixture(v: unknown): FixtureFile {
  if (v === null || typeof v === "string") return v;
  if (field(v, "landed") !== undefined) return fileOf(lineOf(field(v, "landed") as JsonValue));
  if (field(v, "bytes") !== undefined) return bytesOf(field(v, "bytes"));
  return JSON.stringify(field(v, "json"));
}

/** The branches of a fixture, in the order it gives them, as `git-fixture` takes them. */
function branchesOf(v: unknown): GitFixtureOptions["branches"] {
  const branches = v as { readonly [name: string]: { readonly from?: string; readonly files: { readonly [path: string]: unknown } } };
  return Object.fromEntries(
    Object.entries(branches).map(([name, b]) => [name, { ...b, files: Object.fromEntries(Object.entries(b.files).map(([path, f]) => [path, fileOfFixture(f)])) }]),
  );
}

/** The outcome of a dry run as a hard check: refused with its rejections, or accepted where it would land. */
async function dryRun(dir: string, input: unknown): Promise<CheckOutcome> {
  const request = String(field(input, "request"));
  const out = await land(landingPortsForTests({ dir, branches: branchesOf(field(input, "branches")) }), request, { dryRun: true });
  if (out.outcome === "rejections") return { ok: false, rejections: out.rejections };
  if (out.outcome === "commit" || out.outcome === "no-op") return { ok: true };
  throw new Error(`bug: a fixture of landing ends commit, no-op or rejections; ${request} ended ${out.outcome}`);
}

/**
 * `input`: `{ branches, request }` — the branches of a `git-fixture`, `main` among them, each `{ from?, files }` with
 * files as `fileOfFixture` reads them — and the change request a dry run of landing checks (LG-26). Every path is
 * from the root of the tree of the change request (Q-29).
 */
const landCheck: FixtureCheck = {
  enforces: [LG_54.id, LG_23.id, KR_10.id, LG_09.id],
  run: async (input) => {
    const dir = mkdtempSync(join(tmpdir(), "lattice-fixture-"));
    try {
      return await dryRun(dir, input);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const CHECKS: { readonly [check: string]: FixtureCheck } = {
  json,
  format,
  header,
  ref,
  uri,
  schema,
  body,
  proposal,
  apply: applyCheck,
  store,
  signature,
  chain,
  land: landCheck,
  md,
};
