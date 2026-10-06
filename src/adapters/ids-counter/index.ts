// `ids-counter` (ST-07): the deterministic ids for tests — ULIDs whose time
// part is fixed and whose random part counts 1, 2, 3, …
import type { Ids } from "../../ledger/ports/ids.js";

export type IdsCounterOptions = { readonly time?: string };

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(n: number, width: number): string {
  let out = "";
  for (let rest = n; rest > 0; rest = Math.floor(rest / 32)) out = (CROCKFORD[rest % 32] ?? "") + out;
  return out.padStart(width, "0");
}

export function createIdsCounter({ time = "0000000000" }: IdsCounterOptions = {}): Ids {
  let count = 0;
  return {
    ulid: () => {
      count += 1;
      return `${time}${base32(count, 16)}`;
    },
  };
}
