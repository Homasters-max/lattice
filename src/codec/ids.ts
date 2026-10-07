// The grammar of an ID (RM-02): `<PREFIX>-<NN>` for a rule, `<PREFIX>-Z<NN>`
// for prose and examples. Whether the prefix is its document's is checked by
// `lint-ids` on the text, where the file name is known (S0-01).

const ID = /^[A-Z]{2}-Z?\d{2}$/;

/** What an author meant as an ID: letters, a dash, maybe one letter, digits — refused by RM-02 when not of the grammar. */
const ID_LIKE = /^[A-Za-z]+-[A-Za-z]?\d+$/;

export const isId = (s: string): boolean => ID.test(s);

export const isIdLike = (s: string): boolean => ID_LIKE.test(s);
