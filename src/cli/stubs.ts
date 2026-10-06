// The commands of the table that are not implemented yet, and the plan task
// where each arrives. A task that implements a command removes its line here
// and adds its handler to run.ts.

export const STUBS: { readonly [command: string]: string } = {
  init: "S0-23",
  draft: "S0-21",
  "verify-store": "S0-12",
  export: "S0-27",
  migrate: "S0-18",
  session: "S0-16",
};
