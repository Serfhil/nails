// Правила core.md 3.6–3.8 на мини-фикстуре.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import { HERO, finalVar, money, ok, quietFixture, sleep, stock, withStart } from "./helpers.ts";

function pack() {
  const p = quietFixture();
  p.characters.find((c) => c.id === "vanya")!.vars!.defect = 0;
  p.characters.find((c) => c.id === "masha")!.vars!.defect = 0;
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0 };
  p.variables.find((v) => v.id === "bake_xp")!.ladder![0].modifiers = [];
  return p;
}

// ---------- 3.6 Рынок ----------

test("3.6 поход на рынок: продажа товара с галочкой по цене × множители, закупка сырья, время", () => {
  const p = withStart(pack(), [
    { type: "goods", good: "bread", qty: 10 },
    { type: "add_modifier", template: "bad_reputation", target: "world" },
  ]);
  const g = createGame(p, 1);
  const v = g.view();
  assert.equal(v.market.enabled, true);
  assert.deepEqual(v.market.raw, [{ id: "flour", name: "Мука", unit_price: 1 }]);
  const r = ok(g, { type: "market_trip", buy_raw: { flour: 5 }, buy_items: [] });
  // 10 × 3 × 0.8 = 24, минус 5 муки
  assert.equal(money(g), 30 + 24 - 5);
  assert.equal(stock(g, "bread"), 0);
  assert.equal(stock(g, "flour"), 11);
  assert.equal(g.view().meta.hour, 8);
  assert.ok(r.events.some((l) => l.text === "Пекарь продал «Хлеб» × 10 за 24 мон."));
  assert.ok(r.events.some((l) => l.text === "Пекарь купил «Мука» × 5 за 5 мон."));
});

test("3.6 галочка продажи: начальное значение sell_default, меняется командой", () => {
  const g = createGame(pack(), 1);
  const flour = () => g.view().storage.goods.find((x) => x.id === "flour")!;
  assert.equal(flour().sell_flag, false);
  ok(g, { type: "set_sell_flag", good: "flour", on: true });
  assert.equal(flour().sell_flag, true);
  ok(g, { type: "market_trip", buy_raw: {}, buy_items: [] });
  assert.equal(stock(g, "flour"), 0);
  assert.equal(money(g), 36);
});

