// Обычный вид (core.md 5.3): только видимое игроку. И отладочный вид (core.md 6): всё.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type {
  CandidateView, CategoryView, CharacterView, DebugEntity, DebugView, EffectView, StockLine, VarView, View, WorkshopView,
} from "./types.ts";
import type { CharState, Ref } from "./state.ts";
import { WORLD, charRef, itemRef, refId, refKind, wsRef } from "./state.ts";
import { evalCond, traceCond } from "./conditions.ts";
import { activeMods, allRefs, effectView, modVisible, visibleEffects } from "./modifiers.ts";
import { finalValue, isIncap, isIncapPermanent, ladderStepIndex, rawOf, stepName } from "./vars.ts";
import { actionOpen, actionStatus, assignError, onceCtx, tradeAllowed, whoOk } from "./actions.ts";
import { buyUnitPrice, goodVisible, itemPrice, rawGoods, shopOpen } from "./market.ts";
import { offerCtx, offerView, obligationView, optionStatus } from "./offers.ts";
import { equipmentOf, inventory, worksFlag, charRole } from "./workforce.ts";
import { calcValue, CALC_NAMES, stockValue } from "./calc.ts";

/** Число для строки: до 2 знаков после запятой, десятичный разделитель — запятая. */
export function fmtDisplayNum(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  let r = Math.round(x * 100) / 100;
  if (Object.is(r, -0)) r = 0;
  return String(r).replace(".", ",");
}

/** Готовая строка значения по format (core.md 4.3). */
export function displayValue(e: Engine, format: string, x: number): string {
  if (format === "pct") return `${fmtDisplayNum(x * 100)}%`;
  if (format === "money") {
    const short = e.idx.raw.pack.names?.money_short ?? "";
    return short ? `${fmtDisplayNum(x)} ${short}` : fmtDisplayNum(x);
  }
  return fmtDisplayNum(x);
}

function varViews(e: Engine, ref: Ref): VarView[] {
  const type = refKind(ref);
  const out: VarView[] = [];
  for (const v of e.idx.varsByOwner[type] ?? []) {
    if (!evalCond(e, v.visible ?? null, { self: ref })) continue;
    const lvl = ladderStepIndex(e, ref, v.id);
    const value = round6(finalValue(e, ref, v.id));
    out.push({
      id: v.id, name: v.name, value, display: displayValue(e, v.format ?? "number", value), format: v.format ?? "number",
      level: lvl, step: lvl === null ? null : v.ladder![lvl].name,
    });
  }
  return out;
}

export function charVisible(e: Engine, id: string): boolean {
  const d = e.idx.chars.get(e.char(id)?.tpl ?? id);
  return evalCond(e, d?.visible ?? null, { self: charRef(id) });
}

function assignmentLabel(e: Engine, c: CharState): { kind: "idle" | "action" | "trade"; label: string } {
  if (c.assignment.kind === "action") return { kind: "action", label: e.idx.actions.get(c.assignment.action)?.name ?? c.assignment.action };
  if (c.assignment.kind === "trade") return { kind: "trade", label: e.text("assign_trade") };
  return { kind: "idle", label: e.text("assign_idle") };
}

function assignables(e: Engine, c: CharState): CharacterView["assignable"] {
  if (!worksFlag(e, c) && c.kind !== "hero") return [];
  const out: CharacterView["assignable"] = [{ assignment: { kind: "idle" }, label: e.text("assign_idle"), enabled: true, reason: null }];
  for (const a of e.idx.actions.values()) {
    if (a.mode !== "assignable" && a.mode !== "both") continue;
    if (!actionOpen(e, a, charRef(c.id)) || !actionOpen(e, a) || !whoOk(e, a.roles.actor, c.id)) continue;
    const err = assignError(e, c, a);
    out.push({ assignment: { kind: "action", action: a.id }, label: a.name, enabled: err === null, reason: err?.text ?? null });
  }
  if (tradeAllowed(e, c)) out.push({ assignment: { kind: "trade" }, label: e.text("assign_trade"), enabled: true, reason: null });
  return out;
}

export function roleName(e: Engine, tplId: string, role: string): string | null {
  const d = e.idx.chars.get(tplId);
  if (d?.role_name) return d.role_name;
  return e.idx.raw.pack.names?.roles?.[role] ?? null;
}

