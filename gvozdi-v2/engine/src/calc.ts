// Расчётные величины (core.md 3.10). Фиксированный список; пак своих не объявляет.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import { WORLD, charRef } from "./state.ts";
import { finalValue, isIncap } from "./vars.ts";
import { worksFlag } from "./workforce.ts";

export const CALC_NAMES = ["wealth", "stock_value", "cost_hours", "income_yesterday", "expense_yesterday"] as const;

export function stockValue(e: Engine): number {
  let v = 0;
  for (const [g, q] of Object.entries(e.s.stock)) v += q * (e.idx.goods.get(g)?.price ?? 0);
  return norm(v);
}

/** Сколько рабочих часов хватит склада назначенным исполнителям (Infinity — не расходуется). */
export function costHours(e: Engine, action: string | null): number {
  const rate = new Map<string, number>(); // ресурс -> расход в час
  for (const c of e.s.chars) {
    if (c.assignment.kind !== "action") continue;
    if (action && c.assignment.action !== action) continue;
    if (!worksFlag(e, c) && c.kind !== "hero") continue;
    const ref = charRef(c.id);
    if (isIncap(e, ref)) continue;
    const a = e.idx.actions.get(c.assignment.action);
    if (!a) continue;
    const tags = a.tags ?? [];
    const speed = a.speed_scaled ? Math.max(finalValue(e, ref, "speed", tags), 1e-9) : 1;
    const batchesPerHour = speed / Math.max(a.hours, 1e-9);
    for (const line of a.cost ?? []) {
      const l = line as any;
      const qty = typeof l.qty === "number" ? l.qty : 0;
      if (!qty) continue;
      const key = l.good ? `good:${l.good}` : `var:${l.var}`;
      rate.set(key, (rate.get(key) ?? 0) + qty * batchesPerHour);
    }
  }
  let best = Infinity;
  for (const [key, r] of rate) {
    if (r <= 0) continue;
    const have = key.startsWith("good:") ? (e.s.stock[key.slice(5)] ?? 0) : finalValue(e, WORLD, key.slice(4));
    best = Math.min(best, Math.max(0, have) / r);
  }
  return norm(best);
}

export function calcValue(e: Engine, name: string, action: string | null): number {
  switch (name) {
    case "wealth": return norm(finalValue(e, WORLD, "money") + stockValue(e));
    case "stock_value": return stockValue(e);
    case "cost_hours": return costHours(e, action);
    case "income_yesterday": return e.s.yesterday.income;
    case "expense_yesterday": return e.s.yesterday.expense;
    default:
      e.error(`неизвестная расчётная величина ${name}`);
      return 0;
  }
}
