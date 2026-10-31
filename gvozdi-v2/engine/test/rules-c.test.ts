// Правила core.md 3.9–3.11 на мини-фикстуре: сигналы, расчётные величины, события.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import type { Pack } from "../src/index.ts";
import { money, ok, quietFixture, sleep, withStart } from "./helpers.ts";

function pack() {
  const p = quietFixture();
  p.characters.find((c) => c.id === "vanya")!.vars!.defect = 0;
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0 };
  p.variables.find((v) => v.id === "bake_xp")!.ladder![0].modifiers = [];
  return p;
}

const SIGNALS = [
  "game_start", "night", "morning", "action_done", "batch_defect", "idle_no_cost", "ladder_step", "modifier_expired",
  "became_visible", "incapacitated", "hired", "market_trip", "obligation_done", "obligation_failed", "obligation_declined", "offer_expired",
];

function withProbes(p: Pack): Pack {
  for (const s of SIGNALS) p.events.push({ id: `probe_${s}`, trigger: { signal: s, conditions: [] }, effects: [] });
  return p;
}

test("3.9 все сигналы движка испускаются", () => {
  const p = withProbes(withStart(pack(), [
    { type: "var", target: "world", var: "money", add: 100 },
    { type: "goods", good: "bread", qty: 20 },
    { type: "add_modifier", template: "cozy_evening", target: "hero" },
    { type: "add_modifier", template: "flu", target: "char:grandma" },
    { type: "show_offer", offer: "neighbor_bread", data: { qty: 2 } },
    { type: "show_offer", offer: "neighbor_bread", data: { qty: 2 } },
    { type: "show_offer", offer: "neighbor_bread", data: { qty: 2 } },
    { type: "show_offer", offer: "neighbor_bread", data: { qty: 2 } },
  ]));
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![0].add = 10;
  p.characters.find((c) => c.id === "vanya")!.vars!.defect = 1;
  const g = createGame(p, 1);
  const [b1, b2, b3] = g.view().board;
  ok(g, { type: "choose_option", offer: b1.id, option: "take" });
  ok(g, { type: "choose_option", offer: b2.id, option: "take" });
  ok(g, { type: "choose_option", offer: b3.id, option: "take" });
  const obs = g.view().obligations;
  assert.equal(obs.length, 3);
  assert.deepEqual(obs[0].requires, [{ name: "Хлеб", need: 2, have: 20 }]);
  ok(g, { type: "deliver", obligation: obs[0].id });
  ok(g, { type: "decline", obligation: obs[1].id });
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  for (let i = 0; i < 3; i++) { ok(g, { type: "do_action", action: "bake_bread", actor: "baker" }); clearPending(g); }
  ok(g, { type: "work_until_stop" });
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "idle" } });
  if (!g.view().meta.is_night) ok(g, { type: "set_sell_flag", good: "bread", on: false });
  if (g.view().market.enabled) ok(g, { type: "market_trip", buy_raw: {}, buy_items: [] });
  for (let i = 0; i < 3; i++) sleep(g);
  if (g.view().market.enabled) ok(g, { type: "market_trip", buy_raw: {}, buy_items: [] });
  const counts = g.debugView().event_counts;
  for (const s of SIGNALS) assert.ok((counts[`probe_${s}`] ?? 0) >= 1, `нет сигнала ${s}`);
});

test("3.9 данные сигнала становятся данными события (ladder_step: var, owner, step, level, dir)", () => {
  const p = pack();
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![0].add = 10;
  p.events.push({
    id: "probe_step", trigger: { signal: "ladder_step", conditions: [
      { type: "data", name: "var", op: "==", value: "bake_xp" }, { type: "data", name: "owner", op: "==", value: "baker" },
      { type: "data", name: "step", op: "==", value: "apprentice" }, { type: "data", name: "level", op: "==", value: 1 },
      { type: "data", name: "dir", op: "==", value: "up" } ] },
    effects: [{ type: "notify", text: "{var}/{owner}/{step}/{level}/{dir}" }],
  });
  const g = createGame(p, 1);
  const r = ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.ok(r.events.some((l) => l.text === "bake_xp/baker/apprentice/1/up"));
});

// ---------- 3.10 Расчётные величины ----------

test("3.10 расчётные величины: wealth, stock_value, cost_hours, income/expense_yesterday", () => {
  const p = withStart(pack(), [{ type: "goods", good: "bread", qty: 10 }]);
  const g = createGame(p, 1);
  let c = g.debugView().calc;
  assert.equal(c.stock_value, 6 + 30);
  assert.equal(c.wealth, 30 + 36);
  assert.equal(c.cost_hours, null); // назначений нет — не расходуется
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  c = g.debugView().calc;
  assert.equal(c.cost_hours, 6 / 1.2);
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "idle" } });
  ok(g, { type: "market_trip", buy_raw: { flour: 2 }, buy_items: [] });
  sleep(g);
  c = g.debugView().calc;
  assert.equal(c.income_yesterday, 30);
  assert.equal(c.expense_yesterday, 15 + 2 + 1 + 2 + 1);
});

// ---------- 3.11 События ----------

