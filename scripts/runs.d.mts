// The types of scripts/runs.mjs for the tests that import it.
export type Environment = { readonly os: string; readonly node: number; readonly git: number };
export type Run = {
  readonly test_set: string;
  readonly code: string;
  readonly knowledge: string;
  readonly tools: string;
  readonly environment: Environment;
  readonly seed: number;
  readonly outcome: "ok" | "failed" | "budget-exceeded";
  readonly failed: readonly string[];
  readonly ms: number;
  readonly head: string;
  readonly at: string;
};
export declare const RUNS_DAYS: number;
export declare function runsDir(dir: string): string;
export declare function environment(): Environment;
export declare function keyOf(record: Pick<Run, "test_set" | "code" | "knowledge" | "tools" | "environment">): string;
export declare function readRun(runs: string, key: string): Run | null;
export declare function writeRun(runs: string, record: Run): string;
export declare function pruneRuns(runs: string, now: string, days?: number): number;
