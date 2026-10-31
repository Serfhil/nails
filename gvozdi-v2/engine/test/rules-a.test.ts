// Правила core.md 3.1–3.5 на мини-фикстуре.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import { HERO, finalVar, newGame, ok, quietFixture, rawVar, stock, withStart, money } from "./helpers.ts";

/** Ваня без брака (defect 0 и без «неумехи»). */
function cleanPack() {
  const p = quietFixture();
  p.characters.find((c) => c.id === "vanya")!.vars!.defect = 0;
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0 };
  p.variables.find((v) => v.id === "bake_xp")!.ladder![0].modifiers = [];
  return p;
}

// ---------- 3.1 Время ----------

test("3.1 разовое действие тратит свои часы, работники в это время работают по назначениям", () => {
  const g = createGame(cleanPack(), 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  assert.equal(g.view().meta.hour, 7);
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  assert.equal(g.view().meta.hour, 9);
  // Ваня: скорость 1.2, 2 часа = 2 партии, 4 хлеба
  assert.equal(stock(g, "bread"), 4);
});

test("3.1 действие, не успевающее до заката, недоступно с reason_no_time; ночью — только сон и команды без времени", () => {
  const p = cleanPack();
  const g = createGame(p, 1);
  for (let i = 0; i < 5; i++) ok(g, { type: "do_action", action: "rest", actor: "baker" });
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(g.view().meta.hour, 17);
  const r = g.perform({ type: "do_action", action: "rest", actor: "baker" });
  assert.equal(r.ok, false);
  assert.equal(r.error!.code, "no_time");
  assert.equal(r.error!.text, p.texts.reason_no_time);
  const rest = g.view().actions.find((a) => a.id === "rest")!;
  assert.equal(rest.enabled, false);
  assert.equal(rest.reason, p.texts.reason_no_time);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  const v = g.view();
  assert.equal(v.meta.is_night, true);
  assert.equal(v.market.enabled, false);
  assert.equal(v.market.disabled_reason, p.texts.reason_night);
  assert.equal(g.perform({ type: "do_action", action: "bake_bread", actor: "baker" }).error!.text, p.texts.reason_night);
  assert.equal(g.perform({ type: "market_trip", buy_raw: {}, buy_items: [] }).error!.code, "no_time");
  ok(g, { type: "set_sell_flag", good: "flour", on: true });
  ok(g, { type: "set_assignment", character: "baker", assignment: { kind: "idle" } });
  ok(g, { type: "sleep" });
  assert.equal(g.view().meta.day, 2);
  assert.equal(g.view().meta.hour, p.pack.settings.day_start);
});

// ---------- 3.2 Переменные и модификаторы ----------

test("3.2 итог = (сырое + Σadd) × (1 + Σpct/100) × Πmult, с ограничением min/max", () => {
  const p = withStart(cleanPack(), [
    { type: "add_modifier", template: "rested", target: "hero" },
    { type: "add_to_hire_pool", character: "masha" },
    { type: "var", target: "hero", var: "stress", add: 500 },
  ]);
  const g = createGame(p, 1);
  const peel = g.view().inventory.find((i) => i.type === "peel")!;
  ok(g, { type: "equip", character: "baker", item: peel.item });
  // скорость: 1 × (1 + (10 + 20)/100) = 1.3
  assert.equal(Math.round(finalVar(g, HERO, "speed") * 1e6) / 1e6, 1.3);
  // стресс ограничен max 100
  assert.equal(rawVar(g, HERO, "stress"), 100);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "masha" });
  // доля торговца: 0.1 × 0.5
  assert.equal(finalVar(g, "char:masha", "commission"), 0.05);
});

test("приёмка 7: модификатор изменения с направлением (gain) уменьшает прирост и не трогает снижение", () => {
  const p = withStart(cleanPack(), [
    { type: "var", target: "hero", var: "stress", set: 50 },
    { type: "add_modifier", template: "cozy_evening", target: "hero" },
  ]);
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(rawVar(g, HERO, "stress"), 52); // +4 → +2
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  assert.equal(rawVar(g, HERO, "stress"), 36); // −8 × 2 без изменений
});

test("3.2 знак изменения не переворачивается модификатором", () => {
  const p = withStart(cleanPack(), [
    { type: "var", target: "hero", var: "stress", set: 50 },
    { type: "add_modifier", template: "calm_test", target: "hero" },
  ]);
  p.modifiers.push({ id: "calm_test", name: "т", var: "stress", applies_to: "change", direction: "gain", op: "add", value: -10, duration: { kind: "forever" } });
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(rawVar(g, HERO, "stress"), 50); // 4 − 10 < 0 → 0
});