test("3.11 пул: с шансом 0 событий пула нет, с шансом 1 — ровно одно за утро по весам", () => {
  const p0 = pack();
  const g0 = createGame(p0, 3);
  for (let i = 0; i < 5; i++) sleep(g0);
  const pool = ["grandma_pie", "cat_mischief", "worker_day_off", "neighbor_order", "cold_snap"];
  const n0 = pool.reduce((s, id) => s + (g0.debugView().event_counts[id] ?? 0), 0);
  assert.equal(n0, 0);
  const p1 = pack();
  p1.pack.settings.pools = { daily: { chance: 1 } };
  const g1 = createGame(p1, 3);
  for (let i = 0; i < 6; i++) sleep(g1);
  const n1 = pool.reduce((s, id) => s + (g1.debugView().event_counts[id] ?? 0), 0);
  assert.equal(n1, 6);
  // вес 0 исключает событие
  const p2 = pack();
  p2.pack.settings.pools = { daily: { chance: 1 } };
  for (const ev of p2.events) if (ev.trigger?.pool && ev.id !== "grandma_pie") ev.weight = 0;
  const g2 = createGame(p2, 3);
  for (let i = 0; i < 3; i++) sleep(g2);
  assert.equal(g2.debugView().event_counts.grandma_pie, 3);
});

test("3.11 участник случайный (among workers) и подстановка {participant}", () => {
  const p = pack();
  p.pack.settings.pools = { daily: { chance: 1 } };
  for (const ev of p.events) if (ev.trigger?.pool && ev.id !== "worker_day_off") ev.weight = 0;
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "sleep" });
  const po = g.view().pending_offer!;
  assert.equal(po.text, "Ваня мнётся у печи и просит выходной.");
  ok(g, { type: "choose_option", offer: po.id, option: "yes" });
  const vanya = g.view().characters.find((c) => c.id === "vanya")!;
  assert.equal(vanya.status, "incapacitated");
  assert.ok(vanya.effects.some((x) => x.name === "Выходной" && x.days_left === 1));
  // on_expire: после выходного — «Отдохнул»
  ok(g, { type: "sleep" });
  clearPending(g);
  const v2 = g.view().characters.find((c) => c.id === "vanya")!;
  assert.equal(v2.status, "ok");
  assert.ok(v2.effects.some((x) => x.name === "Отдохнул"));
});

function clearPending(g: ReturnType<typeof createGame>) {
  for (let i = 0; i < 10 && g.view().pending_offer; i++) {
    const po = g.view().pending_offer!;
    ok(g, { type: "choose_option", offer: po.id, option: po.options.find((o) => o.enabled)!.id });
  }
}

test("3.11 повторяемость: repeat.max и cooldown_days", () => {
  const p = pack();
  p.events.push({ id: "probe_cd", trigger: { signal: "morning", conditions: [] }, repeat: { cooldown_days: 2 }, effects: [] });
  const g = createGame(p, 1);
  for (let i = 0; i < 6; i++) sleep(g); // утра дней 2..7
  const c = g.debugView().event_counts;
  assert.equal(c.probe_cd, 3); // дни 2, 4, 6
  assert.equal(c.masha_arrives, 1);
  assert.equal(c.start_default, 1);
});

test("3.11 событие по условию срабатывает при переходе из ложного в истинное", () => {
  const p = withStart(pack(), [{ type: "var", target: "world", var: "money", add: -40 }, { type: "goods", good: "bread", qty: 10 }]);
  p.events.push({ id: "probe_cond", trigger: { conditions: [{ type: "stock", good: "bread", op: ">=", value: 5 }] }, effects: [] });
  const g = createGame(p, 1);
  const c = (id: string) => g.debugView().event_counts[id] ?? 0;
  assert.equal(c("debt_warning"), 1);
  assert.ok(g.view().notifications.some((l) => l.text === "Кошелёк пуст, лавочник хмурится." && l.kind === "warn"));
  assert.equal(c("probe_cond"), 1);
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  assert.equal(c("probe_cond"), 1); // условие всё ещё истинно — повтора нет
  ok(g, { type: "market_trip", buy_raw: {}, buy_items: [] }); // хлеб продан → ложно
  assert.equal(c("probe_cond"), 1);
  for (let i = 0; i < 3; i++) ok(g, { type: "do_action", action: "bake_bread", actor: "baker" }); // 6 хлеба → истинно
  assert.equal(c("probe_cond"), 2);
});

test("3.11 run_event: данные эффекта и data_defaults события", () => {
  const p = withStart(pack(), [
    { type: "run_event", event: "order_failed", data: { penalty: -5 } },
    { type: "run_event", event: "order_failed" },
  ]);
  const g = createGame(p, 1);
  const v = g.view();
  assert.ok(v.notifications.some((l) => l.text === "Заказчик в гневе. Штраф: -5 мон."));
  assert.ok(v.notifications.some((l) => l.text === "Заказчик в гневе. Штраф: -20 мон."));
  assert.equal(money(g), 30 - 5 - 20);
  assert.equal(v.effects.filter((x) => x.name === "Дурная слава").length, 1);
});

test("приёмка 7: переполнение цепочки событий — ошибка выполнения в отладочном виде", () => {
  const p = withStart(pack(), [{ type: "run_event", event: "loop_test" }]);
  p.events.push({ id: "loop_test", effects: [{ type: "run_event", event: "loop_test" }] });
  const g = createGame(p, 1);
  const errs = g.debugView().errors;
  assert.ok(errs.some((x) => x.includes("переполнение цепочки")), JSON.stringify(errs));
  // сигнал game_start — глубина 1, стартовое событие ставит loop_test на глубину 2, предел 32
  assert.equal(g.debugView().event_counts.loop_test, 31);
  // игра продолжается
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
});

test("3.11 отсутствующее имя данных — ошибка выполнения", () => {
  const p = withStart(pack(), [{ type: "run_event", event: "nodata_test" }]);
  p.events.push({ id: "nodata_test", effects: [{ type: "var", target: "world", var: "money", add: { $data: "nope" } }] });
  const g = createGame(p, 1);
  assert.ok(g.debugView().errors.some((x) => x.includes("nope")));
  assert.equal(money(g), 30);
});
