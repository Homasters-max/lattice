// The CLI (RT-32): thin — it finds the command in the table and runs its
// handler; a command without one names the plan task where it arrives.
import { COMMANDS } from "./commands.js";
import type { CliEnv } from "./env.js";
import { landCommand } from "./land.js";
import { ARRIVES } from "./stubs.js";

export type { CliEnv };

type Handler = (args: readonly string[], env: CliEnv) => Promise<number>;

const HANDLERS: { readonly [command: string]: Handler } = { land: landCommand };

function help(): string {
  const rows = COMMANDS.map((c) => `  ${c.name.padEnd(14)}${c.does}\n`);
  return `usage: lattice <command> [options]\n\nstore commands (RT-32):\n${rows.join("")}`;
}

/** Runs one command; the result is the exit code: 0 done, 1 refused, 2 not run. */
export async function run(argv: readonly string[], env: CliEnv): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === "--help" || name === "-h") {
    env.out(help());
    return 0;
  }
  const handler = HANDLERS[name];
  if (handler !== undefined) return handler(args, env);
  const task = COMMANDS.some((c) => c.name === name) ? ARRIVES[name] : undefined;
  env.err(task === undefined ? `lattice: unknown command ${name}; see lattice --help\n` : `lattice ${name}: not yet — arrives with plan task ${task}\n`);
  return 2;
}
