// What a walk of compare (KR-22) shows of a pair of schemas A and B, and how
// the parts of a schema add up. `sub` — every value of A is shown to be a
// value of B; `sup` — the reverse. Each is shown only when it holds: a part
// that cannot be shown is not, and the relation falls to the safe side (R2).
// Fields, items, branches of a union and JSON types are each a product or a
// disjoint union of their parts, so a whole is shown when every part is.

/** KR-22: what differs — `validity`; `graph`: `ref`, `edge`, `unique`, `key`; `presentation`: `card_order`, `description`. */
export type Aspect = "validity" | "ref" | "edge" | "unique" | "key" | "card_order" | "description";

/** KR-22: the aspects in the order the rule names them, the order of `aspects` (G-27). */
export const ASPECTS: readonly Aspect[] = ["validity", "ref", "edge", "unique", "key", "card_order", "description"];

/** KR-22: whether A ⊆ B and B ⊆ A are shown, whether a changed label, edge or key breaks the pair, and what differs. */
export type Shown = { readonly sub: boolean; readonly sup: boolean; readonly broken: boolean; readonly aspects: readonly Aspect[] };

export const SAME: Shown = { sub: true, sup: true, broken: false, aspects: [] };

/** Nothing shown: the schemas differ in validity, and neither holds the other as far as the kernel can tell. */
export const UNSHOWN: Shown = { sub: false, sup: false, broken: false, aspects: ["validity"] };

/** One part of a pair: the aspect differs unless both directions are shown. */
export const shown = (sub: boolean, sup: boolean, aspect: Aspect): Shown => ({ sub, sup, broken: false, aspects: sub && sup ? [] : [aspect] });

/** A changed label, edge or key: the relation is incomparable (KR-22). */
export const broken = (aspect: Aspect): Shown => ({ sub: false, sup: false, broken: true, aspects: [aspect] });

/** The parts of a pair added up: shown where every part is, broken where one is. */
export function join(...parts: readonly Shown[]): Shown {
  return {
    sub: parts.every((p) => p.sub),
    sup: parts.every((p) => p.sup),
    broken: parts.some((p) => p.broken),
    aspects: [...new Set(parts.flatMap((p) => p.aspects))],
  };
}
