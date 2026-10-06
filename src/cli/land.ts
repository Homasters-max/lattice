// `lattice land <request> [--dry-run]` (RT-Z03, LG-22, LG-26): thin — it
// parses arguments, asks assembly to land and prints the outcome.
import type { LandingOutcome, Rejection } from "../assembly/index.js";
import type { CliEnv } from "./env.js";

const USAGE = "usage: lattice land <request> [--dry-run]\n";

const records = (n: number) => `${n} record${n === 1 ? "" : "s"}`;
const intentOf = (r: Rejection) => (r.intent === null ? "" : ` (intent ${JSON.stringify(r.intent)})`);
const lineOf = (r: Rejection) => `${r.rule} at ${r.path}${intentOf(r)}: ${r.message}\n`;

function report(o: LandingOutcome, env: CliEnv): number {
  switch (o.outcome) {
    case "commit": {
      const n = records(o.commit.records.length);
      env.out(o.pushed ? `landed: commit ${o.commit.seq} with ${n}\n` : `dry run: commit ${o.commit.seq} would land ${n}\n`);
      return 0;
    }
    case "rejections":
      env.out(`rejections: ${o.rejections.length}\n${o.rejections.map(lineOf).join("")}`);
      return 1;
    case "moved":
      env.out("moved: main moved while landing\n");
      return 1;
    case "conflict":
      env.out(`conflict: ${o.paths.join(", ")}\n`);
      return 1;
  }
}

export async function landCommand(args: readonly string[], env: CliEnv): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const [request, ...extra] = args.filter((a) => a !== "--dry-run");
  if (request === undefined || request.startsWith("-") || extra.length > 0) {
    env.err(USAGE);
    return 2;
  }
  if (env.assembled === null) {
    env.err("lattice land: no store is configured — store/lattice.json arrives with plan task S0-23\n");
    return 2;
  }
  return report(await env.assembled.land(request, { dryRun }), env);
}
