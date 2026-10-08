// The budget of a test run (RT-21 after S0-39; S0-41): randomness takes one
// seed, a property counts its cases, and time is only a safeguard far above
// that budget — so two runs of the same input run the same cases.

/** The seed of fast-check when `LATTICE_SEED` is not set. */
export const DEFAULT_SEED = 20261008;

/** The limit on the time of one test or hook: a safeguard above the budget of cases, never the budget itself. */
export const SAFEGUARD_MS = 30_000;

const INT32 = 2 ** 31;

/** The seed `LATTICE_SEED` names, or DEFAULT_SEED without it; a value that is not a 32-bit integer is refused, never corrected. */
export function seedOf(text: string | undefined): number {
  if (text === undefined || text === "") return DEFAULT_SEED;
  const n = /^-?\d{1,10}$/.test(text) ? Number(text) : Number.NaN;
  if (!(n >= -INT32 && n < INT32)) throw new Error(`LATTICE_SEED is a 32-bit integer from ${-INT32} to ${INT32 - 1}, got "${text}"`);
  return n;
}
