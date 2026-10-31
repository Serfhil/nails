// Переменные и лестницы (core.md 3.2, 3.3): сырое и итоговое значение, изменения, ступени, недееспособность.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type { Ref } from "./state.ts";
import { WORLD, charRef, refId, refKind } from "./state.ts";
import type { VariableDef } from "./types.ts";
import { activeMods, modMagnitude, tagsMatch, type ActiveMod } from "./modifiers.ts";

/** Контекст субъектов для условий, эффектов и подстановок. */
export interface Ctx {
  self?: Ref | null;
  actor?: Ref | null;
  partner?: Ref | null;
  candidate?: Ref | null;
  participant?: Ref | null;
  data?: Record<string, any>;
  /** действие (для calc cost_hours и меток) */
  action?: string | null;
  /** источник денег для итога дня */
  source?: string;
  /** выбранный для замены экземпляр оборудования (do_action.replace, core.md 3.7) */
  replace?: string | null;
  /** id события, применяющего эффекты */
  event?: string | null;
}

/** Субъект условия/цели → ссылка на сущность (core.md 4.12). */
export function resolveSubject(e: Engine, subj: string | undefined | null, ctx: Ctx): Ref | null {
  const s = subj ?? "self";
  switch (s) {
    case "hero": return e.heroRef;
    case "world": return WORLD;
    case "self": return ctx.self ?? null;
    case "actor": return ctx.actor ?? null;
    case "partner": return ctx.partner ?? null;
    case "candidate": return ctx.candidate ?? null;
    case "participant": return ctx.participant ?? null;
    case "workshop": return e.workshopOf(ctx.actor ?? ctx.participant ?? ctx.self ?? e.heroRef);
  }
  if (s.startsWith("char:")) {
    const id = s.slice(5);
    return e.char(id) ? charRef(id) : null;
  }
  return null;
}

export function varDef(e: Engine, id: string): VariableDef | undefined {
  return e.idx.vars.get(id);
}

function store(e: Engine, ref: Ref): Record<string, number> | null {
  const k = refKind(ref);
  if (k === "world") return e.s.world;
  if (k === "character") {
    const c = e.char(refId(ref));
    if (c) return c.vars;
    // кандидат из пула: только чтение, значения шаблона
    const def = e.idx.chars.get(refId(ref));
    if (!def || !e.s.pool.includes(def.id)) return null;
    const virt: Record<string, number> = {};
    for (const vd of e.idx.varsByOwner.character ?? []) virt[vd.id] = vd.start;
    for (const [key, x] of Object.entries(def.vars ?? {})) if (typeof x === "number") virt[key] = x;
    return virt;
  }
  if (k === "workshop") return e.ws(refId(ref))?.vars ?? null;
  return e.item(refId(ref))?.vars ?? null;
}

export function rawOf(e: Engine, ref: Ref, v: string): number {
  const st = store(e, ref);
  const def = varDef(e, v);
  if (!st) return 0;
  const x = st[v];
  if (typeof x === "number") return x;
  return def ? def.start : 0;
}

function clamp(def: VariableDef | undefined, x: number): number {
  if (!def) return x;
  if (typeof def.min === "number" && x < def.min) x = def.min;
  if (typeof def.max === "number" && x > def.max) x = def.max;
  return x;
}

/** Прямая установка сырого значения (с ограничением min/max). */
export function setRaw(e: Engine, ref: Ref, v: string, x: number): void {
  const st = store(e, ref);
  if (!st) return;
  const nx = norm(clamp(varDef(e, v), x));
  if (st[v] !== nx) {
    st[v] = nx;
    e.touch();
  }
}

/** Теги действия, которое сейчас выполняет владелец. */
export function activeTags(e: Engine, ref: Ref): string[] {
  const t = e.onceTags.get(ref);
  if (t) return t;
  const c = e.charOf(ref);
  if (c && c.assignment.kind === "action") return e.idx.actions.get(c.assignment.action)?.tags ?? [];
  return [];
}

function modsFor(e: Engine, ref: Ref, v: string, applies: "value" | "change", tags: string[]): ActiveMod[] {
  return activeMods(e, ref).filter(
    (m) => m.def.var === v && !m.def.flag && (m.def.applies_to ?? "value") === applies && tagsMatch(m.def, tags),
  );
}