/** Экземпляры инвентаря, которые можно надеть персонажу. */
function equippable(e: Engine, c: CharState): string[] {
  return inventory(e)
    .filter((it) => {
      const d = e.idx.items.get(it.type);
      return d?.kind === "tool" && !!d.slot && d.slot in c.slots;
    })
    .map((it) => it.id);
}

function charView(e: Engine, c: CharState): CharacterView {
  const ref = charRef(c.id);
  const d = e.idx.chars.get(c.tpl);
  const incap = isIncap(e, ref);
  return {
    id: c.id,
    name: d?.name ?? c.id,
    role: charRole(e, c),
    role_name: roleName(e, c.tpl, charRole(e, c)),
    works: worksFlag(e, c),
    blurb: d?.blurb ?? null,
    status: incap ? "incapacitated" : "ok",
    incapacitated_permanent: incap && isIncapPermanent(e, ref),
    workshop: c.kind === "hero" ? null : c.workshop,
    vars: varViews(e, ref),
    slots: c.slotOrder.map((sl) => {
      const it = c.slots[sl] ? e.item(c.slots[sl]!) : undefined;
      return { slot: sl, slot_name: e.idx.raw.pack.names?.slots?.[sl] ?? sl, item: it?.id ?? null, name: it ? (e.idx.items.get(it.type)?.name ?? it.type) : null };
    }),
    equippable: equippable(e, c),
    assignment: assignmentLabel(e, c),
    assignable: assignables(e, c),
    effects: visibleEffects(e, ref),
  };
}

function candidateView(e: Engine, id: string): CandidateView {
  const ref = charRef(id);
  const d = e.idx.chars.get(id)!;
  const effects: EffectView[] = [];
  for (const mid of d.modifiers ?? []) {
    const def = e.idx.mods.get(mid);
    if (!def) continue;
    const am = { uid: `tpl:${id}:${mid}`, def, owner: ref, stored: null, source: null, data: { ...(def.data_defaults ?? {}) } };
    if (modVisible(e, am)) effects.push(effectView(e, am));
  }
  return { id, name: d.name, role_name: roleName(e, id, d.role), blurb: d.blurb ?? null, vars: varViews(e, ref), effects };
}

function itemTemplateEffects(e: Engine, type: string): EffectView[] {
  const d = e.idx.items.get(type);
  const out: EffectView[] = [];
  for (const mid of d?.modifiers ?? []) {
    const def = e.idx.mods.get(mid);
    if (!def) continue;
    const am = { uid: `tpl:${type}:${mid}`, def, owner: e.heroRef, stored: null, source: null, data: { ...(def.data_defaults ?? {}) } };
    if (!modVisible(e, am)) continue;
    out.push(effectView(e, am));
  }
  return out;
}

