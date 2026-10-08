// mutants: the mutants of the changed lines of src/ (S0-44) — what `npm run prove --ready` runs (scripts/mutate.mjs)
// and what `dl check` asks the executor and the fixer to decide (plan/tools/dev-loop/protocol.mjs). A mutant is one
// edit of one file of src/ by one operator, anchored at one line; it counts when that line is in a changed hunk:
// changed against the merge base of the branch, uncommitted changes included. The operators:
//   refusal        — a refusal removed: a `throw`, a statement that returns or pushes a call of reject/refuse/refused,
//                    or the branch of a conditional that refuses, replaced by the other branch;
//   logical        — an operand of `&&` or `||` removed: the expression is its left or its right side;
//   boundary       — a boundary moved: `<` ↔ `<=`, `>` ↔ `>=`;
//   refusal-field  — a field of a refusal or of its place (intent, path, expected, got, id) → null, `path` → "";
//   hash-input     — a field or an item of the input of a hash or a signature removed, or an argument of such a call
//                    replaced by another argument of the same type;
//   sort           — a call of sort removed, or its comparator.
// The id of a mutant is a hash of its file, operator, line and edit: it stays while unrelated lines move, so dl
// remembers a decision by it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const OPERATORS = ["refusal", "logical", "boundary", "refusal-field", "hash-input", "sort"];

const REFUSAL = /^(reject|refuse|refused)$/;
const FIELDS = ["intent", "path", "expected", "got", "id"];
// A call whose name has a word that starts so takes the input of a hash or a signature: hash, hashRecord, signHash,
// verifyHash, canon, canonicalIntents, digest — but not assign or design.
const HASH_WORD = /^(hash|sign|digest|canon|verify)/;
const BOUNDARY = { "<": "<=", "<=": "<", ">": ">=", ">=": ">" };
const SHOWN = 160;
const MUTABLE = /^src\/.*\.(ts|mts|js|mjs)$/;

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const shorten = (text) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SHOWN ? `${flat.slice(0, SHOWN - 1)}…` : flat;
};

/** The words of a camelCase name, in lower case. */
const wordsOf = (name) => name.split(/(?=[A-Z])/).map((w) => w.toLowerCase());
/** The name a call calls: `f` of `f(…)` and of `a.f(…)`. */
const calleeName = (call) => (ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null);
const isFunctionLike = (node) => ts.isFunctionLike(node) || ts.isClassLike(node);

