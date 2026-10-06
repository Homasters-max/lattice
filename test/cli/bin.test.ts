// RT-32, SL-05: the bin `lattice`. package.json names `dist/cli/main.js`, which
// the build makes from `src/cli/main.ts`; built here into a temporary
// directory, it shows the commands of S0 and refuses to land with exit code 2
// until S0-23 gives it the working assembly from `store/lattice.json` (Q-13).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
let out = "";

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "lattice-bin-"));
  const tsc = join(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json", "--outDir", out, "--sourceMap", "false"], { cwd: root });
  // The build of the package runs as ES modules: package.json says "type": "module".
  writeFileSync(join(out, "package.json"), '{ "type": "module" }\n');
}, 120_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

const lattice = (...args: string[]) => spawnSync(process.execPath, [join(out, "cli/main.js"), ...args], { encoding: "utf8" });

describe("the bin lattice (RT-32)", () => {
  it("RT-32: package.json names the build of src/cli/main.ts as the bin lattice", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { bin: { lattice: string } };
    const build = JSON.parse(readFileSync(join(root, "tsconfig.build.json"), "utf8")) as { compilerOptions: { rootDir: string; outDir: string } };
    expect([pkg.bin.lattice, build.compilerOptions.rootDir, build.compilerOptions.outDir]).toEqual(["./dist/cli/main.js", "src", "dist"]);
  });

  it("RT-32: the built bin shows the commands of S0 and exits 0", () => {
    const run = lattice("--help");
    expect([run.status, run.stdout.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim().split(" ")[0])]).toEqual([
      0,
      ["init", "draft", "land", "verify-store", "export", "migrate", "session"],
    ]);
  });

  // Q-13: the bin gets its store with S0-23.
  it("SL-05: the built bin has no store yet and does not run land: exit 2", () => {
    const run = lattice("land", "cr/a", "--dry-run");
    expect([run.status, run.stdout, run.stderr]).toEqual([2, "", "lattice land: no store is configured — store/lattice.json arrives with plan task S0-23\n"]);
  });
});
