import type { Section } from "./model.js";

export function print(document: Section): Uint8Array {
  throw new Error(`bug: not yet ${document.heading}`);
}
