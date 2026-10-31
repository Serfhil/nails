// Синхронизация копий контракта: разделы 4 и 5 core.md → content.md и view.md.
// Запуск: npm run docs:sync (переписать) | npm run docs:check (только проверить, код 1 при расхождении).
import { readFileSync, writeFileSync } from "node:fs";

const check = process.argv.includes("--check");

const core = readFileSync("core.md", "utf8").replace(/\r\n/g, "\n");

// Раздел core.md от заголовка "## N." до следующего "## " (или до "---" перед ним), заголовки сдвинуты на уровень ниже.
function section(n: number): string {
  const start = core.indexOf(`\n## ${n}. `);
  const end = core.indexOf(`\n## ${n + 1}. `);
  if (start < 0 || end < 0) throw new Error(`core.md: нет раздела ${n}`);
  const body = core.slice(start + 1, end).replace(/\n---\s*$/, "").trim();
  return body.replace(/^(#{2,6}) /gm, (_m, h: string) => `${h}# `);
}

const targets = [
  { file: "content.md", tag: "core-4", text: section(4) },
  { file: "view.md", tag: "core-5", text: section(5) },
];

let drift = false;
for (const t of targets) {
  const src = readFileSync(t.file, "utf8").replace(/\r\n/g, "\n");
  const begin = `<!-- sync:${t.tag}:begin -->`;
  const endMark = `<!-- sync:${t.tag}:end -->`;
  const a = src.indexOf(begin);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0) throw new Error(`${t.file}: нет маркеров ${begin} / ${endMark}`);
  const next = src.slice(0, a + begin.length) + "\n" + t.text + "\n" + src.slice(b);
  if (next !== src) {
    drift = true;
    if (check) console.error(`РАСХОЖДЕНИЕ: ${t.file} не совпадает с core.md (раздел ${t.tag.slice(-1)}). Запусти npm run docs:sync.`);
    else { writeFileSync(t.file, next); console.log(`обновлено: ${t.file}`); }
  } else console.log(`совпадает: ${t.file}`);
}
if (check && drift) process.exit(1);
