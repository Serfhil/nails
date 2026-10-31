// Сводные таблицы markdown и CSV (simulator.md §5).
import type { EntityInfo } from "./coverage.ts";
import type { Hints } from "./hints.ts";
import { MONEY_DAYS, type RunResult } from "./run.ts";

export interface StrategyRuns {
  name: string;
  runs: RunResult[];
  error: string | null; // стратегия пропущена
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const num = (x: number | null): string => (x === null ? "—" : String(Math.round(x * 10) / 10));
const csvCell = (x: string | number): string => {
  const s = String(x);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]): string => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** Средняя доля общих открытых сущностей у пар забегов (Жаккар соседних прогонов). */
function spread(runs: RunResult[], keys: Set<string>): number | null {
  if (runs.length < 2) return null;
  let sum = 0, n = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const a = [...runs[i].covered].filter((k) => keys.has(k));
    const b = new Set([...runs[i + 1].covered].filter((k) => keys.has(k)));
    const inter = a.filter((k) => b.has(k)).length;
    const uni = new Set([...a, ...b]).size;
    sum += uni ? inter / uni : 1;
    n++;
  }
  return sum / n;
}

export interface Summary { md: string; files: Record<string, string> }

export function buildSummary(packDir: string, packTitle: string, hints: Hints, univ: Map<string, EntityInfo>, all: StrategyRuns[], opts: { runs: number; cap: number; seedStart: number }): Summary {
  const done = all.filter((s) => !s.error);
  // строки метрики: сущности с условием из пака + всё открытое по реестру opened, чего нет в перечне
  const rows = new Map(univ);
  for (const s of done) for (const r of s.runs) for (const k of r.covered) {
    if (rows.has(k)) continue;
    const kind = k.slice(0, k.indexOf(":"));
    if (["action", "variable", "character", "good", "item", "ending"].includes(kind)) rows.set(k, { key: k, kind, id: k.slice(kind.length + 1) });
  }
  const keys = new Set(rows.keys());
  const th = hints.coverage;

  const md: string[] = [];
  md.push(`# Сводка симулятора — ${packTitle}`, "");
  md.push(`Пак: \`${packDir}\`. Прогонов на стратегию: ${opts.runs}, потолок: ${opts.cap} дн., зёрна: ${opts.seedStart}…${opts.seedStart + opts.runs - 1}.`);
  md.push(hints.none ? "Подсказки: **без подсказок** (strategy_hints.json нет, стратегии на своих значениях по умолчанию)." : "Подсказки: strategy_hints.json пака.");
  md.push("");
  for (const s of all) if (s.error) md.push(`- Стратегия **${s.name}** пропущена: ${s.error}`);

  // --- стратегии
  const stratRows: (string | number)[][] = [["strategy", "runs", "goal_share", "fail_share", "cap_share", "goal_declined_share", "incapacitated_share", "median_commands", "median_end_day", ...MONEY_DAYS.map((d) => `median_money_day_${d}`), "spread", "hints"]];
  md.push("## По стратегиям", "");
  md.push(`| Стратегия | Цель | Провал | Потолок | Отказ от победы | Недееспособность героя | Команд (медиана) | День конца (медиана) | ${MONEY_DAYS.map((d) => `Деньги д${d}`).join(" | ")} | Разброс |`);
  md.push(`|---|---|---|---|---|---|---|---|${MONEY_DAYS.map(() => "---").join("|")}|---|`);
  for (const s of done) {
    const n = s.runs.length;
    const share = (f: (r: RunResult) => boolean) => s.runs.filter(f).length / n;
    const goal = share((r) => r.outcome.startsWith("goal:"));
    const fail = share((r) => r.outcome.startsWith("fail:"));
    const capS = share((r) => r.outcome === "cap");
    const decl = share((r) => r.goalDeclined);
    const inc = share((r) => r.incapacitated);
    const mc = median(s.runs.map((r) => r.commands));
    const md0 = median(s.runs.map((r) => r.endDay));
    const money = MONEY_DAYS.map((d) => {
      const xs = s.runs.map((r) => r.moneyAt[d]).filter((x): x is number => x !== undefined);
      return { m: median(xs), n: xs.length };
    });
    const sp = spread(s.runs, keys);
    md.push(`| ${s.name} | ${pct(goal)} | ${pct(fail)} | ${pct(capS)} | ${pct(decl)} | ${pct(inc)} | ${num(mc)} | ${num(md0)} | ${money.map((x) => (x.n ? `${num(x.m)} (n=${x.n})` : "—")).join(" | ")} | ${sp === null ? "—" : pct(sp)} |`);
    stratRows.push([s.name, n, goal, fail, capS, decl, inc, mc ?? "", md0 ?? "", ...money.map((x) => x.m ?? ""), sp ?? "", hints.none ? "без подсказок" : "подсказки пака"]);
  }
  md.push("", "Деньги — медиана по прогонам, дожившим до дня (n). Разброс — средняя доля общих открытых сущностей у двух забегов одной стратегии.", "");

  // --- исходы
  const outRows: (string | number)[][] = [["strategy", "outcome", "count", "share", "median_day"]];
  md.push("## Исходы", "", "| Стратегия | Исход | Доля | Медианный день |", "|---|---|---|---|");
  for (const s of done) {
    const groups = new Map<string, RunResult[]>();
    for (const r of s.runs) groups.set(r.outcome, [...(groups.get(r.outcome) ?? []), r]);
    for (const [o, rs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const share = rs.length / s.runs.length;
      const mday = median(rs.map((r) => r.endDay));
      md.push(`| ${s.name} | ${o} | ${pct(share)} | ${o === "cap" ? "—" : num(mday)} |`);
      outRows.push([s.name, o, rs.length, share, o === "cap" ? "" : mday ?? ""]);
    }
  }
  md.push("");

  // --- закрытое
  const covHeader = ["kind", "id", ...done.map((s) => s.name), "total", "mark"];
  const covRows: (string | number)[][] = [covHeader];
  const total = done.reduce((s, x) => s + x.runs.length, 0);
  const lines: { kind: string; id: string; per: number[]; tot: number; mark: string }[] = [];
  for (const e of rows.values()) {
    const per = done.map((s) => s.runs.filter((r) => r.covered.has(e.key)).length / (s.runs.length || 1));
    const cnt = done.reduce((acc, s) => acc + s.runs.filter((r) => r.covered.has(e.key)).length, 0);
    const tot = total ? cnt / total : 0;
    const mark = tot < th.suspicious ? "подозрительно" : tot > th.not_hidden ? "не скрытое" : "";
    lines.push({ kind: e.kind, id: e.id, per, tot, mark });
  }
  const kindOrder = ["action", "variable", "character", "good", "item", "modifier", "event", "offer", "option", "ending"];
  lines.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.tot - b.tot || a.id.localeCompare(b.id));
  md.push("## Закрытое: доля прогонов, где сущность открылась или сработала", "");
  md.push(`Пометки: < ${pct(th.suspicious)} — **подозрительно**, > ${pct(th.not_hidden)} — **не скрытое**.`, "");
  const sus = lines.filter((l) => l.mark === "подозрительно").length;
  const open = lines.filter((l) => l.mark === "не скрытое").length;
  md.push(`Сущностей: ${lines.length}; подозрительных: ${sus}; не скрытых: ${open}; остальное — скрытый контент: ${lines.length - sus - open}.`, "");
  md.push(`| Вид | id | ${done.map((s) => s.name).join(" | ")} | Всего | Пометка |`, `|---|---|${done.map(() => "---").join("|")}|---|---|`);
  for (const l of lines) {
    md.push(`| ${l.kind} | ${l.id} | ${l.per.map(pct).join(" | ")} | ${pct(l.tot)} | ${l.mark ? `**${l.mark}**` : ""} |`);
    covRows.push([l.kind, l.id, ...l.per, l.tot, l.mark]);
  }
  md.push("");
  return {
    md: md.join("\n"),
    files: { "strategies.csv": csv(stratRows), "outcomes.csv": csv(outRows), "coverage.csv": csv(covRows) },
  };
}
