// Мелкие помощники: сбор проблем, безопасный доступ к данным, подсказки опечаток.
import type { Problem, Severity } from "./types.ts";

export class Problems {
  list: Problem[] = [];
  private seen = new Set<string>();

  add(severity: Severity, code: string, file: string, id: string, path: string, message: string): void {
    const key = `${code}|${file}|${id}|${path}|${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push({ severity, code, file, id: id || "-", path, message });
  }
  err(code: string, file: string, id: string, path: string, message: string): void {
    this.add("error", code, file, id, path, message);
  }
  warn(code: string, file: string, id: string, path: string, message: string): void {
    this.add("warning", code, file, id, path, message);
  }
}

export const isObj = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** `{"$data": "имя"}` → имя, иначе undefined */
export const dataName = (v: unknown): string | undefined =>
  isObj(v) && typeof v.$data === "string" && Object.keys(v).length === 1 ? v.$data : undefined;

export const recId = (rec: unknown, index: number): string =>
  isObj(rec) && typeof rec.id === "string" && rec.id ? rec.id : `#${index}`;

export const joinPath = (base: string, key: string | number): string =>
  typeof key === "number" ? `${base}[${key}]` : base ? `${base}.${key}` : key;

/** Расстояние Левенштейна (для подсказки «возможно, имелось в виду»). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Ближайший по написанию вариант из списка или undefined. */
export function suggest(value: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  const limit = Math.max(2, Math.floor(value.length / 3));
  for (const c of candidates) {
    if (c === value) continue;
    let d = levenshtein(value.toLowerCase(), c.toLowerCase());
    if (d > limit && (c.includes(value) || value.includes(c)) && Math.min(c.length, value.length) >= 3) d = limit;
    if (d <= limit && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export const didYouMean = (value: string, candidates: Iterable<string>): string => {
  const s = suggest(value, candidates);
  return s ? ` Возможно, имелось в виду «${s}».` : "";
};

/** Подстановки `{имя}` в тексте. */
export function placeholders(text: string): string[] {
  const out: string[] = [];
  const re = /\{([^{}\s]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

export const CMP_OPS = [">=", ">", "<=", "<", "==", "!="] as const;

export function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">=": return a >= b;
    case ">": return a > b;
    case "<=": return a <= b;
    case "<": return a < b;
    case "==": return a === b;
    case "!=": return a !== b;
  }
  return false;
}
