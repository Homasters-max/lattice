// Every test file runs fast-check from one seed and one base size of its
// generators (S0-41): two runs of the same input draw the same cases.
import fc from "fast-check";
import { seedOf } from "./budget.js";

fc.configureGlobal({ seed: seedOf(process.env.LATTICE_SEED), baseSize: "small" });
