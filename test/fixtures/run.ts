// Runs one rule fixture through the hard check it names (ST-17, LG-17).
// A fixture is test/fixtures/<RULE-ID>/trigger/<case>.json or pass/<case>.json:
// `{ "check", "input", "expect" }` — `check` names a row of checks.ts, `input`
// is what that row feeds its check, and a trigger's `expect` is
// `{ rule, path, intent? }` with the rule of its folder. A trigger passes when
// the check refuses and one rejection has that rule and path (and intent, if
// given) — others beside it are allowed; a pass has no `expect` and passes when
// the check accepts the input whole. What a fixture breaks: CONVENTIONS.md §4.2.

type Refusal = {
  readonly rule: string;
  readonly path: string;
  readonly intent: string | null;
};

/** What the runner needs of a hard check's outcome; the full types live in `src/kernel`. */
export type CheckOutcome = { readonly ok: true } | { readonly ok: false; readonly rejections: readonly Refusal[] };

/**
 * A hard check as the fixture table sees it: the rule IDs it enforces and a function over the fixture's `input` —
 * asynchronous where the check waits on a port, as landing does (CONVENTIONS.md §2.5).
 */
export interface FixtureCheck {
  readonly enforces: readonly string[];
  readonly run: (input: unknown) => CheckOutcome | Promise<CheckOutcome>;
}

type Case = {
  readonly check: string;
  readonly input: unknown;
  readonly expect?: unknown;
};

type Expected = {
  readonly rule: string;
  readonly path: string;
  readonly intent?: string | null;
};

const isObject = (v: unknown): v is { readonly [key: string]: unknown } => typeof v === "object" && v !== null && !Array.isArray(v);
const isCase = (v: unknown): v is Case => isObject(v) && typeof v.check === "string" && "input" in v;

function isExpected(v: unknown, rule: string): v is Expected {
  if (!isObject(v) || v.rule !== rule || typeof v.path !== "string") return false;
  return v.intent === undefined || v.intent === null || typeof v.intent === "string";
}

function show(r: Expected): string {
  return r.intent === undefined || r.intent === null ? `${r.rule} at ${r.path}` : `${r.rule} at ${r.path} (intent ${JSON.stringify(r.intent)})`;
}

async function runPass(check: FixtureCheck, c: Case): Promise<string | null> {
  if ("expect" in c) return "a pass case has no expect";
  const out = await check.run(c.input);
  return out.ok ? null : `refused: ${out.rejections.map(show).join(", ")}`;
}

async function runTrigger(check: FixtureCheck, rule: string, c: Case): Promise<string | null> {
  const want = c.expect;
  if (!isExpected(want, rule)) return "a trigger expects {rule, path} with the folder's rule";
  const out = await check.run(c.input);
  if (out.ok) return `accepted; expected ${show(want)}`;
  const hit = out.rejections.some(
    (r) => r.rule === want.rule && r.path === want.path && (want.intent === undefined || r.intent === want.intent),
  );
  return hit ? null : `no rejection ${show(want)}; got ${out.rejections.map(show).join(", ")}`;
}

/** The problem with one fixture case, or `null` when it does what its folder says. */
export async function runFixture(
  checks: { readonly [check: string]: FixtureCheck },
  rule: string,
  kind: "trigger" | "pass",
  data: unknown,
): Promise<string | null> {
  if (!isCase(data)) return "a case names its check and has an input";
  const check = Object.hasOwn(checks, data.check) ? checks[data.check] : undefined;
  if (check === undefined) return `check "${data.check}" is not in test/fixtures/checks.ts`;
  if (!check.enforces.includes(rule)) return `check "${data.check}" does not enforce ${rule}`;
  return kind === "pass" ? runPass(check, data) : runTrigger(check, rule, data);
}
