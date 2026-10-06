#!/usr/bin/env node
// lint-ids: целостность ID дизайна LATTICE по правилам RM-01, RM-02 и RM-Z03.
//   node discussion/tools/lint-ids.mjs [docs/design] [--baseline file] [--save-baseline file]
// Ошибки: ID определён дважды; ID упомянут, но не определён; диапазон «A…B» с дырой;
// префикс определения не совпадает с документом; строка таблицы с иным числом ячеек, чем у её заголовка.
// ID в `inline code` — текст, не ссылка (RM-Z03). Содержимое fenced-блоков не сканируется.
// Выход 1 при новых ошибках.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const DIR = args.find((a, i) => !a.startsWith("--") && !["--baseline", "--save-baseline"].includes(args[i - 1])) || "docs/design";
const PFX = ["RM", "GL", "PR", "KR", "TY", "RF", "LG", "TR", "RT", "DP", "LN", "BN", "OB", "AG", "ST", "SL", "LT", "NX"];
const ID = new RegExp(`\\b(${PFX.join("|")})-(Z?)(\\d{2})\\b`, "g");
const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const docPrefix = (f, t) => (f === "README.md" ? ["RM"] : f.startsWith("15-") ? ["LT", "NX"] : (t.match(/\n([A-Z]{2})-Z01\./) || [, null]).slice(1));

const defs = new Map(), errors = [], mentions = [];
for (const f of files) {
  const text = readFileSync(join(DIR, f), "utf8"), own = docPrefix(f, text);
  let fence = false, cols = null;
  text.split("\n").forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    const fm = line.match(/^```\S*\s*([A-Z]{2}-Z?\d{2})?/);
    if (line.startsWith("```")) { if (!fence && fm[1]) define(fm[1], at, own); fence = !fence; return; }
    if (fence) return;
    if (line.startsWith("|")) {
      const n = line.replace(/\\\|/g, "").replace(/`[^`]*`/g, (m) => m.replace(/\|/g, "")).split("|").length;
      if (cols === null) cols = n; else if (n !== cols) errors.push(`${at}: строка таблицы — ${n - 2} ячеек, у заголовка ${cols - 2}`);
    } else cols = null;
    const row = line.match(/^\|\s*([A-Z]{2}-Z?\d{2})\s*\|/), para = line.match(/^([A-Z]{2}-Z?\d{2})\./);
    if (row) define(row[1], at, own); else if (para) define(para[1], at, own);
    const plain = line.replace(/`[^`]*`/g, "");
    for (const r of plain.matchAll(new RegExp(`\\b(${PFX.join("|")})-(Z?)(\\d{2})\\s*…\\s*\\1-\\2(\\d{2})\\b`, "g"))) {
      const [, p, z, a, b] = r;
      for (let n = +a; n <= +b; n++) mentions.push([`${p}-${z}${String(n).padStart(2, "0")}`, at]);
    }
    for (const m of plain.matchAll(ID)) mentions.push([m[0], at]);
  });
}
function define(id, at, own) {
  if (defs.has(id)) errors.push(`${at}: ${id} определён дважды (первый раз ${defs.get(id)})`);
  else defs.set(id, at);
  if (own.length && own[0] && !own.includes(id.slice(0, 2))) errors.push(`${at}: ${id} определён не в своём документе`);
}
for (const [id, at] of mentions) if (!defs.has(id)) errors.push(`${at}: ${id} упомянут, но не определён`);

const uniq = [...new Set(errors)];
const base = opt("--baseline") && existsSync(opt("--baseline")) ? new Set(readFileSync(opt("--baseline"), "utf8").split("\n").filter(Boolean)) : new Set();
const key = (e) => e.replace(/^[^:]+:\d+: /, "");
if (opt("--save-baseline")) { writeFileSync(opt("--save-baseline"), [...new Set(uniq.map(key))].join("\n") + "\n"); }
const fresh = uniq.filter((e) => !base.has(key(e)));
console.log(`файлов ${files.length}, определений ${defs.size}, упоминаний ${mentions.length}, ошибок ${uniq.length}, новых ${fresh.length}`);
for (const e of fresh) console.log("  " + e);
process.exit(fresh.length ? 1 : 0);
