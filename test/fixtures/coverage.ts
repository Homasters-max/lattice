// Fitness test of ST-17: every rule ID a hard check enforces has a fixture
// that triggers it and one that passes it. Layout and format: CONVENTIONS.md.
// The rule IDs of the design are read by the codec, as LATTICE reads it.
import { idOf, parse, type Section } from "../../src/codec/index.js";
import { ROOT } from "../../src/kernel/index.js";

/** One `<case>.json` under `trigger/` or `pass/`; `data` is the parsed JSON, or `undefined` if it did not parse. */
export type FixtureCase = {
  readonly name: string;
  readonly data: unknown;
};

/** The folder `test/fixtures/<RULE-ID>/`; `null` for a missing `trigger/` or `pass/`. */
export type FixtureFolder = {
  readonly name: string;
  readonly trigger: readonly FixtureCase[] | null;
  readonly pass: readonly FixtureCase[] | null;
};

export type CoverageInput = {
  /** Rule IDs from the registries `src/**\/rules.ts`. */
  readonly registered: ReadonlySet<string>;
  readonly folders: readonly FixtureFolder[];
  /** Rule IDs defined in `docs/design`. */
  readonly design: ReadonlySet<string>;
};

const undefinedId = (id: string) => `${id}: not a rule ID defined in docs/design`;

function auditRegistered({ registered, folders, design }: CoverageInput): string[] {
  const names = new Set(folders.map((f) => f.name));
  return [...registered].flatMap((id) => {
    if (!design.has(id)) return [undefinedId(id)];
    return names.has(id) ? [] : [`${id}: no folder test/fixtures/${id}/`];
  });
}

function auditCases(folder: string, kind: "trigger" | "pass", cases: readonly FixtureCase[] | null): string[] {
  if (cases === null || cases.length === 0) return [`${folder}: no ${kind}/ cases`];
  return cases.flatMap((c) => {
    const at = `${folder}/${kind}/${c.name}`;
    if (!c.name.endsWith(".json")) return [`${at}: a case is a .json file`];
    return c.data === undefined ? [`${at}: not valid JSON`] : [];
  });
}

function auditFolder(folder: FixtureFolder, { registered, design }: CoverageInput): string[] {
  if (!design.has(folder.name)) return [undefinedId(folder.name)];
  return [
    ...(registered.has(folder.name) ? [] : [`${folder.name}: no registry src/**/rules.ts declares it`]),
    ...auditCases(folder.name, "trigger", folder.trigger),
    ...auditCases(folder.name, "pass", folder.pass),
  ];
}

/** Problems of rule fixture coverage, sorted; empty when coverage holds. */
export function auditCoverage(input: CoverageInput): string[] {
  const problems = [...auditRegistered(input), ...input.folders.flatMap((f) => auditFolder(f, input))];
  return [...new Set(problems)].sort();
}

/** A document of `docs/design`: its file name and its bytes. */
export type DesignDocument = { readonly name: string; readonly bytes: Uint8Array };

/** The clauses of a section and of its subsections — the table rows with a rule ID (RM-01). */
const clausesOf = (section: Section): string[] =>
  section.items.flatMap((item) => (item.type === "section" ? clausesOf(item) : item.type === "clauses" ? item.rows.map(idOf) : []));

/**
 * Rule IDs defined in the design: the IDs of the clauses the codec reads from each document (RM-01, RM-02). A
 * document the codec refuses is no design to audit against — named with its rejections.
 */
export function designRuleIds(documents: readonly DesignDocument[]): Set<string> {
  return new Set(
    documents.flatMap(({ name, bytes }) => {
      const parsed = parse(bytes, { ...ROOT, path: `/${name}` });
      if (!parsed.ok) throw new Error(`${name}: ${parsed.rejections.map((r) => `${r.rule} at ${r.path}`).join(", ")}`);
      return clausesOf(parsed.value);
    }),
  );
}
