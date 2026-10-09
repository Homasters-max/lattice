# 02. Kernel

KR-Z01. The kernel is the small pure core every other module builds on. It has five parts — Record, Canon, Type, Schema, Ref — and nothing else. Everything else is data (`std`, 03) or a layer above (ledger, trust, runtime).

## Boundary

| ID | Rule |
|---|---|
| KR-01 | The kernel knows only Record, Canon, Type, Schema and Ref. It does not know contracts, trust, the ledger, the runtime or the name of any `std` type. A structure test lists every file reachable from the kernel entry (ST-05), and a test fails if a `std` type name appears in kernel code. |
| KR-02 | The kernel is pure: it imports no other module and uses no I/O, clock, randomness or environment. Canon and Schema are own code checked by frozen test vectors; sha256 comes from the platform. |
| KR-03 | A **kernel version** changes only the header, Canon, the hash, the meta-type, the schema subset, the reference grammar or the types of `core`. It is `0` before the switch (SL-03), when every store is disposable, and `1` from the switch on. |

## Record

```json KR-Z02
// entity
{ "id": "factory/order-intake", "rev": 3, "type": "std/requirement@1",
  "hash": "sha256:…", "by": "01JB2…", "at": "2026-10-06T12:00:00.000000Z", "body": { … } }

// event
{ "id": "01JB4…", "type": "std/verdict@1",
  "hash": "sha256:…", "by": "01JB2…", "at": "2026-10-06T12:00:01.000000Z", "body": { … } }
```

| ID | Rule |
|---|---|
| KR-04 | Every record has one header: `{id, rev, type, hash, by, at, body}`; `rev` is present only for an entity. A new header field is a new kernel version. |
| KR-05 | The `type` of a record gives its meaning. Whether a record is an **entity** (a stable `id` with revisions `@n`) or an **event** (written once, never changed) is the `kind` of its type (KR-14), never a header field. |
| KR-06 | An entity `id` is `namespace/slug`: namespace `[a-z][a-z0-9-]*`; slug `[a-z0-9][a-z0-9.-]*`, where a dot is part of the name, not a hierarchy. An event `id` is a ULID. Both are carried by the intent that writes the record; apply never invents them (LG-09). |
| KR-07 | `type` is always a pinned reference `type@n`. The type of an entity never changes for its `id`; another type means another `id` (RF-12). |
| KR-08 | `by` is the `id` of a session event (TR-11). `at` is the author's time: when the author stated the record or when the event happened. Order is never read from `at`; order is the ledger's (LG-04). |
| KR-09 | Three times are distinct. **Author time** is `at`. **Transaction time** is when a record entered the ledger: its commit's `seq` and `at` (LG-06), or in `runtime` the `seq` and the time that the store assigns to the append (LG-04). **Valid time** — when a statement holds in the world — is a set of body fields that a type declares; the kernel gives it no meaning. |

## Canon

| ID | Rule |
|---|---|
| KR-10 | The canonical form is JSON canonicalisation per RFC 8785. Input must be I-JSON with every string in NFC, and is rejected, never repaired: duplicate keys, non-finite numbers, `-0`, integers outside ±2^53, a string not in NFC. Authoring tools normalise before writing. |
| KR-11 | Canonical scalar formats; a value in another spelling is rejected: |

| Format | Canonical spelling |
|---|---|
| `date-time` | UTC with `Z` and exactly six fraction digits: `2026-10-06T12:00:00.000000Z` |
| `date` | `YYYY-MM-DD` |
| `decimal` | a string matching `-?(0\|[1-9][0-9]*)(\.[0-9]*[1-9])?`, never `-0`: `0`, `0.5`, `-12.25` |
| `ulid` | 26 upper-case Crockford base32 characters |

| ID | Rule |
|---|---|
| KR-12 | `hash = "sha256:" + hex(sha256(canon({type, body})))` for every record, entity or event. The rest of the header is not hashed; its integrity is held by the hash chain of commits (LG-05). |
| KR-13 | A hash means equality of content, never identity. A body has a global size limit of 256 KiB, a constant of the kernel version; types add `maxLength` per field. The hash test vectors — RFC 8785 Appendix B, NFC cases and the formats of KR-11 — never change between kernel versions. |

## Type

