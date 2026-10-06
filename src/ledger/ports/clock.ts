// The `clock` port (LG-23): landing takes time only from it. Adapters:
// `clock-system` and, for tests, `clock-fixed` (ST-07).

export interface Clock {
  /** Now, as a `date-time` of KR-11: UTC, `Z`, six fraction digits. */
  now(): string;
}
