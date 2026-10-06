#!/usr/bin/env node
// check-eol: tracked text files are LF in the index and in the working copy,
// and every docs/design file in the working copy is byte-equal to its blob —
// the byte-exact round-trip depends on it (D-10, LG-42).
//   node scripts/check-eol.mjs
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const errors = [];

for (const line of git("ls-files", "--eol").split("\n").filter(Boolean)) {
  const [meta, path] = line.split("\t");
  const [index, work, attr] = meta.trim().split(/\s+/);
  if (!attr.startsWith("attr/text") || index === "i/none" || index === "i/-text") continue;
  if (index !== "i/lf" || work !== "w/lf") errors.push(`${path}: ${index} ${work}, нужно i/lf w/lf`);
}

const blobs = git("ls-files", "-s", "--", "docs/design").split("\n").filter(Boolean);
for (const line of blobs) {
  const [meta, path] = line.split("\t");
  const blob = meta.split(" ")[1];
  const work = git("hash-object", "--no-filters", "--", path).trim();
  if (work !== blob) errors.push(`${path}: байты рабочей копии не равны индексу`);
}

console.log(`check-eol: файлов docs/design ${blobs.length}, ошибок ${errors.length}`);
for (const e of errors) console.log("  " + e);
process.exit(errors.length ? 1 : 0);
