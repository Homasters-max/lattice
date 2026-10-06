// The command table of S0 (RT-32): the store commands of RT-Z03 that this
// slice implements, with the text of RT-Z03. Commands of later slices are
// absent. This file belongs to the walking skeleton (ST-15).

export interface Command {
  readonly name: string;
  readonly does: string;
}

export const COMMANDS: readonly Command[] = [
  { name: "init", does: "writes the first commits of a store (LG-47)" },
  { name: "draft", does: "writes intents into a proposal; never reads md" },
  {
    name: "land",
    does: "applies a proposal on the tail of main, makes the git commit and pushes it (LG-22); --dry-run checks without pushing (LG-26)",
  },
  { name: "verify-store", does: "opens a store and verifies its chains and a rebuild of its rows (LG-37)" },
  { name: "export", does: "writes docs/ and gen/ from the ledger, or gen/ from the after of a dry run" },
  { name: "migrate", does: "drafts the new revisions a type revision needs (RF-13)" },
  { name: "session", does: "starts a session and issues its certificate (TR-11)" },
];