test("3.6 лавка: предмет с open_when, покупка — экземпляр в инвентаре героя", () => {
  const p = withStart(pack(), [{ type: "var", target: "world", var: "money", add: 100 }]);
  const g = createGame(p, 1);
  assert.deepEqual(g.view().market.shop, []);
  const p2 = withStart(pack(), [{ type: "var", target: "world", var: "money", add: 100 }, { type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  const g2 = createGame(p2, 1);
  assert.deepEqual(g2.view().market.shop, [{ item_type: "good_peel", name: "Новая лопата", price: 30, enabled: true, disabled_reason: null }]);
  ok(g2, { type: "market_trip", buy_raw: {}, buy_items: ["good_peel"] });
  assert.equal(money(g2), 100);
  assert.ok(g2.view().inventory.some((i) => i.type === "good_peel" && i.name === "Новая лопата"));
  assert.equal(g.perform({ type: "market_trip", buy_raw: {}, buy_items: ["good_peel"] }).error!.code, "invalid");
});

test("3.6 торговец: раз в trade_hours продаёт с комиссией и докупает сырьё до цели", () => {
  const p = withStart(pack(), [
    { type: "goods", good: "bread", qty: 10 },
    { type: "goods", good: "flour", qty: -6 },
    { type: "add_to_hire_pool", character: "masha" },
  ]);
  const g = createGame(p, 1);
  assert.equal(g.perform({ type: "set_assignment", character: "baker", assignment: { kind: "trade" } }).error!.code, "not_available");
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "masha" });
  assert.equal(money(g), 5);
  ok(g, { type: "set_assignment", character: "masha", assignment: { kind: "trade" } });
  assert.equal(g.view().characters.find((c) => c.id === "masha")!.assignment.label, "Торговать на рынке");
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  // 30 выручки, доля торговца floor(30 × 0.05) = 1, 29 в кошелёк; мука до 6
  assert.equal(stock(g, "bread"), 0);
  assert.equal(stock(g, "flour"), 6);
  assert.equal(money(g), 5 + 29 - 6);
});

// ---------- 3.7 Найм и мастерские ----------

test("3.7 найм из пула, приписка к единственной мастерской, предел max_workers", () => {
  const p = withStart(pack(), [
    { type: "var", target: "world", var: "money", add: 200 },
    { type: "add_to_hire_pool", character: "masha" },
  ]);
  const g = createGame(p, 1);
  const hire = () => g.view().actions.find((a) => a.id === "hire_helper")!;
  assert.deepEqual(hire().roles.candidate, ["vanya", "masha"]);
  const r = ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  assert.ok(r.events.some((l) => l.text === "Нанят помощник: Ваня."));
  assert.ok(r.events.some((l) => l.text === "Ваня повязал фартук."));
  const ws = g.view().workshops[0];
  assert.deepEqual(ws.workers, ["vanya"]);
  assert.equal(g.view().characters.find((c) => c.id === "vanya")!.workshop, ws.id);
  assert.deepEqual(hire().roles.candidate, ["masha"]);
  assert.equal(hire().enabled, false);
  assert.equal(hire().reason, "Больше работников не поместится.");
  ok(g, { type: "do_action", action: "buy_mixer", actor: "baker" });
  assert.equal(finalVar(g, `ws:${ws.id}`, "max_workers"), 2);
  assert.equal(hire().enabled, true);
});

test("3.7 утренние расходы: дом + жалованье + содержание, с источниками", () => {
  const g = createGame(pack(), 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  const r = sleep(g);
  const s = r.view.summary!;
  assert.equal(money(g), 15 - 1 - 2 - 1);
  const labels = s.expense.map((x) => `${x.label}=${x.amount}`).sort();
  assert.equal(labels.length, 4);
  assert.ok(labels.includes("Жалованье: Ваня=2"));
  assert.ok(labels.includes("Содержание: Домашняя кухня=1"));
  assert.ok(labels.includes("Хозяйство=1"));
  assert.ok(labels.includes("Дела=15"));
  assert.ok(s.morning.some((l) => l.text === "Утренние расходы: 4 мон."));
});

test("3.7 оборудование ставится в слот мастерской; флаг открывает действие", () => {
  const p = withStart(pack(), [{ type: "var", target: "world", var: "money", add: 100 }]);
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" });
  const ws = g.view().workshops[0];
  assert.deepEqual(ws.equipment.map((x) => x.name), ["Большая печь"]);
  assert.ok(g.view().actions.some((a) => a.id === "bake_cake"));
  assert.ok(!ws.effects.some((x) => x.name === "Есть печь")); // флаг скрыт
  assert.ok(g.view().characters[0].effects.some((x) => x.name === "Тепло печи")); // target: hero
});

function upgradePack(slots: number, transfer: Record<string, unknown> | null) {
  const p = withStart(pack(), [
    { type: "var", target: "world", var: "money", add: 400 },
    { type: "add_modifier", template: "second_kitchen", target: "workshop" },
  ]);
  p.workshops.find((w) => w.id === "bakery")!.vars!.equipment_slots = slots;
  if (transfer) (p.actions.find((a) => a.id === "upgrade_bakery")!.effects![0] as any).transfer = transfer;
  return p;
}

test("приёмка 7: апгрейд заменой — перенос оборудования, работников, модификаторов; лишнее уничтожается", () => {
  const g = createGame(upgradePack(1, null), 1);
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" });
  ok(g, { type: "do_action", action: "buy_mixer", actor: "baker" });
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  const oldId = g.view().workshops[0].id;
  const r = ok(g, { type: "do_action", action: "upgrade_bakery", actor: "baker" });
  assert.ok(r.events.some((l) => l.text === "Над дверью новая вывеска: «Пекарня»." && l.kind === "seal"));
  const v = g.view();
  assert.equal(v.workshops.length, 1);
  const ws = v.workshops[0];
  assert.notEqual(ws.id, oldId);
  assert.equal(ws.type, "bakery");
  assert.equal(ws.name, "Городская пекарня");
  assert.deepEqual(ws.workers, ["vanya"]);
  assert.deepEqual(ws.equipment.map((x) => x.name), ["Большая печь"]);
  assert.equal(v.inventory.some((i) => i.type === "mixer"), false);
  const dbg = g.debugView().entities.find((x) => x.ref === `ws:${ws.id}`)!;
  assert.ok(dbg.modifiers.some((m) => m.template === "second_kitchen" && m.stored));
  assert.ok(dbg.modifiers.some((m) => m.template === "has_oven"));
  assert.ok(!g.debugView().entities.some((x) => x.ref === `ws:${oldId}`));
  // модификатор мастерской-типа: слава на мир
  assert.ok(v.effects.some((x) => x.name === "Городская слава"));
  assert.ok(!v.actions.some((a) => a.id === "upgrade_bakery"));
});

test("3.7 апгрейд с transfer.overflow = inventory: лишнее оборудование уходит в инвентарь", () => {
  const g = createGame(upgradePack(1, { overflow: "inventory" }), 1);
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" });
  ok(g, { type: "do_action", action: "buy_mixer", actor: "baker" });
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "do_action", action: "upgrade_bakery", actor: "baker" });
  assert.ok(g.view().inventory.some((i) => i.type === "mixer"));
});

