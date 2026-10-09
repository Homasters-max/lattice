// RT-32, SL-05: the bin `lattice`. package.json names `dist/cli/main.js`, which
// the build makes from `src/cli/main.ts`; built here into a temporary
// directory, it shows the commands of S0, verifies the `jsonl` store of a
// directory, and refuses to land with exit code 2 until S0-23 gives it the
// working assembly from `store/lattice.json` (Q-13).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitLine, KNOWLEDGE } from "../../src/ledger/index.js";
import { recordedChain } from "../support/chain.js";
import { owned, repoRoot, scratch, type Scratch } from "../support/files.js";
import { note, proposalOf, TYPES } from "../support/notes.js";
import { program, type Program } from "../support/program.js";

let out: Scratch;
let bin: Program;

beforeAll(() => {
  out = scratch("lattice-bin-");
  const built = program("tsc").run(["-p", "tsconfig.build.json", "--outDir", out.dir, "--sourceMap", "false"], { cwd: repoRoot });
  if (built.status !== 0) throw new Error(`bug: the build of src/ failed\n${built.stdout}${built.stderr}`);
  // The build of the package runs as ES modules: package.json says "type": "module".
  out.write("package.json", '{ "type": "module" }\n');
  bin = program(out.path("cli/main.js"));
}, 120_000);
afterAll(() => out.remove());

const lattice = (...args: string[]) => bin.run(args);

describe("the bin lattice (RT-32)", () => {
  it("RT-32: package.json names the build of src/cli/main.ts as the bin lattice", () => {
    const pkg = JSON.parse(owned.text("package.json")) as { bin: { lattice: string } };
    const build = JSON.parse(owned.text("tsconfig.build.json")) as { compilerOptions: { rootDir: string; outDir: string } };
    expect([pkg.bin.lattice, build.compilerOptions.rootDir, build.compilerOptions.outDir]).toEqual(["./dist/cli/main.js", "src", "dist"]);
  });

  it("RT-32: the built bin shows the commands of S0 and exits 0", () => {
    const run = lattice("--help");
    expect([run.status, run.stdout.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim().split(" ")[0])]).toEqual([
      0,
      ["init", "draft", "land", "verify-store", "export", "migrate", "session"],
    ]);
  });

  it("RT-32, LG-05: the built bin verifies the jsonl store of a directory and prints the outcome, exit 0", () => {
    const store = scratch("lattice-bin-store-");
    try {
      store.write(KNOWLEDGE, Uint8Array.from(recordedChain([proposalOf(...TYPES, note("demo/a"))]).flatMap((c) => [...commitLine(c)])));
      const run = lattice("verify-store", store.dir);
      expect([run.status, run.stdout, run.stderr]).toEqual([0, expect.stringMatching(/^verified: 1 commit — chain and signatures \(LG-05\); \d+ rows rebuilt from genesis\n$/), ""]);
    } finally {
      store.remove();
    }
  });

  // Q-13: the bin gets its store with S0-23; until then the path of SL-05 runs through the test assembly.
  it("the built bin has no store yet and does not run land: exit 2", () => {
    const run = lattice("land", "cr/a", "--dry-run");
    expect([run.status, run.stdout, run.stderr]).toEqual([2, "", "lattice land: no store is configured — store/lattice.json arrives with plan task S0-23\n"]);
  });
});
