// `lattice verify-store <path>` (RT-Z03, LG-37): thin — it parses arguments,
// asks assembly to verify the `jsonl` store of the directory and prints the
// outcome: the commits and rows verified, or the rejections of opening it.
import { resolve } from "node:path";
import { verifyStoreAt } from "../assembly/index.js";
import { rejectionLines, type Reach } from "./reach.js";

const USAGE = "usage: lattice verify-store <path>\n";

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

export async function verifyStoreCommand(args: readonly string[], { out, err, cwd }: Reach): Promise<number> {
  const [path, ...extra] = args;
  if (path === undefined || path.startsWith("-") || extra.length > 0) {
    err(USAGE);
    return 2;
  }
  const dir = resolve(cwd, path);
  const o = await verifyStoreAt(dir);
  switch (o.outcome) {
    case "verified":
      out(`verified: ${plural(o.commits, "commit")} — chain, signatures and a rebuild of ${plural(o.rows, "row")} (LG-05, LG-37)\n`);
      return 0;
    case "rejections":
      out(rejectionLines(o.rejections));
      return 1;
    case "no-store":
      err(`lattice verify-store: no store at ${dir} — no store/knowledge.jsonl (LG-50)\n`);
      return 2;
  }
}
