// The types of scripts/prove.mjs for the tests that import it.
import type { Environment } from "./runs.mjs";

export type Chosen = {
  readonly set: string;
  readonly run: boolean;
  readonly reasons: readonly string[];
  readonly hash: string;
  readonly seed: number;
  readonly reach: readonly string[];
  readonly code: string;
  readonly knowledge: string;
  readonly tools: string;
  readonly key: string;
};
export declare function select(options?: { readonly dir?: string; readonly base?: string; readonly environment?: Environment | undefined }): {
  readonly base: string;
  readonly sets: readonly Chosen[];
  readonly files: readonly string[];
  readonly environment: Environment;
};
export declare function seedOf(hash: string): number;
