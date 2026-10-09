// Proposals of a small knowledge for the tests of fold and the read view
// (LG-34, LG-38): a type of notes whose fields are references with an edge
// label, external links and a unique title, an abstract shape reached by
// `$ref` whose reference names no label (G-31), and an event type that points
// at a note.
import type { JsonValue } from "../../src/kernel/index.js";

export const AT = "2026-10-06T11:00:00.000000Z";

const SESSION = { id: "01JB2X00000000000000000SES" };

/** A proposal of these intents, unsigned. */
export const proposalOf = (...intents: JsonValue[]): JsonValue => ({ session: SESSION, intents, sig: null });

const type = (id: string, body: JsonValue): JsonValue => ({ op: "entity", id, type: "core/type@1", expected: null, at: AT, body });

/** `demo/note@1`: a unique title, references labelled `cites`, an external link labelled `source`, and a `parent` of the shape `demo/link@1`. */
export const NOTE_TYPE = type("demo/note", {
  abstract: false,
  kind: "entity",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", unique: true },
      refs: { type: "array", items: { type: "string", format: "ref", ref: { to: "demo/note@1", pin: "any", label: "cites" } } },
      source: { type: "string", format: "uri", edge: "source" },
      parent: { $ref: "demo/link@1" },
    },
    required: ["title"],
  },
});

/** `demo/link@1`: an abstract shape whose reference carries no annotation `ref`, so no label (G-31). */
export const LINK_TYPE = type("demo/link", {
  abstract: true,
  kind: "entity",
  schema: { type: "object", properties: { to: { type: "string", format: "ref" } }, required: ["to"] },
});

/** `demo/seen@1`: an event about a note, labelled `about`. */
export const SEEN_TYPE = type("demo/seen", {
  abstract: false,
  kind: "event",
  schema: { type: "object", properties: { of: { type: "string", format: "ref", ref: { to: "demo/note@1", pin: "any", label: "about" } } }, required: ["of"] },
});

export const TYPES: readonly JsonValue[] = [NOTE_TYPE, LINK_TYPE, SEEN_TYPE];

/** A revision of the note `id`, written against the revision `expected` (LG-09); its body the title and whatever else is given. */
export const note = (id: string, body: { readonly [field: string]: JsonValue } = {}, expected: number | null = null): JsonValue => ({
  op: "entity",
  id,
  type: "demo/note@1",
  expected,
  at: AT,
  body: { title: id, ...body },
});

/** An event `seen` about `of`. */
export const seen = (id: string, of: string): JsonValue => ({ op: "event", id, type: "demo/seen@1", expected: null, at: AT, body: { of } });
