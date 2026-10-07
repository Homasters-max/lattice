// The grammar of an ID (RM-02), written once, in the kernel beside `RuleId`:
// `<PREFIX>-<NN>` for a rule, `<PREFIX>-Z<NN>` for prose and examples, and
// what an author meant as an ID — refused by RM-02 when it is off the grammar.
// The codec reads `md` by it; every rule ID a registry names is of it.
import { describe, expect, it } from "vitest";
import { RULES as CODEC } from "../../src/codec/index.js";
import { isId, isIdLike, isProseId, isRuleId, RULES as KERNEL } from "../../src/kernel/index.js";
import { RULES as LEDGER } from "../../src/ledger/index.js";

describe("the grammar of an ID (RM-02)", () => {
  it("RM-02: a rule ID is <PREFIX>-<NN>", () => {
    for (const id of ["KR-06", "RM-02", "NX-27"]) expect([id, isRuleId(id)]).toEqual([id, true]);
    for (const id of ["KR-6", "KR-006", "kr-06", "KR-Z01", "K-06", "KRX-06", "KR-06 ", ""]) expect([id, isRuleId(id)]).toEqual([id, false]);
  });

  it("RM-02: a prose ID is <PREFIX>-Z<NN>", () => {
    for (const id of ["KR-Z01", "RM-Z03"]) expect([id, isProseId(id)]).toEqual([id, true]);
    for (const id of ["KR-01", "KR-Z1", "KR-z01", "KR-ZZ01"]) expect([id, isProseId(id)]).toEqual([id, false]);
  });

  it("RM-01, RM-02: the ID of a paragraph is a rule ID or a prose ID", () => {
    expect(["KR-06", "KR-Z01", "KR-6"].map(isId)).toEqual([true, true, false]);
  });

  it("RM-02: what an author meant as an ID — letters, a dash, maybe one letter, digits", () => {
    for (const id of ["KR-6", "kr-06", "Kr-Z1", "KRX-06", "KR-06", "KR-Z01"]) expect([id, isIdLike(id)]).toEqual([id, true]);
    for (const id of ["KR 06", "KR-", "-06", "KR-ZZ01", "ID", "KR-06."]) expect([id, isIdLike(id)]).toEqual([id, false]);
  });

  it("RM-02, LG-17: every rule ID a registry names is of the grammar", () => {
    for (const { id } of [...KERNEL, ...LEDGER, ...CODEC]) expect([id, isRuleId(id)]).toEqual([id, true]);
  });
});
