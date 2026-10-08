// The types of scripts/prove.mjs for the tests that import it.
export type Chosen = {
  readonly set: string;
  readonly run: boolean;
  readonly reasons: readonly string[];
  readonly hash: string;
  readonly seed: number;
  readonly reach: readonly string[];
};
export declare function select(options?: { readonly dir?: string; readonly base?: string }): { readonly base: string; readonly sets: readonly Chosen[]; readonly files: readonly string[] };
export declare function seedOf(hash: string): number;
