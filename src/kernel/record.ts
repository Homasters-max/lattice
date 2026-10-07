// Records (KR-04…KR-08). The walking skeleton checks the grammar of ids
// (KR-06) and the header on the surface — its fields and their JSON kinds — as
// a store opens (KR-04); exactly these fields, the format of `at` (KR-11,
// checked by `checkFormat`) and `rev` against the kind of the type arrive with
// S0-05 and S0-13.
import type { Kind } from "./id.js";
import { gotOf, isJsonObject, type JsonValue } from "./json.js";
import { reject, type Rejection } from "./rejection.js";
import { KR_04 } from "./rules.js";

/** KR-04: the one header of every record; `rev` only for an entity. */
export type Record = {
  readonly id: string;
  readonly rev?: number;
  readonly type: string;
  readonly hash: string;
  readonly by: string;
  readonly at: string;
  readonly body: JsonValue;
};

type Field = { readonly expected: string; readonly fits: (v: JsonValue | undefined) => boolean };

const STRING: Field = { expected: "a string", fits: (v) => typeof v === "string" };

const HEADER: { readonly [field in keyof Record]-?: Field } = {
  id: STRING,
  rev: { expected: "a revision or absent", fits: (v) => v === undefined || typeof v === "number" },
  type: STRING,
  hash: STRING,
  by: STRING,
  at: STRING,
  body: { expected: "a JSON value", fits: (v) => v !== undefined },
};

/** KR-04: the header of a record, refused field by field at `path` — where the record sits in its input. */
export function checkHeader(value: JsonValue, path: string, kind?: Kind): Rejection[] {
  if (kind === "event") return [];
  if (!isJsonObject(value)) return [reject(KR_04, { intent: null, path, expected: "a record", got: gotOf(value) })];
  return Object.entries(HEADER).flatMap(([name, field]) =>
    field.fits(value[name]) ? [] : [reject(KR_04, { intent: null, path: `${path}/${name}`, expected: field.expected, got: gotOf(value[name]) })],
  );
}
