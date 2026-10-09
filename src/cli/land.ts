// `lattice land <request> [--dry-run]` (RT-Z03, LG-22, LG-26): thin — it
// parses arguments, asks assembly to land and prints the outcome.
import type { LandingOutcome } from "../assembly/index.js";
import { rejectionLines, type Print, type Reach } from "./reach.js";

const USAGE = "usage: lattice land <request> [--dry-run]\n";

const records = (n: number) => `${n} record${n === 1 ? "" : "s"}`;

function report(o: LandingOutcome, out: Print): number {
  switch (o.outcome) {
    case "commit": {
      const n = records(o.commit.records.length);
      out(o.pushed ? `landed: commit ${o.commit.seq} with ${n}\n` : `dry run: commit ${o.commit.seq} would land ${n}\n`);
      return 0;
    }
    case "no-op":
      out(o.pushed ? "landed: no-op — no knowledge commit, the proposal file is removed\n" : "dry run: no-op — the proposal changes no knowledge\n");
      return 0;
    case "rejections":
      out(rejectionLines(o.rejections));
      return 1;
    case "moved":
      out("moved: main moved while landing\n");
      return 1;
    case "conflict":
      out(`conflict: ${o.paths.join(", ")}\n`);
      return 1;
  }
}

export async function landCommand(args: readonly string[], { assembled, out, err }: Reach): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const [request, ...extra] = args.filter((a) => a !== "--dry-run");
  if (request === undefined || request.startsWith("-") || extra.length > 0) {
    err(USAGE);
    return 2;
  }
  if (assembled === null) {
    err("lattice land: no store is configured — store/lattice.json arrives with plan task S0-23\n");
    return 2;
  }
  return report(await assembled.land(request, { dryRun }), out);
}
