// Время (core.md 3.1, 3.14, 3.15, 3.16): «заняться делом», сон, утро, итог дня.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type { Line } from "./types.ts";
import { WORLD, charRef, wsRef } from "./state.ts";
import { hourStep } from "./actions.ts";
import { drain, emit, settle } from "./events.ts";
import { applyEffects } from "./effects.ts";
import { finalValue, changeVar } from "./vars.ts";
import { checkDeadlines, expireBoard } from "./offers.ts";
import { workers } from "./workforce.ts";

export interface StopInfo {
  reason: string;
  text: string;
}

/** Идти по часу до остановки. Вызывается, когда команда уже проверена (не ночь). */
export function workUntilStop(e: Engine): StopInfo {
  e.stopReq = null;
  for (let guard = 0; guard < 1000; guard++) {
    hourStep(e, null);
    if (e.s.ending) return { reason: "game_over", text: e.text("stop_game_over") };
    if (e.s.nowQueue.length) return { reason: "offer", text: e.text("stop_offer") };
    if (e.stopReq) return e.stopReq;
    if (e.isNight) return { reason: "sunset", text: e.text("stop_sunset") };
  }
  return { reason: "sunset", text: e.text("stop_sunset") };
}

function expireModifiers(e: Engine): void {
  const expired: typeof e.s.mods = [];
  for (const m of e.s.mods) {
    if (m.kind !== "days") continue;
    m.days = (m.days ?? 0) - 1;
    if (m.days <= 0) expired.push(m);
  }
  if (!expired.length) return;
  e.s.mods = e.s.mods.filter((m) => !expired.includes(m));
  e.touch();
  for (const m of expired) {
    const def = e.idx.mods.get(m.tpl);
    const data = { ...(def?.data_defaults ?? {}), ...m.data };
    applyEffects(e, def?.on_expire ?? [], { self: m.owner, participant: e.charOf(m.owner) ? m.owner : null, data, source: `event:${m.tpl}` });
    emit(e, "modifier_expired", { ...data, template: m.tpl, owner: m.owner === WORLD ? "world" : m.owner.slice(m.owner.indexOf(":") + 1) });
  }
}

function dailyExpenses(e: Engine): void {
  let total = 0;
  const pay = (amount: number, source: string) => {
    if (!amount) return;
    total += -changeVar(e, WORLD, "money", -amount, { source });
  };
  pay(finalValue(e, WORLD, "household_expense"), "household");
  for (const c of workers(e)) pay(finalValue(e, charRef(c.id), "wage"), `wage:${c.id}`);
  for (const w of e.s.workshops) pay(finalValue(e, wsRef(w.id), "upkeep"), `upkeep:${w.id}`);
  if (total) {
    const l: Line = { text: e.text("log_expenses", { total }), kind: "info" };
    e.lines.push(l);
    e.morningLines?.push(l);
  }
}

export function sourceLabel(e: Engine, source: string): string {
  const i = source.indexOf(":");
  const kind = i < 0 ? source : source.slice(0, i);
  const id = i < 0 ? "" : source.slice(i + 1);
  switch (kind) {
    case "sale": return e.text("source_sale", { name: e.nameOf(charRef(id)) });
    case "purchase": return e.text("source_purchase", { name: e.nameOf(charRef(id)) });
    case "wage": return e.text("source_wage", { name: e.nameOf(charRef(id)) });
    case "upkeep": {
      const w = e.ws(id);
      const name = w ? e.idx.workshops.get(w.type)?.name ?? id : (e.idx.workshops.get(id)?.name ?? id);
      return e.text("source_upkeep", { name });
    }
    case "household": return e.text("source_household");
    case "event": return e.text("source_event");
    case "offer": return e.text("source_offer");
    case "obligation": return e.text("source_obligation");
    case "action": return e.text("source_action");
    default: return source;
  }
}

function buildSummary(e: Engine, morning: Line[]): void {
  const agg = new Map<string, number>();
  for (const le of e.s.ledger) agg.set(le.source, norm((agg.get(le.source) ?? 0) + le.amount));
  const income = [];
  const expense = [];
  let inc = 0, exp = 0;
  for (const [source, amount] of agg) {
    if (amount > 0) { income.push({ source, label: sourceLabel(e, source), amount }); inc += amount; }
    else if (amount < 0) { expense.push({ source, label: sourceLabel(e, source), amount: -amount }); exp += -amount; }
  }
  const money = finalValue(e, WORLD, "money");
  e.s.summary = {
    title: e.text("summary_title"),
    money_morning: money,
    delta: norm(money - e.s.moneyMorning),
    income,
    expense,
    morning,
  };
  e.s.yesterday = { income: norm(inc), expense: norm(exp) };
  e.s.moneyMorning = money;
  e.s.ledger = [];
}

/** Сон: ночь, смена дня, утро (core.md 3.14). */
export function sleep(e: Engine): void {
  // 1. ночь
  emit(e, "night", {});
  settle(e);
  if (e.s.ending) return;
  // 2. новый день
  e.s.day += 1;
  e.s.hour = e.settings.day_start;
  e.s.notifications = [];
  e.morningLines = [];
  e.touch();
  try {
    // 3. сроки модификаторов
    expireModifiers(e);
    drain(e);
    // 4. расходы дня
    dailyExpenses(e);
    // 5. доска
    expireBoard(e);
    // 6. обязательства
    checkDeadlines(e);
    settle(e);
    // 7. утро
    if (!e.s.ending) { emit(e, "morning", {}); }
    // 8. события по условию
    settle(e);
    // 9. итог дня
    const morning = e.morningLines ?? [];
    buildSummary(e, morning.slice());
  } finally {
    e.morningLines = null;
  }
}
