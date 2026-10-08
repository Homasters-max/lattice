// conventions: пункты CONVENTIONS.md (S0-50) — номер §N.M, название, область путей.
// Пункт — заголовок `### §N.M Название` в разделе `## N. …`, следом строка `Область: `glob`, `glob``.
// Номер растёт внутри раздела и не переиспользуется: убранный пункт оставляет пропуск, ссылки на него не оживают.
// Читают: protocol — ссылки находок `CONVENTIONS §N.M`; plan-check — форму файла и ссылки из кода и процесса;
// сборка brief — область путей (S0-48).

const SECTION = /^## (\d+)\. /;
const ITEM = /^### §(\d+)\.(\d+) (\S.*)$/;
const AREA = /^Область: (.+)$/;
// Ссылка на пункты: `CONVENTIONS §1.2`, `CONVENTIONS.md §3.1, §3.2`.
const REFERENCE = /CONVENTIONS(?:\.md)?((?:,? §\d+(?:\.\d+)*)+)/g;

/** Пункты файла и нарушения его формы: `{items: [{id: "§N.M", title, areas, line}], problems: [строка]}`. */
export function conventionsOf(text) {
  const items = [];
  const problems = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let section = 0;
  let last = 0;
  let fence = false;
  lines.forEach((line, i) => {
    if (line.startsWith("```")) fence = !fence;
    if (fence) return;
    const s = SECTION.exec(line);
    if (s) {
      if (Number(s[1]) !== section + 1) problems.push(`CONVENTIONS.md:${i + 1}: раздел ${s[1]} после раздела ${section}`);
      section = Number(s[1]);
      last = 0;
      return;
    }
    if (!line.startsWith("### ")) return;
    const m = ITEM.exec(line);
    if (!m) return problems.push(`CONVENTIONS.md:${i + 1}: пункт без номера — «### §N.M Название»`);
    const [n, k] = [Number(m[1]), Number(m[2])];
    if (n !== section) problems.push(`CONVENTIONS.md:${i + 1}: §${n}.${k} в разделе ${section} — номер пункта начинается с номера раздела`);
    else if (k <= last) problems.push(`CONVENTIONS.md:${i + 1}: §${n}.${k} после §${n}.${last} — номер растёт внутри раздела`);
    last = Math.max(last, k);
    const area = AREA.exec(lines[i + 1] ?? "");
    const areas = area ? [...area[1].matchAll(/`([^`]+)`/g)].map((a) => a[1]) : [];
    if (areas.length === 0) problems.push(`CONVENTIONS.md:${i + 1}: у §${n}.${k} нет строки «Область:» с путями в обратных кавычках`);
    items.push({ id: `§${n}.${k}`, title: m[3], areas, line: i + 1 });
  });
  return { items, problems };
}

/** Ссылки текста на пункты CONVENTIONS.md — как написаны: `§1.2`, `§3`. */
function referencesOf(text) {
  return [...text.matchAll(REFERENCE)].flatMap((m) => m[1].match(/§\d+(?:\.\d+)*/g));
}

/** Ссылки текста, которые не называют пункт из `ids`: на раздел целиком или на пункт, которого нет. */
export function unknownReferences(text, ids) {
  return referencesOf(text).filter((ref) => !ids.has(ref));
}
