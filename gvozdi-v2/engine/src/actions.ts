// Действия и производство (core.md 3.4): доступность, разовые действия, назначения, партии, брак, торговля.

import type { Engine } from "./engine.ts";
import type { ActionDef, CostLine, ErrorCode, RoleDef } from "./types.ts";
import type { CharState, Ref } from "./state.ts";
import { charRef, refId } from "./state.ts";
import { evalCond, failText, resolveData } from "./conditions.ts";
import { costLines, firstShort, payCost, resolveCost, shortReason } from "./costs.ts";
import { applyEffects } from "./effects.ts";
import { emit, settle, textVars } from "./events.ts";
import { addGoods, traderDeal } from "./market.ts";
import { changeVar, finalValue, isIncap, resolveSubject, type Ctx } from "./vars.ts";
import { capacity, charRole, workerCount, worksFlag } from "./workforce.ts";
import { actionPlacement, replaceInfo } from "./equipment.ts";

export interface CmdError {
  code: ErrorCode;
  text: string;
}

/** Действие существует для игрока: open_when и, если ставит оборудование, ему есть место (core.md 3.4 п.1, 3.7). */
export function actionOpen(e: Engine, a: ActionDef, actor?: Ref | null): boolean {
  const ref = actor ?? e.heroRef;
  if (!evalCond(e, a.open_when ?? null, { self: ref, actor: ref })) return false;
  const pl = actionPlacement(e, a, ref);
  return !pl || pl.pl.kind !== "blocked";
}

/** Подходит ли персонаж под роль (без учёта недееспособности). */
export function whoOk(e: Engine, role: RoleDef | null | undefined, id: string): boolean {
  if (!role) return false;
  const who = role.who ?? "any";
  const ref = charRef(id);
  if (who === "pool") {
    if (!e.s.pool.includes(id)) return false;
    const d = e.idx.chars.get(id);
    if (d?.visible !== undefined && d.visible !== null && !evalCond(e, d.visible, { self: ref })) return false;
  } else {
    const c = e.char(id);
    if (!c) return false;
    if (who === "hero" && c.kind !== "hero") return false;
    if (who === "worker" && !(c.kind === "worker" && worksFlag(e, c))) return false;
    if (who === "hero_or_worker" && !(c.kind === "hero" || (c.kind === "worker" && worksFlag(e, c)))) return false;
  }
  return evalCond(e, role.where ?? null, { self: ref });
}

function roleList(e: Engine, role: RoleDef | null | undefined, includeIncap: boolean): string[] {
  if (!role) return [];
  const ids = role.who === "pool" ? e.s.pool.slice() : e.s.chars.map((c) => c.id);
  return ids.filter((id) => whoOk(e, role, id) && (includeIncap || role.who === "pool" || !isIncap(e, charRef(id))));
}

export function actionHours(e: Engine, a: ActionDef, actor: Ref | null): number {
  if (!a.speed_scaled || !actor) return a.hours;
  const sp = finalValue(e, actor, "speed", a.tags ?? []);
  if (sp <= 0) return Infinity;
  return Math.max(1, Math.ceil(a.hours / sp - 1e-9));
}

function hasHire(a: ActionDef): boolean {
  return (a.effects ?? []).some((x) => x.type === "hire");
}

export function onceCtx(a: ActionDef, actor: string, partner?: string | null, candidate?: string | null, replace?: string | null): Ctx {
  return {
    replace: replace ?? null,
    actor: charRef(actor),
    self: charRef(actor),
    partner: partner ? charRef(partner) : null,
    candidate: candidate ? charRef(candidate) : null,
    action: a.id,
    source: `action:${a.id}`,
    data: { action: a.id },
  };
}

