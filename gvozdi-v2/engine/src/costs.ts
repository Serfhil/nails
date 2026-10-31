// Расход (core.md 3.5): проверка, строки для вида, списание.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type { CostLine, CostLineDef } from "./types.ts";
import { WORLD } from "./state.ts";
import { resolveData } from "./conditions.ts";
import { finalValue, rawOf, resolveSubject, setRaw, type Ctx } from "./vars.ts";
import { addGoods } from "./market.ts";

export interface CostItem {
  kind: "good" | "var";
  id: string;
  /** у кого списывается переменная */
  owner: string;
  qty: number;
}

/** Разобрать строки расхода для данного контекста. Переменная мира — у мира, иначе у исполнителя. */
export function resolveCost(e: Engine, lines: CostLineDef[] | undefined, ctx: Ctx): CostItem[] {
  const out: CostItem[] = [];
  for (const raw of lines ?? []) {
    const l = raw as any;
    if (l.good) {
      const q = resolveData(e, l.qty, ctx);
      out.push({ kind: "good", id: l.good, owner: WORLD, qty: typeof q === "number" ? q : 0 });
      continue;
    }
    if (l.var) {
      const vdef = e.idx.vars.get(l.var);
      const owner = vdef?.owner === "world" || !vdef ? WORLD : (ctx.actor ?? e.heroRef);
      let qty = 0;
      if (l.qty_from) {
        const from = resolveSubject(e, l.from ?? "self", ctx);
        qty = from && e.exists(from) ? finalValue(e, from, l.qty_from) : 0;
      } else {
        const q = resolveData(e, l.qty, ctx);
        qty = typeof q === "number" ? q : 0;
      }
      out.push({ kind: "var", id: l.var, owner, qty });
    }
  }
  return out;
}

export function have(e: Engine, c: CostItem): number {
  if (c.kind === "good") return e.s.stock[c.id] ?? 0;
  return finalValue(e, c.owner, c.id);
}

export function costName(e: Engine, c: CostItem): string {
  if (c.kind === "good") return e.idx.goods.get(c.id)?.name ?? c.id;
  if (c.id === "money") return e.idx.raw.pack.names?.money ?? e.idx.vars.get("money")?.name ?? c.id;
  return e.idx.vars.get(c.id)?.name ?? c.id;
}

export function costLines(e: Engine, items: CostItem[]): CostLine[] {
  return items.map((c) => ({ name: costName(e, c), need: norm(c.qty), have: norm(have(e, c)) }));
}

/** Первая невыполнимая строка или null. */
export function firstShort(e: Engine, items: CostItem[]): CostItem | null {
  for (const c of items) if (have(e, c) < c.qty - 1e-9) return c;
  return null;
}

export function shortReason(e: Engine, c: CostItem): string {
  return e.text("reason_cost", { name: costName(e, c), need: c.qty, have: have(e, c) });
}

/** Списать всё одновременно (проверка — заранее). */
export function payCost(e: Engine, items: CostItem[], source: string): void {
  for (const c of items) {
    if (!c.qty) continue;
    if (c.kind === "good") addGoods(e, c.id, -c.qty);
    else {
      // расход списывается ровно, мимо модификаторов изменений
      const before = rawOf(e, c.owner, c.id);
      setRaw(e, c.owner, c.id, before - c.qty);
      const delta = norm(rawOf(e, c.owner, c.id) - before);
      if (c.id === "money" && c.owner === WORLD && delta) e.s.ledger.push({ source, amount: delta });
    }
  }
}
