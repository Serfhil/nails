// Публичный вход валидатора.
//   loadPack(dir)       — читает папку пака (fs) и проверяет: { pack, problems }
//   validatePack(pack)  — проверяет уже загруженный объект (без fs)
//   formatProblems(...) — текстовый вывод, по строке на проблему, сначала ошибки
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Pack, Problem } from "./types.ts";
import { PACK_FILES } from "./types.ts";
import { Problems } from "./util.ts";
import { sortProblems, validatePack } from "./validate.ts";

export type { Pack, Problem, Severity } from "./types.ts";
export { PACK_FILES } from "./types.ts";
export { validatePack, sortProblems } from "./validate.ts";

function jsonErrorText(msg: string, text: string): string {
  if (/line \d+/.test(msg)) return msg;
  const m = /position (\d+)/.exec(msg);
  if (!m) return msg;
  const pos = Number(m[1]);
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  return `${msg} (строка ${line}, столбец ${col})`;
}

export function loadPack(dir: string): { pack: Pack; problems: Problem[] } {
  const pack: Pack = {};
  const p = new Problems();
  const skip = new Set<string>();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    p.err("V001", "-", "-", "", `папка пака «${dir}» не найдена.`);
    return { pack, problems: p.list };
  }
  for (const f of PACK_FILES) {
    const file = join(dir, `${f.key}.json`);
    if (!existsSync(file)) {
      if (f.required) {
        p.err("V001", `${f.key}.json`, "-", "", `файл ${f.key}.json не найден в папке пака — он обязателен (core.md 4.1).`);
        skip.add(f.key);
      }
      continue;
    }
    let text = readFileSync(file, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    try {
      pack[f.key] = JSON.parse(text);
    } catch (e) {
      p.err("V001", `${f.key}.json`, "-", "", `ошибка синтаксиса JSON: ${jsonErrorText((e as Error).message, text).replace(/\s+/g, " ")}. Проверьте запятые, кавычки и скобки.`);
      skip.add(f.key);
    }
  }
  const known = new Set(PACK_FILES.map((f) => `${f.key}.json`));
  for (const name of readdirSync(dir))
    if (name.endsWith(".json") && !known.has(name))
      p.warn("W010", name, "-", "", `неизвестный файл пака «${name}» — движок его не читает.`);
  return { pack, problems: sortProblems([...p.list, ...validatePack(pack, { skipMissing: skip })]) };
}

export function formatProblem(x: Problem): string {
  return `${x.severity} ${x.code} ${x.file} ${x.id}${x.path ? ` ${x.path}` : ""} — ${x.message}`;
}

export function formatProblems(list: Problem[]): string {
  const errors = list.filter((x) => x.severity === "error").length;
  const warnings = list.length - errors;
  const lines = list.map(formatProblem);
  lines.push(errors || warnings ? `Итого: ошибок ${errors}, предупреждений ${warnings}.` : "Пак в порядке: ошибок и предупреждений нет.");
  return lines.join("\n");
}

export const hasErrors = (list: Problem[]): boolean => list.some((x) => x.severity === "error");
