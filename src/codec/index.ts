// codec (ST-01, LG-42, RM-07): the one module that knows the `md` format. ST-06
// lets assembly and cli import it, and ST-01 lets cli import only assembly, so
// only assembly does (G-15). It imports only the kernel.
export type { Block, Clause, Example, Header, Item, Prose, Section, Table } from "./model.js";
export { parse } from "./parse.js";
export { print } from "./print.js";
export { LG_42, RM_01, RM_02, RULES } from "./rules.js";
