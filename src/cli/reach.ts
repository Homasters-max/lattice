// What every command reaches (RT-32): its output streams, the assembled ports
// and the folder it runs in — and how it prints rejections, one line each.
import type { Assembly, Rejection } from "../assembly/index.js";

export type Print = (text: string) => void;

/** The output streams, the assembled ports — `null` while no store is configured — and the working folder. */
export interface Reach {
  readonly out: Print;
  readonly err: Print;
  readonly assembled: Assembly | null;
  readonly cwd: string;
}

const intentOf = (r: Rejection) => (r.intent === null ? "" : ` (intent ${JSON.stringify(r.intent)})`);
const lineOf = (r: Rejection) => `${r.rule} at ${r.path}${intentOf(r)}: ${r.message}\n`;

/** LG-17: the rejections of a command, their count first, one line each with its rule ID and path. */
export const rejectionLines = (rejections: readonly Rejection[]): string => `rejections: ${rejections.length}\n${rejections.map(lineOf).join("")}`;
