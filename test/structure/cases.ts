// A small tree that holds every structure rule, for trigger and pass cases:
// a case changes one file and expects exactly the problems that change makes.
import { virtualTree, type Tree } from "./tree.js";

export const BASE: { readonly [path: string]: string } = {
  "src/kernel/index.ts": "export const kernel = 1;\n",
  "src/trust/index.ts": 'import { kernel } from "../kernel/index.js";\nexport const trust = kernel;\n',
  "src/ledger/index.ts": 'import { kernel } from "../kernel/index.js";\nimport { trust } from "../trust/index.js";\nexport const ledger = kernel + trust;\n',
  "src/ledger/ports/store.ts": "export interface Store {\n  readonly size: number;\n}\n",
  "src/ledger/ports/git.ts": "export interface Git {\n  readonly head: string;\n}\n",
  "src/adapters/store-memory/index.ts":
    'import type { Store } from "../../ledger/ports/store.js";\nexport const store: Store = { size: 0 };\n',
  "src/assembly/index.ts":
    'import { store } from "../adapters/store-memory/index.js";\nimport { ledger } from "../ledger/index.js";\nexport const assembled = { store, ledger };\n',
  "src/cli/main.ts": 'import { assembled } from "../assembly/index.js";\nconsole.log(assembled, process.argv, Date.now());\n',
};

export const BASE_KERNEL: readonly string[] = ["src/kernel/index.ts"];

/** BASE with some files replaced or added; a file given as `null` is removed. */
export function tree(over: { readonly [path: string]: string | null } = {}, dependencies: readonly string[] = []): Tree {
  const files: { [path: string]: string } = { ...BASE };
  for (const [path, text] of Object.entries(over)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return virtualTree(files, dependencies);
}

/** A tree of one file and nothing else. */
export const alone = (path: string, text: string): Tree => virtualTree({ [path]: text });