test("3.2 value_from: величина модификатора из переменной", () => {
  const g = createGame(cleanPack(), 1);
  for (let i = 0; i < 3; i++) ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  const xp = rawVar(g, HERO, "bake_xp");
  assert.ok(xp > 3);
  assert.ok(Math.abs(finalVar(g, HERO, "learn_speed") - (1 + xp * 0.01)) < 1e-9);
});

test("3.2 action_tags: модификатор действует только во время действия с этими тегами", () => {
  const p = withStart(cleanPack(), [{ type: "give_item", item: "good_peel", target: "hero" }]);
  const g = createGame(p, 1);
  const it = g.view().inventory.find((i) => i.type === "good_peel")!;
  ok(g, { type: "equip", character: "baker", item: it.item });
  const speed = () => g.view().characters.find((c) => c.id === "baker")!.vars.find((v) => v.id === "speed")!.value;
  assert.equal(speed(), 1);
  ok(g, { type: "set_assignment", character: "baker", assignment: { kind: "action", action: "bake_bread" } });
  assert.equal(speed(), 1.3);
});

test("3.2 наложение: stack:false продлевает срок, stack:true добавляет копию (min_count)", () => {
  const p = withStart(cleanPack(), [
    { type: "add_modifier", template: "cozy_evening", target: "hero", duration: { kind: "days", n: 3 } },
    { type: "add_modifier", template: "cozy_evening", target: "hero", duration: { kind: "days", n: 1 } },
    { type: "add_modifier", template: "burn_scar", target: "hero" },
    { type: "add_modifier", template: "burn_scar", target: "hero" },
  ]);
  const g = createGame(p, 1);
  const eff = g.view().characters.find((c) => c.id === "baker")!.effects;
  const cozy = eff.filter((x) => x.name === "Бабушкин пирог");
  assert.equal(cozy.length, 1);
  assert.equal(cozy[0].days_left, 3);
  assert.equal(eff.filter((x) => x.name === "Ожог").length, 2);
  assert.equal(g.view().ending, null); // 2 копии < min_count 3
});

// ---------- 3.3 Лестница ----------

test("приёмка 7: лестница — модификаторы ступени действуют, пока ступень текущая; переход даёт ladder_step", () => {
  const p = quietFixture();
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0.05 };
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![0].add = 10;
  const g = createGame(p, 1);
  const hero = () => g.view().characters.find((c) => c.id === "baker")!;
  assert.ok(hero().effects.some((x) => x.name === "Неумеха"));
  assert.equal(Math.round(finalVar(g, HERO, "defect") * 100) / 100, 0.15);
  const r = g.perform({ type: "do_action", action: "bake_bread", actor: "baker" });
  assert.ok(r.events.some((l) => l.text.includes("уровень 1")));
  assert.equal(hero().vars.find((v) => v.id === "bake_xp")!.step, "Подмастерье");
  assert.ok(!hero().effects.some((x) => x.name === "Неумеха"));
  assert.ok(hero().effects.some((x) => x.name === "Ставка подмастерья"));
  assert.equal(Math.round(finalVar(g, HERO, "defect") * 100) / 100, 0.05);
  assert.equal(finalVar(g, HERO, "wage"), 1);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(hero().vars.find((v) => v.id === "bake_xp")!.level, 2);
  assert.ok(!hero().effects.some((x) => x.name === "Ставка подмастерья"));
  assert.ok(hero().effects.some((x) => x.name === "Ставка мастера"));
  assert.equal(finalVar(g, HERO, "wage"), 3);
  assert.ok((g.debugView().event_counts.level_up ?? 0) >= 2);
});

test("приёмка 7: шкала с порогом и срывом — срыв делает недееспособным", () => {
  const p = cleanPack();
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![1].add = 40;
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  const v = g.view();
  assert.equal(v.stress!.step, "Вымотан");
  assert.equal(v.stress!.warning, true);
  assert.ok(v.characters[0].effects.some((x) => x.name === "Вымотан"));
  assert.equal(Math.round(finalVar(g, HERO, "speed") * 100) / 100, 0.8);
  const r = ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.ok(r.events.some((l) => l.kind === "danger"));
  const h = g.view().characters.find((c) => c.id === "baker")!;
  assert.equal(h.status, "incapacitated");
  assert.equal(h.incapacitated_permanent, false);
  assert.equal(rawVar(g, HERO, "stress"), 60);
  assert.equal(g.view().stress!.step, "Бодр");
  assert.ok(h.effects.some((x) => x.name === "Ожог"));
});

test("3.3 floor_pct: итог ниже доли сырого — недееспособность", () => {
  const p = withStart(cleanPack(), [{ type: "add_modifier", template: "flu", target: "hero" }]);
  const g = createGame(p, 1);
  const h = g.view().characters.find((c) => c.id === "baker")!;
  assert.equal(h.vars.find((v) => v.id === "health")!.value, 40);
  assert.equal(h.status, "incapacitated");
});

// ---------- 3.4 Действия ----------

