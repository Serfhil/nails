// Условия (core.md 4.12): дерево all/any/not и листья. Трассировка для отладочного вида, причина для игрока.

import type { Engine } from "./engine.ts";
import { cmp } from "./engine.ts";
import type { CondNode, CondTrace } from "./types.ts";
import type { Ref } from "./state.ts";
import { charRef, refId, refKind } from "./state.ts";
import { finalValue, isIncap, isIncapPermanent, ladderStepIndex, resolveSubject, type Ctx } from "./vars.ts";
import { countMods } from "./modifiers.ts";
import { calcValue } from "./calc.ts";
import { charRole, membersAmong, workerCount } from "./workforce.ts";

/** Разрешить {"$data": "имя"} из данных контекста. */
export function resolveData(e: Engine, v: any, ctx: Ctx): any {
  if (v && typeof v === "object" && !Array.isArray(v) && "$data" in v) {
    const name = v.$data;
    const d = ctx.data ?? {};
    if (name in d) return d[name];
    e.error(`нет данных «${name}»${ctx.event ? ` (событие ${ctx.event})` : ""}`);
    return undefined;
  }
  return v;
}

/** Рекурсивно разрешить $data во вложенном объекте данных. */
export function resolveDeep(e: Engine, v: any, ctx: Ctx): any {
  if (Array.isArray(v)) return v.map((x) => resolveDeep(e, x, ctx));
  if (v && typeof v === "object") {
    if ("$data" in v) return resolveData(e, v, ctx);
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolveDeep(e, x, ctx);
    return o;
  }
  return v;
}

function hasItem(e: Engine, ref: Ref, type: string): boolean {
  const k = refKind(ref);
  for (const it of e.s.items) {
    if (it.type !== type) continue;
    if (k === "world") return true;
    if (k === "character") {
      if (it.loc.kind === "char" && it.loc.char === refId(ref)) return true;
      if (it.loc.kind === "inventory" && ref === e.heroRef) return true;
    }
    if (k === "workshop" && it.loc.kind === "workshop" && `ws:${it.loc.ws}` === ref) return true;
  }
  return false;
}

function leaf(e: Engine, n: Record<string, any>, ctx: Ctx): boolean {
  const val = (x: any) => resolveData(e, x, ctx);
  switch (n.type) {
    case "var": {
      const s = resolveSubject(e, n.subject, ctx);
      if (!s || !e.exists(s)) return false;
      const x = n.field === "level" ? ladderStepIndex(e, s, n.var) : finalValue(e, s, n.var);
      if (x === null) return false;
      return cmp(x, n.op, val(n.value));
    }
    case "var_cmp": {
      const a = resolveSubject(e, n.a, ctx);
      const b = resolveSubject(e, n.b, ctx);
      if (!a || !b || !e.exists(a) || !e.exists(b)) return false;
      const xa = n.field === "level" ? ladderStepIndex(e, a, n.var) : finalValue(e, a, n.var);
      const xb = n.field === "level" ? ladderStepIndex(e, b, n.var) : finalValue(e, b, n.var);
      if (xa === null || xb === null) return false;
      return cmp(xa, n.op, xb);
    }
    case "has_modifier": {
      const s = resolveSubject(e, n.subject, ctx);
      if (!s || !e.exists(s)) return false;
      const c = countMods(e, s, { template: n.template, tag: n.tag });
      return c >= (val(n.min_count) ?? 1) && c > 0;
    }
    case "has_item": {
      const s = resolveSubject(e, n.subject ?? "hero", ctx);
      if (!s || !e.exists(s)) return false;
      return hasItem(e, s, n.item);
    }
    case "stock":
      return cmp(e.s.stock[n.good] ?? 0, n.op, val(n.value));
    case "day":
      return cmp(e.s.day, n.op, val(n.value));
    case "hour":
      return cmp(e.s.hour, n.op, val(n.value));
    case "calc":
      return cmp(calcValue(e, n.name, n.action ?? null), n.op, val(n.value));
    case "role": {
      const s = resolveSubject(e, n.subject, ctx);
      const c = e.charOf(s);
      if (!c) {
        // кандидат из пула: роль шаблона
        const id = s ? refId(s) : "";
        return !!s && refKind(s) === "character" && e.s.pool.includes(id) && e.idx.chars.get(id)?.role === n.role;
      }
      return charRole(e, c) === n.role;
    }
    case "self_is_hero":
      return !!ctx.self && ctx.self === e.heroRef;
    case "hired": {
      const c = e.char(n.character);
      return !!c && c.kind === "worker";
    }
    case "worker_count":
      return cmp(workerCount(e), n.op, val(n.value));
    case "workshop_type": {
      const s = resolveSubject(e, n.subject ?? "workshop", ctx);
      if (!s || refKind(s) !== "workshop") return false;
      return e.ws(refId(s))?.type === n.workshop;
    }
    case "incapacitated": {
      const s = resolveSubject(e, n.subject, ctx);
      if (!s || !e.charOf(s)) return false;
      if (!isIncap(e, s)) return false;
      return n.permanent ? isIncapPermanent(e, s) : true;
    }
    case "obligation":
      return e.s.obligations.some((o) => o.tpl === n.id && o.state === (n.state ?? "active"));
    case "event_count":
      return cmp(e.s.eventCounts[n.event] ?? 0, n.op, val(n.value));
    case "some": {
      for (const c of membersAmong(e, n.among ?? "characters")) {
        if (evalCond(e, n.where ?? null, { ...ctx, self: charRef(c.id) })) return true;
      }
      return false;
    }
    case "data": {
      const d = ctx.data ?? {};
      if (!(n.name in d)) return false;
      return cmp(d[n.name], n.op ?? "==", val(n.value));
    }
    default:
      e.error(`неизвестный тип условия ${n.type}`);
      return false;
  }
}

