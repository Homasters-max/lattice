// The programs a test starts (ST-18 after S0-39; S0-42): a program of this project, run as the code under test — a
// node entry of the repository, or one the test built into its scratch folder — or a tool its environment names.
// scripts/prove.mjs reads the entry of `program("<entry>")` from the source of a test: the entry and what it imports
// count in the hash of the test set, as its own imports do.
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { inRepository, inScratch, repoRoot } from "./files.js";

/** The tools the environment of the tests names: started by name, as the code under test starts them. */
export const ENVIRONMENT: readonly string[] = ["git"];

/** How a run of a program ended: its exit code (1 when a signal ended it) and its output. */
export type Ran = { readonly status: number; readonly stdout: string; readonly stderr: string };

export type RunOptions = { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly input?: string };

export interface Program {
  /** Runs the program to its end and returns how it ended. */
  run(args: readonly string[], options?: RunOptions): Ran;
  /** Starts the program; resolves when it ends. */
  start(args: readonly string[], options?: RunOptions): Promise<Ran>;
}

const MAX_BUFFER = 1 << 26;

/** The command and leading arguments of `entry`, or a refusal of ST-18 for what is no program of the project. */
function commandOf(entry: string): readonly [string, readonly string[]] {
  if (ENVIRONMENT.includes(entry)) return [entry, []];
  if (isAbsolute(entry)) return [process.execPath, [inScratch(entry)]];
  const file = join(repoRoot, inRepository(entry));
  if (!existsSync(file)) throw new Error(`ST-18: ${entry} is no program of this project nor a tool its environment names (${ENVIRONMENT.join(", ")})`);
  return [process.execPath, [file]];
}

/** `entry`: a tool of ENVIRONMENT, a node entry by its path from the root, or an absolute path inside a scratch folder. */
export function program(entry: string): Program {
  const [command, lead] = commandOf(entry);
  return {
    run: (args, options = {}) => {
      const r = spawnSync(command, [...lead, ...args], { ...options, encoding: "utf8", maxBuffer: MAX_BUFFER, windowsHide: true });
      if (r.error !== undefined && r.status === null) throw r.error;
      return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    },
    start: (args, options = {}) =>
      new Promise((resolve) => {
        const { input, ...rest } = options;
        const child = execFile(command, [...lead, ...args], { ...rest, encoding: "utf8", maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
          resolve({ status: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
        });
        if (input !== undefined) child.stdin?.end(input);
      }),
  };
}