/** Итоговое значение: (сырое + Σadd) × (1 + Σpct/100) × Πmult, затем min/max. */
export function finalValue(e: Engine, ref: Ref, v: string, tags?: string[]): number {
  const tg = tags ?? activeTags(e, ref);
  const key = `val|${ref}|${v}|${tg.join(",")}`;
  const c = e.cache.get(key);
  if (c !== undefined) return c;
  const raw = rawOf(e, ref, v);
  const def = varDef(e, v);
  if (e.computing.has(key)) return clamp(def, raw); // цикл в данных пака
  e.computing.add(key);
  try {
    let add = 0, pct = 0, mult = 1;
    for (const m of modsFor(e, ref, v, "value", tg)) {
      const mag = modMagnitude(e, m);
      const op = m.def.op ?? "add";
      if (op === "add") add += mag;
      else if (op === "pct") pct += mag;
      else if (op === "mult") mult *= mag;
    }
    const res = norm(clamp(def, (raw + add) * (1 + pct / 100) * mult));
    e.cache.set(key, res);
    return res;
  } finally {
    e.computing.delete(key);
  }
}

/**
 * Изменение сырого значения на d через модификаторы изменений (core.md 3.2).
 * Возвращает фактическое изменение сырого значения.
 */
export function changeVar(e: Engine, ref: Ref, v: string, d: number, opts: { tags?: string[]; source?: string } = {}): number {
  if (!d || !Number.isFinite(d)) return 0;
  const tg = opts.tags ?? activeTags(e, ref);
  let add = 0, pct = 0, mult = 1;
  for (const m of modsFor(e, ref, v, "change", tg)) {
    const dir = m.def.direction ?? "any";
    if (dir === "gain" && d <= 0) continue;
    if (dir === "loss" && d >= 0) continue;
    const mag = modMagnitude(e, m);
    const op = m.def.op ?? "add";
    if (op === "add") add += mag;
    else if (op === "pct") pct += mag;
    else if (op === "mult") mult *= mag;
  }
  let d2 = (d + add) * (1 + pct / 100) * mult;
  if (Math.sign(d2) !== 0 && Math.sign(d2) !== Math.sign(d)) d2 = 0;
  const before = rawOf(e, ref, v);
  setRaw(e, ref, v, before + d2);
  const delta = norm(rawOf(e, ref, v) - before);
  if (v === "money" && ref === WORLD && delta !== 0) {
    e.s.ledger.push({ source: opts.source ?? "event:unknown", amount: delta });
  }
  return delta;
}

/** Номер текущей ступени лестницы (уровень) или null, если лестницы нет. */
export function ladderStepIndex(e: Engine, ref: Ref, v: string): number | null {
  const def = varDef(e, v);
  if (!def?.ladder || !def.ladder.length) return null;
  const val = finalValue(e, ref, v);
  let idx = 0;
  for (let i = 0; i < def.ladder.length; i++) if (def.ladder[i].at <= val + 1e-9) idx = i;
  return idx;
}

export function stepName(e: Engine, ref: Ref, v: string): string | null {
  const i = ladderStepIndex(e, ref, v);
  if (i === null) return null;
  return varDef(e, v)!.ladder![i].name;
}

/** Причины недееспособности персонажа. */
export function incapReasons(e: Engine, ref: Ref): { floor: boolean; mods: ActiveMod[] } {
  const res = { floor: false, mods: [] as ActiveMod[] };
  if (refKind(ref) !== "character") return res;
  for (const m of activeMods(e, ref)) if (m.def.incapacitates) res.mods.push(m);
  for (const v of e.idx.varsByOwner.character ?? []) {
    if (typeof v.floor_pct !== "number") continue;
    const raw = rawOf(e, ref, v.id);
    if (finalValue(e, ref, v.id) < raw * v.floor_pct / 100 - 1e-9) res.floor = true;
  }
  return res;
}

export function isIncap(e: Engine, ref: Ref): boolean {
  const key = `incap|${ref}`;
  const c = e.cache.get(key);
  if (c !== undefined) return c;
  const r = incapReasons(e, ref);
  const res = r.floor || r.mods.length > 0;
  e.cache.set(key, res);
  return res;
}

export function isIncapPermanent(e: Engine, ref: Ref): boolean {
  const r = incapReasons(e, ref);
  if (r.floor || r.mods.length === 0) return false;
  return r.mods.every((m) => m.stored && m.stored.kind === "forever");
}

/** Точное изменение сырого значения мимо модификаторов изменений (расход, цены). */
export function addExact(e: Engine, ref: Ref, v: string, d: number, source: string): number {
  if (!d) return 0;
  const before = rawOf(e, ref, v);
  setRaw(e, ref, v, before + d);
  const delta = norm(rawOf(e, ref, v) - before);
  if (v === "money" && ref === WORLD && delta) e.s.ledger.push({ source, amount: delta });
  return delta;
}