export function buildView(e: Engine): View {
  const st = e.settings;
  const names = e.idx.raw.pack.names ?? {};
  const hero = e.heroRef;
  // стресс героя
  let stress: View["stress"] = null;
  const sdef = e.idx.vars.get("stress");
  if (sdef && evalCond(e, sdef.visible ?? null, { self: hero })) {
    const lvl = ladderStepIndex(e, hero, "stress");
    stress = {
      name: names.stress ?? sdef.name,
      value: norm(finalValue(e, hero, "stress")),
      max: typeof sdef.max === "number" ? sdef.max : null,
      step: stepName(e, hero, "stress"),
      warning: lvl !== null && lvl > 0,
    };
  }
  const actions = [];
  for (const a of e.idx.actions.values()) {
    if (!actionOpen(e, a)) continue;
    const s = actionStatus(e, a);
    actions.push({ id: a.id, label: a.name, description: a.description ?? null, category: a.category ?? null, hours: s.hours, mode: a.mode, enabled: s.enabled, reason: s.reason, cost: s.cost, roles: s.roles, replace: s.replace });
  }
  const openCats = new Set(actions.map((a) => a.category));
  const categories: CategoryView[] = e.idx.categories
    .filter((c) => openCats.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, view: c.view === "select" ? "select" : "list" }));
  const characters: CharacterView[] = [];
  for (const c of e.s.chars) if (charVisible(e, c.id)) characters.push(charView(e, c));
  const hire_pool: CandidateView[] = [];
  for (const id of e.s.pool) if (e.idx.chars.has(id) && charVisible(e, id)) hire_pool.push(candidateView(e, id));
  const workshops: WorkshopView[] = e.s.workshops
    .filter((w) => evalCond(e, e.idx.workshops.get(w.type)?.visible ?? null, { self: wsRef(w.id) }))
    .map((w) => ({
      id: w.id,
      type: w.type,
      name: e.idx.workshops.get(w.type)?.name ?? w.type,
      vars: varViews(e, wsRef(w.id)),
      equipment: equipmentOf(e, w.id).map((it) => ({ item: it.id, name: e.idx.items.get(it.type)?.name ?? it.type })),
      workers: e.s.chars.filter((c) => c.kind !== "hero" && c.workshop === w.id && charVisible(e, c.id)).map((c) => c.id),
      effects: visibleEffects(e, wsRef(w.id)),
    }));
  const goods: StockLine[] = [];
  for (const g of e.idx.goods.values()) {
    if (!e.s.seenGoods.includes(g.id) || !goodVisible(e, g.id)) continue;
    goods.push({
      id: g.id, name: g.name, unit: g.unit ?? "", qty: norm(e.s.stock[g.id] ?? 0), unit_value: norm(g.price),
      sell_flag: e.s.sellFlags[g.id] ?? !!g.sell_default,
    });
  }
  // рынок
  let mReason: string | null = null;
  if (e.isNight) mReason = e.text("reason_night");
  else if (isIncap(e, hero)) mReason = e.text("reason_incapacitated", { name: e.nameOf(hero) });
  else if (e.s.hour + (st.market_hours ?? 1) > st.day_end) mReason = e.text("reason_no_time");
  const money = norm(finalValue(e, WORLD, "money"));
  const shop = shopOpen(e).map((id) => {
    const price = norm(itemPrice(e, id, hero));
    const ok = money >= price - 1e-9;
    return {
      item_type: id, name: e.idx.items.get(id)!.name, price, enabled: ok,
      disabled_reason: ok ? null : e.text("reason_cost", { name: names.money ?? e.idx.vars.get("money")?.name ?? "", need: price, have: money }),
    };
  });
  return {
    meta: { day: e.s.day, hour: e.s.hour, day_start: st.day_start, day_end: st.day_end, is_night: e.isNight, game_title: e.idx.raw.pack.name,
      pack_id: e.idx.raw.pack.id, pack_version: e.idx.raw.pack.version,
      pack_description: typeof e.idx.raw.pack.description === "string" ? e.idx.raw.pack.description : null },
    money: { name: names.money ?? e.idx.vars.get("money")?.name ?? "", short: names.money_short ?? "", value: money },
    stress,
    notifications: e.s.notifications.map((l) => ({ ...l })),
    summary: e.s.summary ? JSON.parse(JSON.stringify(e.s.summary)) : null,
    pending_offer: e.s.nowQueue[0] ? offerView(e, e.s.nowQueue[0]) : null,
    actions,
    categories,
    characters,
    hire_pool,
    workshops,
    storage: { goods, total_value: norm(stockValue(e)) },
    inventory: inventory(e).map((it) => ({ item: it.id, type: it.type, name: e.idx.items.get(it.type)?.name ?? it.type, effects: itemTemplateEffects(e, it.type) })),
    market: {
      enabled: mReason === null,
      disabled_reason: mReason,
      hours: st.market_hours ?? 1,
      raw: rawGoods(e).map((id) => ({ id, name: e.idx.goods.get(id)!.name, unit_price: norm(buyUnitPrice(e, e.idx.goods.get(id)!.price, hero)) })),
      shop,
    },
    board: e.s.board.map((o) => offerView(e, o)),
    obligations: e.s.obligations.filter((o) => o.state === "active").map((o) => obligationView(e, o)),
    effects: visibleEffects(e, WORLD),
    ending: e.s.ending ? { ...e.s.ending } : null,
  };
}

// ---------- отладочный вид ----------

