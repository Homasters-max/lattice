import type { Result } from "../kernel/index.js";
import type { Section } from "./model.js";

export function parse(bytes: Uint8Array, path = ""): Result<Section> {
  throw new Error(`bug: not yet ${bytes.length} ${path}`);
}
