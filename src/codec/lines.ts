// The lines of canonical md (LG-42, G-24): LF only, one final newline, no
// trailing spaces, blocks separated by exactly one blank line. A fenced block
// is read verbatim up to its closing line ```; nothing inside it is checked.
// The text is cut into chunks — the runs of lines between blank lines — and
// every refusal names its line, counted from 1, under the path given.
import { reject, type Rejection } from "../kernel/index.js";
import { LG_42 } from "./rules.js";

/** A run of lines between blank lines; `line` is the number of its first line. */
export type TextChunk = { readonly kind: "text"; readonly line: number; readonly lines: string[] };

/** A fenced block: its opening line and the lines between its fences, verbatim. */
export type FenceChunk = { readonly kind: "fence"; readonly line: number; readonly open: string; readonly body: string[] };

export type Chunk = TextChunk | FenceChunk;

/** The chunks of a document and the refusals of its lines; `whole` — the text as a whole was refused and not cut. */
export type Chunks = { readonly chunks: readonly Chunk[]; readonly found: readonly Rejection[]; readonly whole: boolean };

/** An LG-42 refusal at a line of the document under `path`. */
export const notCanonical = (path: string, line: number, expected: string, got: string): Rejection =>
  reject(LG_42, { intent: null, path: `${path}/${line}`, expected, got });

const FENCE = "```";
const TRAILING = /[ \t]+$/;

/** LG-42: the refusals of the text as a whole — empty, CR, no final newline; after them nothing else is read. */
function wholeText(text: string, path: string): Rejection[] {
  if (text === "") return [notCanonical(path, 1, "a heading of level 1 and a final newline", "")];
  const lines = text.split("\n");
  const cr = lines.flatMap((l, i) => (l.includes("\r") ? [notCanonical(path, i + 1, "LF line endings", l)] : []));
  if (cr.length > 0) return cr;
  return text.endsWith("\n") ? [] : [notCanonical(path, lines.length, "a final newline", lines.at(-1) ?? "")];
}

/** The state of the cut: the chunk being read and whether the line before was blank. */
type Cut = { chunks: Chunk[]; found: Rejection[]; text: TextChunk | null; fence: FenceChunk | null; blank: boolean };

function readFenced(cut: Cut, fence: FenceChunk, line: string): void {
  if (line !== FENCE) {
    fence.body.push(line);
    return;
  }
  cut.chunks.push(fence);
  cut.fence = null;
  cut.blank = false;
}

function readBlank(cut: Cut, n: number, path: string): void {
  if (cut.blank) cut.found.push(notCanonical(path, n, "one blank line between blocks", ""));
  cut.text = null;
  cut.blank = true;
}

function readLine(cut: Cut, line: string, n: number, path: string): void {
  if (!cut.blank && cut.text === null) cut.found.push(notCanonical(path, n, "a blank line after a fenced block", line));
  if (line.startsWith(FENCE)) {
    if (!cut.blank && cut.text !== null) cut.found.push(notCanonical(path, n, "a blank line before a fenced block", line));
    cut.fence = { kind: "fence", line: n, open: line, body: [] };
    cut.text = null;
  } else if (cut.text === null) {
    cut.text = { kind: "text", line: n, lines: [line] };
    cut.chunks.push(cut.text);
  } else cut.text.lines.push(line);
  cut.blank = false;
}

function readOne(cut: Cut, raw: string, n: number, path: string): void {
  if (cut.fence !== null) return readFenced(cut, cut.fence, raw);
  if (TRAILING.test(raw)) cut.found.push(notCanonical(path, n, "no space at the end of a line", raw));
  const line = raw.replace(TRAILING, "");
  return line === "" ? readBlank(cut, n, path) : readLine(cut, line, n, path);
}

/** The chunks of a document and the refusals of its lines (LG-42). */
export function cut(text: string, path: string): Chunks {
  const whole = wholeText(text, path);
  if (whole.length > 0) return { chunks: [], found: whole, whole: true };
  const lines = text.slice(0, -1).split("\n");
  // A document starts with its heading: a blank first line is refused like a second blank line.
  const state: Cut = { chunks: [], found: [], text: null, fence: null, blank: true };
  lines.forEach((raw, i) => readOne(state, raw, i + 1, path));
  if (state.fence !== null) state.found.push(notCanonical(path, state.fence.line, "a closing line ```", "absent"));
  if (state.blank) state.found.push(notCanonical(path, lines.length, "no blank line at the end", ""));
  return { chunks: state.chunks, found: state.found, whole: false };
}
