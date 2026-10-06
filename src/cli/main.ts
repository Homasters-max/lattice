#!/usr/bin/env node
// The bin `lattice` (RT-32): process arguments and streams in, exit code out.
import { run } from "./run.js";

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  // store/lattice.json is read from S0-23 (LG-50); until then no command reaches a store.
  assembled: null,
});