export function evalCond(e: Engine, node: CondNode | undefined, ctx: Ctx): boolean {
  if (node === null || node === undefined || node === true) return true;
  if (node === false) return false;
  const n = node as any;
  if (Array.isArray(n)) return n.every((x) => evalCond(e, x, ctx));
  if ("all" in n) return (n.all as CondNode[]).every((x) => evalCond(e, x, ctx));
  if ("any" in n) return (n.any as CondNode[]).some((x) => evalCond(e, x, ctx));
  if ("not" in n) return !evalCond(e, n.not, ctx);
  return leaf(e, n, ctx);
}

export function evalAll(e: Engine, list: CondNode[] | undefined | null, ctx: Ctx): boolean {
  for (const c of list ?? []) if (!evalCond(e, c, ctx)) return false;
  return true;
}

/** Текст причины: первый ложный узел с `text` сверху вниз. */
export function failText(e: Engine, node: CondNode | undefined, ctx: Ctx): string | null {
  if (node === null || node === undefined || typeof node === "boolean") return null;
  const n = node as any;
  if (evalCond(e, n, ctx)) return null;
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n)) {
    for (const x of n) { const t = failText(e, x, ctx); if (t) return t; }
    return null;
  }
  if ("all" in n) {
    for (const x of n.all) { const t = failText(e, x, ctx); if (t) return t; }
  } else if ("any" in n) {
    for (const x of n.any) { const t = failText(e, x, ctx); if (t) return t; }
  }
  return null;
}

/** Трассировка проверки каждого узла (для debugView). */
export function traceCond(e: Engine, node: CondNode | undefined, ctx: Ctx): CondTrace | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "boolean") return { node: String(node), result: node };
  const n = node as any;
  if (Array.isArray(n)) {
    const children = n.map((x) => traceCond(e, x, ctx)!).filter(Boolean);
    return { node: "list", result: children.every((c) => c.result), children };
  }
  for (const k of ["all", "any"] as const) {
    if (k in n) {
      const children = (n[k] as CondNode[]).map((x) => traceCond(e, x, ctx)!).filter(Boolean);
      return { node: k, result: evalCond(e, n, ctx), text: n.text, children };
    }
  }
  if ("not" in n) {
    const ch = traceCond(e, n.not, ctx);
    return { node: "not", result: evalCond(e, n, ctx), text: n.text, children: ch ? [ch] : [] };
  }
  const { text, ...rest } = n;
  return { node: JSON.stringify(rest), result: evalCond(e, n, ctx), text };
}