| ID | Rule |
|---|---|
| KR-14 | A type is an entity whose type is the meta-type `core/type`. The meta-type is typed by itself — the only self-reference — and is created by kernel code. A type body is `{extends, abstract, kind, schema}`: `extends` an optional pinned reference to one parent type; `abstract` a boolean; `kind` `entity` or `event`; `schema` a schema of the closed subset (KR-18). |
| KR-15 | `extends` has exactly one parent, has no cycles (inside one commit too) and is at most 4 deep. A child may add fields and narrow the fields it inherits, never loosen them: `compare` in `extends` mode (KR-22) finds the child `narrower` or `same`. So every record of a child, restricted to its parent's fields, is a valid record of the parent. `kind` never changes along the chain. |
| KR-16 | An **abstract** type has no records. It is a shape of data, used by a field (`$ref`) or by `extends`. |
| KR-17 | Several concerns in one type are combined by fields that reference abstract types, never by several parents or mixins. |

## Schema

| ID | Rule |
|---|---|
| KR-18 | The schema subset is closed; anything else is rejected, and a new keyword is a new kernel version: |

| Keyword | Applies to |
|---|---|
| `type` | one of `string`, `integer`, `number`, `boolean`, `object`, `array`, `null`; or a pair of one of them with `null`; or `any` — any I-JSON value (KR-10), with only `description` and annotations beside it: the kernel does not look into the value, whoever knows its type checks it, as the `params` type of a contract checks the params of a stage (RT-02) |
| `properties`, `required` | `object`; objects are always closed — no unlisted keys |
| `values` | `object` used as a map: every key matches `[a-z0-9][a-z0-9._@-]*`, every value matches `values` |
| `items`, `minItems`, `maxItems` | `array` |
| `minLength`, `maxLength`, `format` | `string`; `format` is one of `date-time`, `date`, `decimal`, `ulid`, `ref`, `uri` |
| `minimum`, `maximum` | `integer`, `number` |
| `enum`, `const` | any scalar |
| `oneOf` with `discriminator` | a tagged union: each branch is an object whose discriminator field is a distinct `const` |
| `$ref` | a pinned reference to an abstract type (KR-16) |
| `description` | any; text for readers, never checked |

| ID | Rule |
|---|---|
| KR-19 | A field may carry annotations, part of the closed subset: |

| Annotation | On | Meaning |
|---|---|---|
| `ref: {to, pin, label}` | a `format: ref` field | `to` — the allowed target type, its subtypes included; `pin` — `pinned`, `floating` or `any`; `label` — the edge label (RF-07) |
| `edge: <label>` | a `format: uri` field | an external link and its edge label (RF-06) |
| `unique: true` | a required field | the value is unique among records of the type in use (LG-19) |
| `key: true` | a required field of an event type | the field is part of the key of the event; events with equal keys speak about the same thing (TR-28) |
| `card_order: <integer>` | any field | the field enters the card at this position (RF-10); absent means not in the card; positions are unique along the `extends` chain |

| ID | Rule |
|---|---|
| KR-20 | Cardinality is expressed only by the schema: a single field or an `array` with `minItems` and `maxItems`. |
| KR-21 | `validate(value, schema)` returns `ok` or the list of violations `{path, keyword, expected, got}` in a deterministic order. It resolves `$ref` through a function given by the caller; the kernel never reads a store. |
| KR-22 | `compare(A, B, mode)` returns `{relation, aspects}`. `relation` is `same`, `narrower` (every value valid under A is valid under B, not the reverse), `wider`, or `incomparable`, including whenever narrowness cannot be shown structurally. In `revision` mode objects are compared as closed: an added optional field is wider, an added required field is incomparable. In `extends` mode an object of A may hold fields B lacks, and A is compared with B on B's fields only. `aspects` lists what differs: `validity`, `graph` (`ref`, `edge`, `unique`, `key`), `presentation` (`card_order`, `description`). A changed `label`, `edge` or `key` makes the relation `incomparable`; `pinned` and `floating` are each narrower than `any`; a narrower `ref.to` is narrower; adding `unique` is narrower. One function serves `extends` (KR-15), new type revisions (RF-13) and new contract revisions (RF-15). |

## Ref

| ID | Rule |
|---|---|
| KR-23 | Reference grammar: an entity reference is `id` (floating, the current revision) or `id@n` (pinned); an event reference is its ULID. Either may end with a fragment `#seg/seg/…` that addresses a part of the target; a segment is a field name `[a-z][a-z0-9_]*`, a map key (KR-18) or an array index. |
| KR-24 | A `format: uri` value is an external link, not a reference: the kernel checks only that it is an absolute URI. |
| KR-25 | The kernel parses and formats references. Resolution — which namespaces are visible, whether the target exists, aliases, retired targets, whether a fragment exists — belongs to the ledger (RF-01…RF-05). |