export function buildDebugView(e: Engine): DebugView {
  const entities: DebugEntity[] = allRefs(e).map((ref) => {
    const type = refKind(ref);
    const vars = (e.idx.varsByOwner[type] ?? []).map((v) => {
      const lvl = ladderStepIndex(e, ref, v.id);
      return { id: v.id, raw: rawOf(e, ref, v.id), value: finalValue(e, ref, v.id), level: lvl, step: lvl === null ? null : v.ladder![lvl].id };
    });
    const modifiers = activeMods(e, ref).map((m) => ({
      uid: m.uid,
      template: m.def.id,
      owner: ref,
      stored: !!m.stored,
      source: m.source,
      days_left: m.stored?.kind === "days" ? m.stored.days : null,
      duration: m.stored ? m.stored.kind : "source",
      data: { ...m.data },
      visible: modVisible(e, m),
    }));
    const extra: Record<string, unknown> = {};
    const c = e.charOf(ref);
    if (c) Object.assign(extra, {
      kind: c.kind, workshop: c.workshop, slots: { ...c.slots }, assignment: c.assignment, progress: c.progress, batch: c.batch,
      trade_progress: c.tradeProgress, incapacitated: isIncap(e, ref), incapacitated_permanent: isIncapPermanent(e, ref),
      visible: charVisible(e, c.id),
    });
    if (type === "item") { const it = e.item(refId(ref)); if (it) extra.loc = it.loc; }
    if (type === "workshop") extra.equipment = equipmentOf(e, refId(ref)).map((i) => i.id);
    return { ref, id: refId(ref), kind: type, type: e.typeOf(ref), vars, modifiers, extra };
  });
  const actions = [...e.idx.actions.values()].map((a) => {
    const open = actionOpen(e, a);
    const s = actionStatus(e, a);
    const actor = s.roles.actor[0] ?? e.heroId;
    return {
      id: a.id,
      open,
      open_trace: traceCond(e, a.open_when ?? null, { self: e.heroRef, actor: e.heroRef }),
      enabled_trace: traceCond(e, a.enabled_when ?? null, onceCtx(a, actor, s.roles.partner?.[0] ?? null, s.roles.candidate?.[0] ?? null)),
      available: open && s.enabled,
      reason: s.reason,
    };
  });
  const offers = [...e.s.nowQueue, ...e.s.board].map((o) => {
    const def = o.tpl ? e.idx.offers.get(o.tpl) : null;
    const ctx = offerCtx(o, e);
    return {
      id: o.id, template: o.tpl ?? "(popup)", delivery: o.delivery, participant: o.participant, data: { ...o.data }, days_left: o.days_left,
      options: (def?.options ?? []).map((opt) => {
        const st = optionStatus(e, o, opt);
        return {
          id: opt.id, open: st.open, open_trace: traceCond(e, opt.open_when ?? null, ctx),
          enabled_trace: traceCond(e, opt.enabled_when ?? null, ctx), enabled: st.enabled, reason: st.reason,
        };
      }),
    };
  });
  const calc: Record<string, number | null> = {};
  for (const n of CALC_NAMES) {
    const v = calcValue(e, n, null);
    calc[n] = Number.isFinite(v) ? v : null;
  }
  const stock: Record<string, { qty: number; sell_flag: boolean }> = {};
  for (const g of e.idx.goods.keys()) stock[g] = { qty: e.s.stock[g] ?? 0, sell_flag: e.s.sellFlags[g] ?? !!e.idx.goods.get(g)!.sell_default };
  return {
    time: { day: e.s.day, hour: e.s.hour },
    ending: e.s.ending ? { ...e.s.ending } : null,
    entities,
    hire_pool: [...e.s.pool],
    stock,
    calc,
    actions,
    offers,
    obligations: e.s.obligations.map((o) => ({
      id: o.id, template: o.tpl, state: o.state, created_day: o.created_day,
      deadline_day: o.deadline === null ? null : o.created_day + o.deadline, data: { ...o.data },
    })),
    event_counts: { ...e.s.eventCounts },
    event_last_day: { ...e.s.eventLastDay },
    opened: { ...e.s.opened },
    fired: { ...e.s.fired },
    endings_fired: e.s.endings.map((x) => ({ ...x })),
    errors: [...e.s.errors],
    rng_state: [...e.s.rng],
  };
}

export { itemRef };

/** Убрать шум плавающей точки в значениях для игрока (то же, что norm). */
export const round6 = norm;
