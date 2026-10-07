// The grammar of an ID (RM-02): `<PREFIX>-<NN>` for a rule, `<PREFIX>-Z<NN>`
// for prose and examples. A table row with an ID is a rule (RM-01), a fenced
// block with an ID an example; a paragraph is either. Whether the prefix is
// its document's is checked by `lint-ids` on the text, where the file name is
// known (S0-01).

const RULE = /^[A-Z]{2}-\d{2}$/;
const PROSE = /^[A-Z]{2}-Z\d{2}$/;

/** What an author meant as an ID: letters, a dash, maybe one letter, digits — refused by RM-02 when not of the grammar. */
const ID_LIKE = /^[A-Za-z]+-[A-Za-z]?\d+$/;

/** The ID of a rule: `<PREFIX>-<NN>`. */
export const isRuleId = (s: string): boolean => RULE.test(s);

/** The ID of prose or an example: `<PREFIX>-Z<NN>`. */
export const isProseId = (s: string): boolean => PROSE.test(s);

/** The ID of a paragraph, which is a rule or prose (RM-01). */
export const isId = (s: string): boolean => isRuleId(s) || isProseId(s);

export const isIdLike = (s: string): boolean => ID_LIKE.test(s);