/** Проверка разового действия с конкретными участниками (core.md 3.4). */
export function checkOnce(
  e: Engine, a: ActionDef | undefined, actor: string | undefined, partner?: string | null, candidate?: string | null,
  replace?: string | null,
): CmdError | null {
  if (!a || !actor) return { code: "invalid", text: e.text("reason_invalid") };
  if (a.mode !== "once" && a.mode !== "both") return { code: "invalid", text: e.text("reason_invalid") };
  if (!actionOpen(e, a, charRef(actor)) || !actionOpen(e, a)) return { code: "not_available", text: e.text("reason_not_available") };
  // участники: состав ролей
  if (!whoOk(e, a.roles.actor, actor)) return { code: "invalid", text: e.text("reason_invalid") };
  if (a.roles.partner) {
    if (!partner || partner === actor || !whoOk(e, a.roles.partner, partner)) return { code: "invalid", text: e.text("reason_invalid") };
  } else if (partner) return { code: "invalid", text: e.text("reason_invalid") };
  if (a.roles.candidate) {
    if (!candidate || !whoOk(e, a.roles.candidate, candidate)) return { code: "invalid", text: e.text("reason_invalid") };
  } else if (candidate) return { code: "invalid", text: e.text("reason_invalid") };
  const ctx = onceCtx(a, actor, partner, candidate);
  // 2. enabled_when
  if (!evalCond(e, a.enabled_when ?? null, ctx)) {
    return { code: "requirement_unmet", text: failText(e, a.enabled_when, ctx) ?? a.disabled_text ?? e.text("reason_not_available") };
  }
  // замена оборудования другой линейки (core.md 3.7, случай 4)
  const pl = actionPlacement(e, a, charRef(actor));
  if (pl && pl.pl.kind === "replace") {
    const info = replaceInfo(e, pl.type, pl.pl.options);
    if (!replace) return { code: "requirement_unmet", text: info.warning };
    if (!pl.pl.options.some((o) => o.id === replace)) return { code: "invalid", text: e.text("reason_invalid") };
  }
  if (hasHire(a) && workerCount(e) >= capacity(e)) {
    return { code: "requirement_unmet", text: e.text("reason_workers_full", { name: candidate ? e.nameOf(charRef(candidate)) : "" }) };
  }
  // 3. расход
  const short = firstShort(e, resolveCost(e, a.cost, ctx));
  if (short) return { code: "insufficient", text: shortReason(e, short) };
  // 4. участники дееспособны
  for (const id of [actor, partner]) {
    if (id && isIncap(e, charRef(id))) return { code: "incapacitated", text: e.text("reason_incapacitated", { name: e.nameOf(charRef(id)) }) };
  }
  // 5. время
  if (e.isNight) return { code: "no_time", text: e.text("reason_night") };
  if (e.s.hour + actionHours(e, a, charRef(actor)) > e.settings.day_end) return { code: "no_time", text: e.text("reason_no_time") };
  return null;
}

export interface ActionStatus {
  enabled: boolean;
  reason: string | null;
  cost: CostLine[];
  hours: number;
  roles: { actor: string[]; partner: string[] | null; candidate: string[] | null };
  replace: null | { warning: string; options: { item: string; name: string }[] };
}

/** Статус действия для вида: есть ли хоть один допустимый состав участников. */
export function actionStatus(e: Engine, a: ActionDef): ActionStatus {
  const roles = {
    actor: roleList(e, a.roles.actor, false),
    partner: a.roles.partner ? roleList(e, a.roles.partner, false) : null,
    candidate: a.roles.candidate ? roleList(e, a.roles.candidate, false) : null,
  };
  const allActors = roleList(e, a.roles.actor, true);
  const primaryActor = allActors.includes(e.heroId) ? e.heroId : (roles.actor[0] ?? allActors[0]);
  const primaryPartner = roles.partner ? (roles.partner.find((p) => p !== primaryActor) ?? null) : null;
  const primaryCand = roles.candidate ? (roles.candidate[0] ?? null) : null;
  const ctx = primaryActor ? onceCtx(a, primaryActor, primaryPartner, primaryCand) : { actor: e.heroRef, self: e.heroRef };
  const cost = costLines(e, resolveCost(e, a.cost, ctx));
  const hours = actionHours(e, a, primaryActor ? charRef(primaryActor) : null);
  const pl = actionPlacement(e, a, primaryActor ? charRef(primaryActor) : e.heroRef);
  const replace = pl && pl.pl.kind === "replace" ? replaceInfo(e, pl.type, pl.pl.options) : null;
  // для перебора составов замена считается выбранной: серым действие из-за неё не становится
  const anyReplace = replace ? replace.options[0].item : null;
  if (a.mode === "assignable") {
    const ok = e.s.chars.some((c) => assignError(e, c, a) === null);
    return { enabled: ok, reason: ok ? null : e.text("reason_not_available"), cost, hours, roles, replace };
  }
  // перебор составов
  let tries = 0;
  for (const ac of roles.actor) {
    for (const pa of roles.partner ?? [null]) {
      if (pa !== null && pa === ac) continue;
      for (const ca of roles.candidate ?? [null]) {
        if (++tries > 400) break;
        if (checkOnce(e, a, ac, pa, ca, anyReplace) === null) {
          return { enabled: true, reason: null, cost: costLines(e, resolveCost(e, a.cost, onceCtx(a, ac, pa, ca))), hours: actionHours(e, a, charRef(ac)), roles, replace };
        }
      }
    }
  }
  let reason: string | null = null;
  if (!primaryActor) reason = e.text("reason_not_available");
  else {
    if ((a.roles.partner && !primaryPartner) || (a.roles.candidate && !primaryCand)) {
      // нет участника: сначала понятные причины (условие, расход), потом «недоступно»
      const r = evalCond(e, a.enabled_when ?? null, ctx) ? null : (failText(e, a.enabled_when, ctx) ?? a.disabled_text ?? null);
      reason = r ?? e.text("reason_not_available");
    } else {
      reason = checkOnce(e, a, primaryActor, primaryPartner, primaryCand, anyReplace)?.text ?? e.text("reason_not_available");
    }
  }
  return { enabled: false, reason, cost, hours, roles, replace };
}

