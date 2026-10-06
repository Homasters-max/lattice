// Fitness test of ST-17: every rule ID a hard check enforces has a fixture
// that triggers it and one that passes it. Layout and format: CONVENTIONS.md.

/** One `<case>.json` under `trigger/` or `pass/`; `data` is the parsed JSON, or `undefined` if it did not parse. */
export interface FixtureCase {
  readonly name: string;
  readonly data: unknown;
}

/** The folder `test/fixtures/<RULE-ID>/`; `null` for a missing `trigger/` or `pass/`. */
export interface FixtureFolder {
  readonly name: string;
  readonly trigger: readonly FixtureCase[] | null;
  readonly pass: readonly FixtureCase[] | null;
}

export interface CoverageInput {
  /** Rule IDs from the registries `src/**\/rules.ts`. */
  readonly registered: ReadonlySet<string>;
  readonly folders: readonly FixtureFolder[];
  /** Rule IDs defined in `docs/design`. */
  readonly design: ReadonlySet<string>;
}

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

const RULE_ROW = /^\|\s*([A-Z]{2}-\d{2})\s*\|/;

/** Rule IDs defined by the rows of the rule tables in the given md texts; fenced blocks are skipped. */
export function designRuleIds(texts: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const text of texts) {
    let fence = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("```")) fence = !fence;
      const id = fence ? undefined : RULE_ROW.exec(line)?.[1];
      if (id !== undefined) ids.add(id);
    }
  }
  return ids;
}