test("3.7 несколько мастерских: приписка командой assign_workshop", () => {
  const p = withStart(pack(), [
    { type: "var", target: "world", var: "money", add: 300 },
    { type: "add_to_hire_pool", character: "masha" },
  ]);
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "buy_mixer", actor: "baker" });
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "masha" });
  ok(g, { type: "do_action", action: "rent_kitchen", actor: "baker" });
  const v = g.view();
  assert.equal(v.workshops.length, 2);
  assert.ok(!v.actions.some((a) => a.id === "rent_kitchen"));
  const second = v.workshops[1].id;
  ok(g, { type: "assign_workshop", character: "masha", workshop: second });
  assert.deepEqual(g.view().workshops[1].workers, ["masha"]);
  // во второй кухне 1 место
  const r = g.perform({ type: "assign_workshop", character: "vanya", workshop: second });
  assert.equal(r.ok, false);
  assert.equal(r.error!.code, "requirement_unmet");
});

// ---------- 3.8 Недееспособность ----------

test("приёмка 7: недееспособность героя — разрешены только перечисленные команды", () => {
  const p = withStart(pack(), [
    { type: "add_modifier", template: "breakdown", target: "hero" },
    { type: "var", target: "world", var: "money", add: 20 },
  ]);
  const g = createGame(p, 1);
  const h = g.view().characters.find((c) => c.id === "baker")!;
  assert.equal(h.status, "incapacitated");
  const r = g.perform({ type: "market_trip", buy_raw: {}, buy_items: [] });
  assert.equal(r.error!.code, "incapacitated");
  assert.equal(r.error!.text, "Пекарь сейчас не может работать.");
  assert.equal(g.perform({ type: "do_action", action: "rest", actor: "baker" }).error!.code, "incapacitated");
  assert.equal(g.view().market.enabled, false);
  ok(g, { type: "set_sell_flag", good: "flour", on: true });
  ok(g, { type: "set_assignment", character: "baker", assignment: { kind: "action", action: "bake_bread" } });
  // герой с назначением не работает, пока недееспособен
  ok(g, { type: "work_until_stop" });
  assert.equal(stock(g, "bread"), 0);
  sleep(g);
  sleep(g);
  assert.equal(g.view().characters.find((c) => c.id === "baker")!.status, "ok");
});

test("3.8 постоянная недееспособность: все причины — модификаторы forever; сигнал incapacitated", () => {
  const p = withStart(pack(), [{ type: "add_modifier", template: "curse_test", target: "char:grandma" }]);
  p.modifiers.push({ id: "curse_test", name: "Проклятие", flag: true, incapacitates: true, may_be_permanent: true, duration: { kind: "forever" } });
  p.events.push({ id: "probe_incap", trigger: { signal: "incapacitated", conditions: [{ type: "data", name: "permanent", op: "==", value: true }] }, effects: [] });
  const g = createGame(p, 1);
  const gm = g.view().characters.find((c) => c.id === "grandma")!;
  assert.equal(gm.status, "incapacitated");
  assert.equal(gm.incapacitated_permanent, true);
  assert.equal(g.debugView().event_counts.probe_incap, 1);
});

test("3.8 недееспособный работник не работает; другой исполнитель доступен при больном герое", () => {
  const p = withStart(pack(), [{ type: "add_modifier", template: "flu", target: "hero" }, { type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  const g = createGame(p, 1);
  ok(g, { type: "set_assignment", character: "baker", assignment: { kind: "idle" } });
  // нанять нельзя (исполнитель — герой)
  assert.equal(g.perform({ type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" }).error!.code, "incapacitated");
  const g2 = createGame(withStart(pack(), [{ type: "add_character", character: "vanya", as: "worker" }, { type: "add_modifier", template: "flu", target: "char:vanya" }]), 1);
  ok(g2, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  ok(g2, { type: "do_action", action: "rest", actor: "baker" });
  assert.equal(stock(g2, "bread"), 0);
  assert.equal(g2.view().characters.find((c) => c.id === "vanya")!.status, "incapacitated");
  assert.ok(HERO);
});