// ---------- назначения ----------

export function tradeAllowed(e: Engine, c: CharState): boolean {
  if (!worksFlag(e, c)) return false;
  const cond = e.settings.trade_open_when;
  if (cond === undefined || cond === null) return c.kind === "worker";
  return evalCond(e, cond, { self: charRef(c.id), actor: charRef(c.id) });
}

/** Можно ли поручить персонажу действие. null — можно. */
export function assignError(e: Engine, c: CharState, a: ActionDef | undefined): CmdError | null {
  if (!a || (a.mode !== "assignable" && a.mode !== "both")) return { code: "invalid", text: e.text("reason_invalid") };
  if (!worksFlag(e, c) && c.kind !== "hero") return { code: "invalid", text: e.text("reason_invalid") };
  const ref = charRef(c.id);
  if (!actionOpen(e, a, ref) || !actionOpen(e, a)) return { code: "not_available", text: e.text("reason_not_available") };
  if (!whoOk(e, a.roles.actor, c.id)) return { code: "not_available", text: e.text("reason_not_available") };
  const ctx: Ctx = { actor: ref, self: ref, action: a.id, data: { action: a.id } };
  if (!evalCond(e, a.enabled_when ?? null, ctx)) {
    return { code: "requirement_unmet", text: failText(e, a.enabled_when, ctx) ?? a.disabled_text ?? e.text("reason_not_available") };
  }
  return null;
}

export function applyPerHour(e: Engine, a: ActionDef, ctx: Ctx): void {
  const tags = a.tags ?? [];
  for (const ph of a.per_hour ?? []) {
    const add = resolveData(e, ph.add, ctx);
    if (typeof add !== "number") continue;
    const scale = ph.scale_by && ctx.actor ? finalValue(e, ctx.actor, ph.scale_by, tags) : 1;
    const t = resolveSubject(e, ph.target ?? "actor", ctx);
    if (!t || !e.exists(t)) continue;
    changeVar(e, t, ph.var, add * scale, { tags: e.charOf(t) ? tags : undefined, source: `action:${a.id}` });
  }
}

/** Завершение партии/разового действия: брак, выходы, эффекты, сигнал. */
export function completeAction(e: Engine, a: ActionDef, ctx: Ctx): boolean {
  const actor = ctx.actor!;
  const worker = e.nameOf(actor);
  const outs = a.outputs ?? [];
  if (outs.length) {
    const defect = finalValue(e, actor, "defect", a.tags ?? []);
    if (e.rand() < defect) {
      const item = e.idx.goods.get(outs[0].good)?.name ?? outs[0].good;
      e.pushLine(e.text("log_batch_defect", { worker, item }), "warn");
      emit(e, "batch_defect", { action: a.id, actor: refId(actor) });
      return false;
    }
    for (const o of outs) {
      const q = resolveData(e, o.qty, ctx);
      if (typeof q !== "number" || q <= 0) continue;
      addGoods(e, o.good, q);
      e.pushLine(e.text("log_batch_done", { worker, item: e.idx.goods.get(o.good)?.name ?? o.good, qty: q }), "info");
    }
  }
  applyEffects(e, a.effects ?? [], ctx);
  emit(e, "action_done", { action: a.id, actor: refId(actor), partner: ctx.partner ? refId(ctx.partner) : null });
  return true;
}

