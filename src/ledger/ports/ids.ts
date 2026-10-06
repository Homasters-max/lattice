// The `ids` port (LG-23): landing takes ids only from it. Adapters: `ids-ulid`
// and, for tests, `ids-counter` (ST-07).

export interface Ids {
  /** A new ULID (KR-11). */
  ulid(): string;
}
