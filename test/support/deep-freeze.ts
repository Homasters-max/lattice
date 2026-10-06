// Freezes a value and everything it holds, so that a function that mutates
// its input fails in the test (CONVENTIONS.md §1).

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
