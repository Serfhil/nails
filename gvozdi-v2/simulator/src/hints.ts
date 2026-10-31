// Подсказки пака strategy_hints.json (simulator.md §3) и разбор пака без знания его id:
// симулятор читает только поля контракта (end_game, open_when, visible, …).
import type { Pack } from "../../engine/src/index.ts";

export interface Hints {
  action_ladder: string[];
  hire_order: string[];
  buy_order: string[];
  rest_action: string | null;
  rest_when: { var: string; above: number } | null;
  offer_choices: Record<string, string>;
  traders: string[];
  coverage: { suspicious: number; not_hidden: number };
  /** true — в паке нет strategy_hints.json */
  none: boolean;
}

/** Пороги метрики закрытого по умолчанию: доли прогонов. */
export const DEFAULT_COVERAGE = { suspicious: 0.01, not_hidden: 0.9 };

const strList = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

export function readHints(pack: Pack): Hints {
  const raw = pack.strategy_hints;
  const h = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rw = h.rest_when as { var?: unknown; above?: unknown } | undefined;
  const ct = (h.coverage_thresholds ?? {}) as Record<string, unknown>;
  const num = (...xs: unknown[]): number | undefined => xs.find((x): x is number => typeof x === "number");
  const pctToShare = (x: number | undefined): number | undefined => (x === undefined ? undefined : x > 1 ? x / 100 : x);
  const oc: Record<string, string> = {};
  if (h.offer_choices && typeof h.offer_choices === "object")
    for (const [k, v] of Object.entries(h.offer_choices as Record<string, unknown>)) if (typeof v === "string") oc[k] = v;
  return {
    action_ladder: strList(h.action_ladder),
    hire_order: strList(h.hire_order),
    buy_order: strList(h.buy_order),
    rest_action: typeof h.rest_action === "string" ? h.rest_action : null,
    rest_when: rw && typeof rw.var === "string" && typeof rw.above === "number" ? { var: rw.var, above: rw.above } : null,
    offer_choices: oc,
    traders: strList(h.traders),
    coverage: {
      suspicious: pctToShare(num(ct.suspicious, ct.low, ct.min)) ?? DEFAULT_COVERAGE.suspicious,
      not_hidden: pctToShare(num(ct.not_hidden, ct.high, ct.max)) ?? DEFAULT_COVERAGE.not_hidden,
    },
    none: raw === undefined || raw === null,
  };
}

// ---------- статический разбор пака ----------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

/** Все объекты-эффекты end_game внутри значения (рекурсивно). */
export function findEndings(x: unknown, out: { title: string; tag: string | null }[] = []): { title: string; tag: string | null }[] {
  if (Array.isArray(x)) for (const y of x) findEndings(y, out);
  else if (isObj(x)) {
    if (x.type === "end_game" && typeof x.title === "string") out.push({ title: x.title, tag: typeof x.tag === "string" ? x.tag : null });
    for (const v of Object.values(x)) findEndings(v, out);
  }
  return out;
}

/** Условия на переменные внутри дерева условий. */
export interface VarCond { subject: string; var: string; op: string; value: number }
function collectVarConds(x: unknown, out: VarCond[]): void {
  if (Array.isArray(x)) for (const y of x) collectVarConds(y, out);
  else if (isObj(x)) {
    if (x.type === "var" && typeof x.var === "string" && typeof x.op === "string" && typeof x.value === "number" && x.field === undefined)
      out.push({ subject: String(x.subject ?? "self"), var: x.var, op: x.op, value: x.value });
    for (const v of Object.values(x)) collectVarConds(v, out);
  }
}

export interface PackFacts {
  /** offer template → option id → tag концовки, к которой ведёт вариант */
  optionEnding: Map<string, Map<string, string | null>>;
  /** условия на переменные у событий, ведущих к fail-концовкам */
  failConds: VarCond[];
  /** действия, эффекты которых ведут к fail-концовке */
  failActions: Set<string>;
  /** название товара (как в CostLine.name) → действия, у которых он в outputs */
  producers: Map<string, string[]>;
  /** действие → предметы, которые оно выдаёт (эффекты с полем item) — чтобы применять buy_order к действиям покупки */
  actionItems: Map<string, string[]>;
}

function collectItems(x: unknown, out: string[]): void {
  if (Array.isArray(x)) for (const y of x) collectItems(y, out);
  else if (isObj(x)) {
    if (typeof x.item === "string") out.push(x.item);
    for (const v of Object.values(x)) collectItems(v, out);
  }
}

export function packFacts(pack: Pack): PackFacts {
  const optionEnding = new Map<string, Map<string, string | null>>();
  for (const o of (pack.offers ?? []) as unknown as Obj[]) {
    const m = new Map<string, string | null>();
    for (const opt of (Array.isArray(o.options) ? o.options : []) as Obj[]) {
      const e = findEndings(opt);
      if (e.length) m.set(String(opt.id), e[0].tag);
    }
    if (m.size) optionEnding.set(String(o.id), m);
  }
  const failConds: VarCond[] = [];
  for (const ev of (pack.events ?? []) as unknown as Obj[]) {
    if (findEndings(ev.effects).some((e) => e.tag === "fail")) collectVarConds(ev.trigger, failConds);
  }
  const failActions = new Set<string>();
  for (const a of (pack.actions ?? []) as unknown as Obj[]) if (findEndings(a).some((e) => e.tag === "fail")) failActions.add(String(a.id));
  const goodName = new Map<string, string>();
  for (const g of (pack.goods ?? []) as unknown as Obj[]) goodName.set(String(g.id), String(g.name ?? g.id));
  const producers = new Map<string, string[]>();
  for (const a of (pack.actions ?? []) as unknown as Obj[])
    for (const o of (Array.isArray(a.outputs) ? a.outputs : []) as Obj[]) {
      const name = goodName.get(String(o.good));
      if (name) producers.set(name, [...(producers.get(name) ?? []), String(a.id)]);
    }
  const actionItems = new Map<string, string[]>();
  for (const a of (pack.actions ?? []) as unknown as Obj[]) {
    const items: string[] = [];
    collectItems(a.effects, items);
    if (items.length) actionItems.set(String(a.id), items);
  }
  return { optionEnding, failConds, failActions, producers, actionItems };
}
