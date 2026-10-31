// Предложения и обязательства (core.md 3.13).

import type { Engine } from "./engine.ts";
import type { CostLine, OfferDef, OfferView, ObligationView, OptionDef } from "./types.ts";
import type { ObligationState, OfferState } from "./state.ts";
import { evalCond, failText, resolveData, resolveDeep } from "./conditions.ts";
import { costLines, firstShort, payCost, resolveCost, shortReason } from "./costs.ts";
import { applyEffects } from "./effects.ts";
import { emit, textVars } from "./events.ts";
import type { Ctx } from "./vars.ts";

export function showOffer(e: Engine, tplId: string, data: Record<string, any>, participant: string | null): void {
  const def = e.idx.offers.get(tplId);
  if (!def) { e.error(`show_offer: нет предложения ${tplId}`); return; }
  const merged = { ...(def.data_defaults ?? {}), ...(def.data ?? {}), ...data };
  const o: OfferState = {
    id: e.newId("of"),
    tpl: tplId,
    delivery: def.delivery === "board" ? "board" : "now",
    participant,
    data: merged,
    days_left: def.delivery === "board" ? Math.max(1, def.board_days ?? 1) : null,
  };
  if (o.delivery === "now") e.s.nowQueue.push(o);
  else e.s.board.push(o);
  e.touch();
}

export function pushPopup(e: Engine, text: string): void {
  e.s.nowQueue.push({ id: e.newId("of"), tpl: null, delivery: "now", participant: null, data: {}, days_left: null, popup: { text } });
  e.touch();
}

export function offerCtx(o: OfferState, e: Engine): Ctx {
  return { participant: o.participant, self: o.participant ?? e.heroRef, data: o.data, source: `offer:${o.tpl}` };
}

export interface OptionStatus {
  def: OptionDef;
  open: boolean;
  enabled: boolean;
  reason: string | null;
  cost: CostLine[];
}

export function optionStatus(e: Engine, o: OfferState, opt: OptionDef): OptionStatus {
  const ctx = offerCtx(o, e);
  const open = evalCond(e, opt.open_when ?? null, ctx);
  const items = resolveCost(e, opt.cost, ctx);
  const cost = costLines(e, items);
  if (!open) return { def: opt, open, enabled: false, reason: null, cost };
  if (!evalCond(e, opt.enabled_when ?? null, ctx)) {
    const reason = failText(e, opt.enabled_when, ctx) ?? opt.disabled_text ?? e.text("reason_not_available");
    return { def: opt, open, enabled: false, reason, cost };
  }
  const short = firstShort(e, items);
  if (short) return { def: opt, open, enabled: false, reason: shortReason(e, short), cost };
  return { def: opt, open, enabled: true, reason: null, cost };
}

function optionsOf(e: Engine, o: OfferState): OptionDef[] {
  if (!o.tpl) return [{ id: "ok", label: e.text("popup_ok") }];
  return e.idx.offers.get(o.tpl)?.options ?? [];
}

export function offerView(e: Engine, o: OfferState): OfferView {
  if (!o.tpl) {
    return {
      id: o.id, title: e.text("popup_title"), text: o.popup?.text ?? "", days_left: null,
      options: [{ id: "ok", label: e.text("popup_ok"), enabled: true, reason: null, cost: [] }],
    };
  }
  const def = e.idx.offers.get(o.tpl)!;
  const vars = textVars(e, offerCtx(o, e));
  const options = [];
  for (const opt of optionsOf(e, o)) {
    const st = optionStatus(e, o, opt);
    if (!st.open) continue;
    options.push({ id: opt.id, label: e.fill(opt.label, vars), enabled: st.enabled, reason: st.reason, cost: st.cost });
  }
  return { id: o.id, title: e.fill(def.title, vars), text: e.fill(def.text, vars), days_left: o.days_left, options };
}

/** Проверка выбора варианта: текст ошибки или null. */
export function checkChoose(e: Engine, offerId: string, optionId: string): { code: "invalid" | "not_available" | "requirement_unmet" | "insufficient"; text: string } | null {
  const head = e.s.nowQueue[0];
  const o = head && head.id === offerId ? head : e.s.board.find((b) => b.id === offerId);
  if (!o) return { code: "invalid", text: e.text("reason_invalid") };
  if (!o.tpl) return optionId === "ok" ? null : { code: "invalid", text: e.text("reason_invalid") };
  const opt = optionsOf(e, o).find((x) => x.id === optionId);
  if (!opt) return { code: "invalid", text: e.text("reason_invalid") };
  const st = optionStatus(e, o, opt);
  if (!st.open) return { code: "not_available", text: e.text("reason_not_available") };
  if (!st.enabled) {
    const ctx = offerCtx(o, e);
    const short = firstShort(e, resolveCost(e, opt.cost, ctx));
    return { code: short && evalCond(e, opt.enabled_when ?? null, ctx) ? "insufficient" : "requirement_unmet", text: st.reason ?? "" };
  }
  return null;
}