/** Whether `node` calls a function whose name matches `re`, outside a nested function. */
function calls(node, re) {
  let found = false;
  const visit = (n) => {
    if (found || isFunctionLike(n)) return;
    if (ts.isCallExpression(n) && re.test(calleeName(n) ?? "")) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

const isHashCall = (call) => wordsOf(calleeName(call) ?? "").some((w) => HASH_WORD.test(w));

/** The text of a list of nodes without the one at `skip`, joined as written in a literal. */
const without = (elements, skip, sf) => elements.filter((_, i) => i !== skip).map((e) => e.getText(sf)).join(", ");

/**
 * The edits of one node: `[{operator, anchor, start, end, replacement}]` — the range of the text the edit replaces
 * and the position whose line the mutant counts at. `typeOf(node)` — the type of an expression as text, or null.
 */
function editsOf(node, sf, typeOf) {
  const out = [];
  const replace = (operator, anchor, target, replacement) => out.push({ operator, anchor, start: target.getStart(sf), end: target.end, replacement });
  if (ts.isThrowStatement(node) && !/["'`]bug:/.test(node.getText(sf))) replace("refusal", node.getStart(sf), node, ";");
  if ((ts.isReturnStatement(node) || ts.isExpressionStatement(node)) && node.expression && calls(node.expression, REFUSAL)) replace("refusal", node.getStart(sf), node, ";");
  if (ts.isConditionalExpression(node)) {
    const [yes, no] = [calls(node.whenTrue, REFUSAL), calls(node.whenFalse, REFUSAL)];
    if (yes !== no) replace("refusal", node.questionToken.getStart(sf), node, `(${(yes ? node.whenFalse : node.whenTrue).getText(sf)})`);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken;
    if (op.kind === ts.SyntaxKind.AmpersandAmpersandToken || op.kind === ts.SyntaxKind.BarBarToken)
      for (const side of [node.left, node.right]) replace("logical", op.getStart(sf), node, `(${side.getText(sf)})`);
    const moved = BOUNDARY[op.getText(sf)];
    if (moved) replace("boundary", op.getStart(sf), op, moved);
  }
  if (ts.isObjectLiteralExpression(node) && isRefusalObject(node, sf))
    for (const p of node.properties) {
      const name = (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) ? p.name.text : null;
      const constant = name === "path" ? '""' : "null";
      if (FIELDS.includes(name) && !(ts.isPropertyAssignment(p) && p.initializer.getText(sf) === constant)) replace("refusal-field", p.getStart(sf), p, `${name}: ${constant}`);
    }
  if (ts.isCallExpression(node)) out.push(...callEdits(node, sf, typeOf));
  return out;
}

/** An object a refusal is made of: an argument of reject/refuse/refused, or a place — an object with `intent`. */
function isRefusalObject(node, sf) {
  const parent = node.parent;
  if (parent && ts.isCallExpression(parent) && REFUSAL.test(calleeName(parent) ?? "") && parent.arguments.includes(node)) return true;
  return node.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.getText(sf) === "intent");
}

/** The edits of a call: sort and its comparator, the input of a hash or a signature. */
function callEdits(call, sf, typeOf) {
  const out = [];
  const edit = (operator, anchor, target, replacement) => out.push({ operator, anchor, start: target.getStart(sf), end: target.end, replacement });
  const name = calleeName(call);
  if (ts.isPropertyAccessExpression(call.expression) && (name === "sort" || name === "toSorted")) {
    const receiver = call.expression.expression.getText(sf);
    edit("sort", call.expression.name.getStart(sf), call, `(${receiver})`);
    if (call.arguments.length > 0) edit("sort", call.expression.name.getStart(sf), call, `${receiver}.${name}()`);
  }
  if (ts.isIdentifier(call.expression) && /^sort[A-Z]/.test(name) && call.arguments.length > 0)
    edit("sort", call.expression.getStart(sf), call, `(${call.arguments[0].getText(sf)})`);
  if (!isHashCall(call)) return out;
  for (const arg of call.arguments) {
    if (ts.isObjectLiteralExpression(arg)) arg.properties.forEach((p, i) => edit("hash-input", p.getStart(sf), arg, `{ ${without(arg.properties, i, sf)} }`));
    if (ts.isArrayLiteralExpression(arg)) arg.elements.forEach((e, i) => edit("hash-input", e.getStart(sf), arg, `[${without(arg.elements, i, sf)}]`));
  }
  if (call.arguments.length > 1 && typeOf)
    call.arguments.forEach((arg, i) => {
      const type = typeOf(arg);
      const other = call.arguments.find((o, j) => j !== i && o.getText(sf) !== arg.getText(sf) && type !== null && typeOf(o) === type);
      if (other) edit("hash-input", arg.getStart(sf), arg, other.getText(sf));
    });
  return out;
}

/** Whether some call of `sf` on `lines` swaps the arguments of a hash: only then the type checker is built. */
function needsTypes(sf, lines) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && n.arguments.length > 1 && isHashCall(n) && n.arguments.some((a) => lines(sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1))) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** The type of an expression of the file at `absolute`, as text, by a program of the file and what it imports. */
function typesFor(root, absolute) {
  const config = existsSync(join(root, "tsconfig.json")) ? ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile).config : {};
  const { options } = ts.parseJsonConfigFileContent(config ?? {}, ts.sys, root);
  const program = ts.createProgram([absolute], { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(absolute);
  const byPosition = new Map();
  const visit = (n) => {
    byPosition.set(`${n.getStart(sf)}:${n.end}`, n);
    ts.forEachChild(n, visit);
  };
  if (sf) visit(sf);
  return (node) => {
    const same = byPosition.get(`${node.getStart()}:${node.end}`);
    return same ? checker.typeToString(checker.getTypeAtLocation(same)) : null;
  };
}

/**
 * The mutants of the file `path` (from the root `root`) with the text `text` whose line `lines(n)` takes:
 * `[{id, file, line, operator, code, before, after, start, end, replacement}]`, in the order of the text.
 */
export function mutantsOf(root, path, text, lines) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const typeOf = needsTypes(sf, lines) ? typesFor(root, join(root, path)) : null;
  const edits = [];
  const visit = (n) => {
    edits.push(...editsOf(n, sf, typeOf));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const rows = text.split(/\r?\n/);
  const seen = new Map();
  return edits
    .map((e) => ({ ...e, line: sf.getLineAndCharacterOfPosition(e.anchor).line + 1 }))
    .filter((e) => lines(e.line))
    .sort((a, b) => a.anchor - b.anchor || a.start - b.start)
    .map(({ operator, line, start, end, replacement }) => {
      const code = shorten(rows[line - 1] ?? "");
      const before = text.slice(start, end);
      const key = [path, operator, code, before, replacement].join("\0");
      const nth = seen.get(key) ?? 0;
      seen.set(key, nth + 1);
      const id = createHash("sha256").update(`${key}\0${nth}`).digest("hex").slice(0, 16);
      return { id, file: path, line, operator, code, before: shorten(before), after: shorten(replacement), start, end, replacement };
    });
}

/** The text of the file with the edit of `mutant`. */
export const mutate = (text, mutant) => `${text.slice(0, mutant.start)}${mutant.replacement}${text.slice(mutant.end)}`;

/** The changed lines of the files of src/ in the working tree of `dir` against the commit `base`: path → [[from, to]]. */
export function changedLines(dir, base) {
  const out = new Map();
  let file = null;
  for (const row of git(dir, "diff", "-U0", "--no-color", "--no-ext-diff", "--no-renames", base, "--", "src/").split("\n")) {
    if (row.startsWith("+++ ")) file = row === "+++ /dev/null" ? null : row.slice("+++ b/".length);
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunk && file) {
      const [from, count] = [Number(hunk[1]), hunk[2] === undefined ? 1 : Number(hunk[2])];
      if (count > 0) out.set(file, [...(out.get(file) ?? []), [from, from + count - 1]]);
    }
  }
  for (const path of git(dir, "ls-files", "-z", "--others", "--exclude-standard", "--", "src/").split("\0").filter(Boolean)) out.set(path, [[1, Infinity]]);
  return out;
}

/**
 * The mutants of the changed hunks of src/ in the working tree of `dir` against the merge base of `base` and HEAD:
 * `{base, mutants}`.
 */
export function changedMutants({ dir = process.cwd(), base = "origin/main" } = {}) {
  const from = git(dir, "merge-base", base, "HEAD").trim();
  const mutants = [];
  for (const [path, ranges] of [...changedLines(dir, from)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!MUTABLE.test(path) || path.endsWith(".d.ts") || !existsSync(join(dir, path))) continue;
    const text = readFileSync(join(dir, path), "utf8");
    mutants.push(...mutantsOf(dir, path, text, (n) => ranges.some(([a, b]) => n >= a && n <= b)));
  }
  return { base: from, mutants };
}