function tryStartBatch(e: Engine, c: CharState, a: ActionDef, ctx: Ctx): boolean {
  const items = resolveCost(e, a.cost, ctx);
  if (firstShort(e, items)) {
    if (!e.idleSignaled.has(c.id)) {
      e.idleSignaled.add(c.id);
      emit(e, "idle_no_cost", { action: a.id, actor: c.id });
    }
    return false;
  }
  payCost(e, items, `action:${a.id}`);
  c.batch = true;
  e.touch();
  return true;
}

/** Рабочий час по назначению. */
function workHour(e: Engine, c: CharState): void {
  const ref = charRef(c.id);
  if (c.assignment.kind === "trade") {
    if (!tradeAllowed(e, c)) return;
    c.tradeProgress += 1;
    const th = Math.max(1, e.settings.trade_hours ?? 1);
    if (c.tradeProgress >= th) {
      c.tradeProgress -= th;
      traderDeal(e, c.id);
    }
    e.touch();
    return;
  }
  if (c.assignment.kind !== "action") return;
  const a = e.idx.actions.get(c.assignment.action);
  if (!a || assignError(e, c, a)) return;
  const ctx: Ctx = { actor: ref, self: ref, action: a.id, source: `action:${a.id}`, data: { action: a.id } };
  if (!c.batch) {
    c.progress = 0;
    if (!tryStartBatch(e, c, a, ctx)) return;
  }
  applyPerHour(e, a, ctx);
  const tags = a.tags ?? [];
  const speed = a.speed_scaled ? finalValue(e, ref, "speed", tags) : 1;
  const rate = speed / Math.max(a.hours, 1e-9);
  c.progress += rate;
  let guard = 0;
  while (c.progress >= 1 - 1e-9 && guard++ < 1000) {
    c.progress = Math.max(0, c.progress - 1);
    c.batch = false;
    completeAction(e, a, ctx);
    if (e.s.ending) return;
    if (c.progress > 1e-9) {
      if (!tryStartBatch(e, c, a, ctx)) { c.progress = 0; break; }
    }
  }
  e.touch();
}

export interface OnceRun {
  a: ActionDef;
  ctx: Ctx;
}

/** Один час игры: разовое действие (если идёт), работа по назначениям, проверки. */
export function hourStep(e: Engine, once: OnceRun | null): void {
  if (once) applyPerHour(e, once.a, once.ctx);
  for (const c of [...e.s.chars]) {
    if (e.s.ending) break;
    if (!e.char(c.id)) continue;
    if (e.busy.has(c.id)) continue;
    if (c.assignment.kind === "idle") continue;
    if (isIncap(e, charRef(c.id))) continue;
    workHour(e, c);
  }
  e.s.hour += 1;
  e.touch();
  settle(e);
}

/** Выполнить разовое действие (проверка — заранее). */
export function runOnce(e: Engine, a: ActionDef, actor: string, partner?: string | null, candidate?: string | null, replace?: string | null): void {
  const ctx = onceCtx(a, actor, partner, candidate, replace);
  const hours = actionHours(e, a, charRef(actor));
  payCost(e, resolveCost(e, a.cost, ctx), `action:${a.id}`);
  const parts = [actor, partner].filter((x): x is string => !!x);
  for (const p of parts) {
    e.busy.add(p);
    e.onceTags.set(charRef(p), a.tags ?? []);
  }
  e.touch();
  try {
    for (let h = 0; h < hours; h++) {
      hourStep(e, { a, ctx });
      if (e.s.ending) return;
    }
  } finally {
    for (const p of parts) {
      e.busy.delete(p);
      e.onceTags.delete(charRef(p));
    }
    e.touch();
  }
  const ok = completeAction(e, a, ctx);
  if (ok && a.text) e.pushLine(e.fill(a.text, textVars(e, ctx)), "info");
  settle(e);
}

export function roleOf(e: Engine, c: CharState): string {
  return charRole(e, c);
}
