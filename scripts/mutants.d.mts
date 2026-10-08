// The types of scripts/mutants.mjs for the tests that import it.
export type Operator = "refusal" | "logical" | "boundary" | "refusal-field" | "hash-input" | "sort";
export type Mutant = {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly operator: Operator;
  readonly code: string;
  readonly before: string;
  readonly after: string;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
};
export declare const OPERATORS: readonly Operator[];
export declare function mutantsOf(root: string, path: string, text: string, lines: (line: number) => boolean): Mutant[];
export declare function mutate(text: string, mutant: Mutant): string;
export declare function changedMutants(options?: { readonly dir?: string; readonly base?: string }): { readonly base: string; readonly mutants: readonly Mutant[] };