test("3.4 open_when скрывает, enabled_when делает серым с причиной", () => {
  const p = withStart(cleanPack(), [{ type: "var", target: "world", var: "money", add: 100 }]);
  const g = createGame(p, 1);
  assert.ok(!g.view().actions.some((a) => a.id === "bake_cake"));
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" });
  const cake = g.view().actions.find((a) => a.id === "bake_cake")!;
  assert.equal(cake.enabled, false);
  assert.equal(cake.reason, "Торт по силам только подмастерью.");
  const r = g.perform({ type: "do_action", action: "bake_cake", actor: "baker" });
  assert.equal(r.error!.code, "requirement_unmet");
  assert.ok(!g.view().actions.some((a) => a.id === "buy_oven"));
});

test("3.4 speed_scaled: разовое действие занимает ceil(hours / speed) часов", () => {
  const p = cleanPack();
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0, speed: 0.4 };
  const g = createGame(p, 1);
  assert.equal(g.view().actions.find((a) => a.id === "bake_bread")!.hours, 3);
  ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(g.view().meta.hour, 9);
  assert.equal(stock(g, "bread"), 2);
});

test("3.4 назначение: партии подряд, прогресс дробный и переносится между часами", () => {
  const g = createGame(cleanPack(), 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  ok(g, { type: "do_action", action: "rest", actor: "baker" });
  // 4 часа × 1.2 = 4.8: 4 партии готовы, пятая начата (расход списан)
  assert.equal(stock(g, "bread"), 8);
  assert.equal(stock(g, "flour"), 1);
  const vanya = g.debugView().entities.find((e) => e.ref === "char:vanya")!;
  assert.ok(Math.abs((vanya.extra.progress as number) - 0.8) < 1e-9);
});

test("3.4 простой без расхода: сигнал idle_no_cost (один раз за команду) и остановка времени", () => {
  const p = withStart(cleanPack(), [{ type: "goods", good: "flour", qty: -6 }]);
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  ok(g, { type: "set_assignment", character: "vanya", assignment: { kind: "action", action: "bake_bread" } });
  const r = ok(g, { type: "work_until_stop" });
  assert.equal(r.stop!.reason, "event");
  assert.equal(r.stop!.text, "Ваня сидит без дела: кончилось сырьё.");
  assert.equal(g.view().meta.hour, 8);
});

test("3.4 начисления за час со scale_by; обучение с var_cmp (учитель строго выше)", () => {
  const p = withStart(cleanPack(), [{ type: "var", target: "world", var: "money", add: 20 }]);
  const g = createGame(p, 1);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  let teach = g.view().actions.find((a) => a.id === "teach")!;
  assert.deepEqual(teach.roles.actor, ["vanya"]);
  assert.equal(teach.enabled, false);
  assert.equal(teach.reason, "Учитель должен быть искуснее ученика.");
  const p2 = withStart(cleanPack(), [{ type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  const g2 = createGame(p2, 1);
  ok(g2, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  teach = g2.view().actions.find((a) => a.id === "teach")!;
  assert.equal(teach.enabled, true);
  ok(g2, { type: "do_action", action: "teach", actor: "vanya", partner: "baker" });
  // 3 × learn_speed 0.8 × 2 часа
  assert.ok(Math.abs(rawVar(g2, "char:vanya", "bake_xp") - 4.8) < 1e-9);
  assert.equal(rawVar(g2, HERO, "stress"), 4);
  assert.equal(g2.view().meta.hour, 9);
});

test("3.4 брак: выходы не создаются, расход потерян, сигнал batch_defect", () => {
  const p = cleanPack();
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 1 };
  const g = createGame(p, 1);
  const r = ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(stock(g, "bread"), 0);
  assert.equal(stock(g, "flour"), 5);
  assert.ok(r.events.some((l) => l.text === "Пекарь: «Хлеб» подгорело, партия в брак."));
});

// ---------- 3.5 Расход ----------

test("3.5 расход: деньги, товар, qty_from у кандидата; причина — первая недостающая строка", () => {
  const p = cleanPack();
  const g = createGame(p, 1);
  const oven = g.view().actions.find((a) => a.id === "buy_oven")!;
  assert.equal(oven.reason, "Не хватает: Монеты — нужно 50, есть 30.");
  assert.deepEqual(oven.cost, [{ name: "Монеты", need: 50, have: 30 }]);
  const hire = g.view().actions.find((a) => a.id === "hire_helper")!;
  assert.deepEqual(hire.cost, [{ name: "Монеты", need: 15, have: 30 }]);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  assert.equal(money(g), 15);
  const r = g.perform({ type: "do_action", action: "buy_oven", actor: "baker" });
  assert.equal(r.error!.code, "insufficient");
  assert.equal(r.error!.text, "Не хватает: Монеты — нужно 50, есть 15.");
});