export function chooseOption(e: Engine, offerId: string, optionId: string): void {
  const inQueue = e.s.nowQueue.findIndex((x) => x.id === offerId);
  const o = inQueue >= 0 ? e.s.nowQueue[inQueue] : e.s.board.find((b) => b.id === offerId)!;
  // закрыть предложение
  if (inQueue >= 0) e.s.nowQueue.splice(inQueue, 1);
  else e.s.board = e.s.board.filter((b) => b.id !== offerId);
  e.touch();
  if (!o.tpl) return;
  const def = e.idx.offers.get(o.tpl)!;
  const opt = def.options.find((x) => x.id === optionId)!;
  const ctx = offerCtx(o, e);
  payCost(e, resolveCost(e, opt.cost, ctx), `offer:${o.tpl}`);
  applyEffects(e, opt.effects ?? [], ctx);
  if (opt.obligation) createObligation(e, def, opt, o, ctx);
}

function createObligation(e: Engine, def: OfferDef, opt: OptionDef, o: OfferState, ctx: Ctx): void {
  const ob = opt.obligation!;
  const data = { ...o.data, ...(resolveDeep(e, ob.data ?? {}, ctx) as Record<string, any>) };
  const octx: Ctx = { ...ctx, data };
  const requires = (ob.requires ?? []).map((l: any) => {
    const r: any = { ...l };
    if ("qty" in r) r.qty = resolveData(e, r.qty, octx);
    return r;
  });
  const dl = ob.deadline_days === undefined || ob.deadline_days === null ? null : resolveData(e, ob.deadline_days, octx);
  const st: ObligationState = {
    id: e.newId("ob"),
    tpl: ob.id,
    offer: def.id,
    option: opt.id,
    title: e.fill(ob.title ?? def.title, textVars(e, octx)),
    requires,
    deadline: typeof dl === "number" ? dl : null,
    created_day: e.s.day,
    state: "active",
    data,
    participant: o.participant,
  };
  e.s.obligations.push(st);
  e.touch();
}

function obDef(e: Engine, ob: ObligationState) {
  return e.idx.offers.get(ob.offer)?.options.find((x) => x.id === ob.option)?.obligation ?? null;
}

function obCtx(e: Engine, ob: ObligationState): Ctx {
  return { participant: ob.participant, self: ob.participant ?? e.heroRef, data: ob.data, source: `obligation:${ob.tpl}` };
}

export function obligationView(e: Engine, ob: ObligationState): ObligationView {
  const items = resolveCost(e, ob.requires, obCtx(e, ob));
  return {
    id: ob.id,
    title: ob.title,
    days_left: ob.deadline === null ? null : ob.created_day + ob.deadline - e.s.day,
    requires: costLines(e, items),
    can_deliver: firstShort(e, items) === null,
  };
}

export function checkDeliver(e: Engine, id: string): { code: "invalid" | "insufficient"; text: string } | null {
  const ob = e.s.obligations.find((o) => o.id === id && o.state === "active");
  if (!ob) return { code: "invalid", text: e.text("reason_invalid") };
  const short = firstShort(e, resolveCost(e, ob.requires, obCtx(e, ob)));
  if (short) return { code: "insufficient", text: shortReason(e, short) };
  return null;
}

export function deliver(e: Engine, id: string): void {
  const ob = e.s.obligations.find((o) => o.id === id)!;
  const ctx = obCtx(e, ob);
  payCost(e, resolveCost(e, ob.requires, ctx), `obligation:${ob.tpl}`);
  ob.state = "done";
  e.touch();
  e.pushLine(e.text("log_delivered", { obligation: ob.title }), "good");
  applyEffects(e, obDef(e, ob)?.on_done ?? [], ctx);
  emit(e, "obligation_done", { ...ob.data, obligation: ob.tpl });
}

export function decline(e: Engine, id: string): void {
  const ob = e.s.obligations.find((o) => o.id === id)!;
  ob.state = "declined";
  e.touch();
  e.pushLine(e.text("log_declined", { obligation: ob.title }), "warn");
  applyEffects(e, obDef(e, ob)?.on_decline ?? [], obCtx(e, ob));
  emit(e, "obligation_declined", { ...ob.data, obligation: ob.tpl });
}

/** Утро: исчезновение записей доски (шаг 5). */
export function expireBoard(e: Engine): void {
  const keep: OfferState[] = [];
  for (const o of e.s.board) {
    o.days_left = (o.days_left ?? 1) - 1;
    if (o.days_left <= 0) emit(e, "offer_expired", { ...o.data, offer: o.tpl });
    else keep.push(o);
  }
  e.s.board = keep;
  e.touch();
}

/** Утро: просрочка обязательств (шаг 6). */
export function checkDeadlines(e: Engine): void {
  for (const ob of e.s.obligations) {
    if (ob.state !== "active" || ob.deadline === null) continue;
    if (e.s.day > ob.created_day + ob.deadline) {
      ob.state = "failed";
      e.touch();
      const l = { text: e.text("log_failed", { obligation: ob.title }), kind: "danger" as const };
      e.lines.push(l);
      e.s.notifications.push(l);
      if (e.morningLines) e.morningLines.push(l);
      applyEffects(e, obDef(e, ob)?.on_fail ?? [], obCtx(e, ob));
      emit(e, "obligation_failed", { ...ob.data, obligation: ob.tpl });
    }
  }
}
