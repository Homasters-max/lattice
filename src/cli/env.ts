// What a command reaches: its output streams and the assembled ports.
import type { Assembled } from "../assembly/index.js";

export interface CliEnv {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** `null` while no store is configured. */
  readonly assembled: Assembled | null;
}
