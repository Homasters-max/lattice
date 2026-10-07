// The lines of canonical md (LG-42, G-25): LF only, one final newline, no
// trailing spaces, blocks separated by exactly one blank line. A fenced block
// is read verbatim up to its closing line; nothing inside it is checked.
// The text is cut into chunks — the runs of lines between blank lines — and
// every refusal names its line, counted from 1, under the place given.
import { reject, type Place, type Rejection } from "../kernel/index.js";
import { endsWithSpace, FENCE, FENCE_CLOSE_FORM, startsFence, withoutEndSpace } from "./form.js";
import { LG_42 } from "./rules.js";

/** A run of lines between blank lines; `line` is the number of its first line. */
export type TextChunk = { readonly kind: "text"; readonly line: number; readonly lines: readonly string[] };

/** A fenced block: its opening line and the lines between its fences, verbatim. */
export type FenceChunk = { readonly kind: "fence"; readonly line: number; readonly open: string; readonly body: readonly string[] };

export type Chunk = TextChunk | FenceChunk;

/** The chunks of a document and the refusals of its lines; `whole` — the text as a whole was refused and not cut. */
export type Chunks = { readonly chunks: readonly Chunk[]; readonly found: readonly Rejection[]; readonly whole: boolean };

/** The place of a line of the document at `place`: its number under the path, the intent kept. */
export const lineOf = (place: Place, line: number): Place => ({ intent: place.intent, path: `${place.path}/${line}` });

/** An LG-42 refusal at a line of the document at `place`. */
export const notCanonical = (place: Place, line: number, expected: string, got: string): Rejection =>
  reject(LG_42, { ...lineOf(place, line), expected, got });

/** LG-42: the refusals of the text as a whole — empty, CR, no final newline; after them nothing else is read. */
function wholeText(text: string, place: Place): Rejection[] {
  if (text === "") return [notCanonical(place, 1, "a heading of level 1 and a final newline", "")];
  const lines = text.split("\n");
  const cr = lines.flatMap((l, i) => (l.includes("\r") ? [notCanonical(place, i + 1, "LF line endings", l)] : []));
  if (cr.length > 0) return cr;
  return text.endsWith("\n") ? [] : [notCanonical(place, lines.length, "a final newline", lines.at(-1) ?? "")];
}

/** A chunk being read: its first line and its lines so far; it becomes a chunk when it ends. */
type OpenText = { readonly line: number; readonly lines: string[] };
type OpenFence = { readonly line: number; readonly open: string; readonly body: string[] };

/** The state of the cut: the chunk being read and whether the line before was blank. */
type Cut = { chunks: Chunk[]; found: Rejection[]; text: OpenText | null; fence: OpenFence | null; blank: boolean };

/** The run of lines being read ends: it becomes a chunk. */
function endText(cut: Cut): void {
  if (cut.text !== null) cut.chunks.push({ kind: "text", line: cut.text.line, lines: cut.text.lines });
  cut.text = null;
}

function readFenced(cut: Cut, fence: OpenFence, line: string): void {
  if (line !== FENCE) {
    fence.body.push(line);
    return;
  }
  cut.chunks.push({ kind: "fence", line: fence.line, open: fence.open, body: fence.body });
  cut.fence = null;
  cut.blank = false;
}

function readBlank(cut: Cut, n: number, place: Place): void {
  if (cut.blank) cut.found.push(notCanonical(place, n, "one blank line between blocks", ""));
  endText(cut);
  cut.blank = true;
}

function readLine(cut: Cut, line: string, n: number, place: Place): void {
  if (!cut.blank && cut.text === null) cut.found.push(notCanonical(place, n, "a blank line after a fenced block", line));
  if (startsFence(line)) {
    if (!cut.blank && cut.text !== null) cut.found.push(notCanonical(place, n, "a blank line before a fenced block", line));
    endText(cut);
    cut.fence = { line: n, open: line, body: [] };
  } else if (cut.text === null) cut.text = { line: n, lines: [line] };
  else cut.text.lines.push(line);
  cut.blank = false;
}

function readOne(cut: Cut, raw: string, n: number, place: Place): void {
  if (cut.fence !== null) return readFenced(cut, cut.fence, raw);
  if (endsWithSpace(raw)) cut.found.push(notCanonical(place, n, "no space at the end of a line", raw));
  const line = withoutEndSpace(raw);
  return line === "" ? readBlank(cut, n, place) : readLine(cut, line, n, place);
}

/** The chunks of a document at `place` and the refusals of its lines (LG-42). */
export function cut(text: string, place: Place): Chunks {
  const whole = wholeText(text, place);
  if (whole.length > 0) return { chunks: [], found: whole, whole: true };
  const lines = text.slice(0, -1).split("\n");
  // A document starts with its heading: a blank first line is refused like a second blank line.
  const state: Cut = { chunks: [], found: [], text: null, fence: null, blank: true };
  lines.forEach((raw, i) => readOne(state, raw, i + 1, place));
  endText(state);
  if (state.fence !== null) state.found.push(notCanonical(place, state.fence.line, FENCE_CLOSE_FORM, "absent"));
  if (state.blank) state.found.push(notCanonical(place, lines.length, "no blank line at the end", ""));
  return { chunks: state.chunks, found: state.found, whole: false };
}
