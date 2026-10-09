// assembly (ST-01): wires landing, the read view, the start of a session and
// the verification of a store to the ports; the only module that imports
// adapters (ST-06). The store on a
// worktree is always the `jsonl` adapter (LG-23). The working adapters of
// `git`, `acts`, `clock` and `ids` and reading `store/lattice.json` arrive
// with S0-19, S0-20 and S0-23; the adapters for tests are assembled only by
// tests (test/support/assembly.ts, plan/closure-check.md, the bypass class of
// acts: TR-14…TR-17).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createStoreJsonl } from "../adapters/store-jsonl/index.js";
import type { Rejections, Result } from "../kernel/index.js";
import { KNOWLEDGE, land, openTail, verifyStore, type LandingOutcome, type LandingPorts, type LandOptions, type View } from "../ledger/index.js";
import { startSession, type SessionOutcome, type SessionRequest } from "./session.js";

export type { Rejection, Result } from "../kernel/index.js";
export type { LandingOutcome, LandOptions, View };
export type { SessionOutcome, SessionRequest };

/** The ports assembly is given; it opens the store itself. */
interface Ports {
  readonly git: LandingPorts["git"];
  readonly acts: LandingPorts["acts"];
  readonly clock: LandingPorts["clock"];
  readonly ids: LandingPorts["ids"];
}

/** What the commands reach: landing, the read view at the tail of `main` and the start of a session. */
export interface Assembly {
  readonly land: (request: string, options: LandOptions) => Promise<LandingOutcome>;
  readonly view: () => Promise<Result<View>>;
  readonly session: (request: SessionRequest) => SessionOutcome;
}

/** The ports of landing: those given and the `jsonl` store on every worktree (LG-23). */
export const landingPortsOf = (ports: Ports): LandingPorts => ({ ...ports, openStore: (worktree) => createStoreJsonl({ dir: worktree.dir }) });

export function assemble(ports: Ports): Assembly {
  const all = landingPortsOf(ports);
  const view = async (): Promise<Result<View>> => {
    const opened = await openTail(all);
    return opened.ok ? { ok: true, value: opened.value.view } : opened;
  };
  return { land: (request, options) => land(all, request, options), view, session: (request) => startSession(ports, request) };
}

/** What `verify-store` ends with: the store verified, its rejections, or no store at the directory. */
export type VerifyOutcome =
  | { readonly outcome: "verified"; readonly commits: number; readonly rows: number }
  | { readonly outcome: "rejections"; readonly rejections: Rejections }
  | { readonly outcome: "no-store" };

/**
 * RT-32: verifies the `jsonl` store of a directory (LG-02, LG-50) — its chain and the signatures by the keys of the land
 * sessions it holds (LG-05) — and rebuilds its rows from genesis. It needs no other port, so it needs no configured store.
 */
export async function verifyStoreAt(dir: string): Promise<VerifyOutcome> {
  if (!existsSync(join(dir, KNOWLEDGE))) return { outcome: "no-store" };
  const verified = await verifyStore(createStoreJsonl({ dir }));
  return verified.ok ? { outcome: "verified", ...verified.value } : { outcome: "rejections", rejections: verified.rejections };
}
