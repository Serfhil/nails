// Контракт 2.1 (core.md 3.7, 4.2, 4.3, 5.3, приёмка 10.7): оборудование, hire_pool, equippable, display.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import type { Game } from "../src/index.ts";
import { money, ok, quietFixture, withStart, finalVar } from "./helpers.ts";

function rich() {
  return withStart(quietFixture(), [{ type: "var", target: "world", var: "money", add: 500 }]);
}
const eqNames = (g: Game) => g.view().workshops[0].equipment.map((x) => x.name);
const act = (g: Game, id: string) => g.view().actions.find((a) => a.id === id);

test("приёмка 7 (2.1): оборудование — пустой слот, скрытая покупка той же линейки, прямой апгрейд", () => {
  const g = createGame(rich(), 1);
  assert.equal(act(g, "buy_oven")!.replace, null);
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" }); // случай 3: свободное место
  assert.deepEqual(eqNames(g), ["Большая печь"]);
  assert.equal(act(g, "buy_oven"), undefined); // случай 1: та же линейка не ниже — действия нет
  assert.equal(g.perform({ type: "do_action", action: "buy_oven", actor: "baker" }).error!.code, "not_available");
  const r = ok(g, { type: "do_action", action: "buy_brick_oven", actor: "baker" }); // случай 2: прямой апгрейд
  assert.ok(r.events.some((l) => l.text === "Старую печь разобрали, сложили кирпичную."));
  assert.deepEqual(eqNames(g), ["Кирпичная печь"]);
  assert.equal(act(g, "buy_oven"), undefined); // уровень 1 < 2 — тоже скрыто
  assert.ok(act(g, "bake_cake")); // флаг печи на месте
  assert.equal(g.view().inventory.some((i) => i.type === "oven"), false); // заменённое исчезло
  const dbg = g.debugView().entities.find((x) => x.ref === `ws:${g.view().workshops[0].id}`)!;
  assert.equal(dbg.modifiers.filter((m) => m.template === "has_oven").length, 1);
});

test("приёмка 7 (2.1): замена другой линейки — предупреждение, do_action без replace → requirement_unmet", () => {
  const g = createGame(rich(), 1);
  ok(g, { type: "do_action", action: "buy_oven", actor: "baker" });
  ok(g, { type: "do_action", action: "buy_mixer", actor: "baker" });
  const shelf = act(g, "buy_shelf")!;
  assert.equal(shelf.enabled, true);
  const warning = "Места нет: «Витрина» встанет вместо одного из: Большая печь, Тестомес. Выберите, что убрать.";
  assert.equal(shelf.replace!.warning, warning);
  assert.deepEqual(shelf.replace!.options.map((o) => o.name), ["Большая печь", "Тестомес"]);
  const before = g.save();
  const r = g.perform({ type: "do_action", action: "buy_shelf", actor: "baker" });
  assert.equal(r.ok, false);
  assert.equal(r.error!.code, "requirement_unmet");
  assert.equal(r.error!.text, warning);
  assert.equal(g.perform({ type: "do_action", action: "buy_shelf", actor: "baker", replace: "it999" }).error!.code, "invalid");
  assert.equal(g.save(), before);
  const mixer = shelf.replace!.options.find((o) => o.name === "Тестомес")!;
  const m0 = money(g);
  ok(g, { type: "do_action", action: "buy_shelf", actor: "baker", replace: mixer.item });
  assert.deepEqual(eqNames(g), ["Большая печь", "Витрина"]);
  assert.equal(money(g), m0 - 30);
  assert.equal(finalVar(g, `ws:${g.view().workshops[0].id}`, "max_workers"), 1); // модификатор тестомеса снят
  assert.ok(g.view().effects.some((x) => x.name === "Витрина"));
  assert.equal(g.view().inventory.some((i) => i.type === "mixer"), false);
});

test("2.1: оборудование из событий без выбора — случаи 1 и 4 не выдают предмет (запись в отладку)", () => {
  const p = withStart(quietFixture(), [
    { type: "give_item", item: "oven", target: "workshop" },
    { type: "give_item", item: "oven", target: "workshop" }, // случай 1
    { type: "give_item", item: "mixer", target: "workshop" },
    { type: "give_item", item: "shelf", target: "workshop" }, // случай 4
    { type: "give_item", item: "brick_oven", target: "workshop" }, // случай 2
  ]);
  const g = createGame(p, 1);
  assert.deepEqual(eqNames(g).sort(), ["Кирпичная печь", "Тестомес"].sort());
  assert.deepEqual(g.view().inventory.map((i) => i.type), ["peel"]);
  assert.equal(g.debugView().errors.filter((x) => x.includes("не выдано")).length, 2);
});

test("2.1: в лавке рынка только инструменты; оборудование в инвентарь не попадает", () => {
  const p = withStart(rich(), [{ type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  p.pack.settings.shop = ["good_peel", "oven"];
  const g = createGame(p, 1);
  assert.deepEqual(g.view().market.shop.map((s) => s.item_type), ["good_peel"]);
  assert.equal(g.perform({ type: "market_trip", buy_raw: {}, buy_items: ["oven"] }).error!.code, "invalid");
});

test("приёмка 7 (2.1): hire_pool в виде; кандидатов нет в characters", () => {
  const p = withStart(rich(), [{ type: "add_to_hire_pool", character: "masha" }]);
  const g = createGame(p, 1);
  const v = g.view();
  assert.deepEqual(v.hire_pool.map((c) => c.id), ["vanya", "masha"]);
  assert.ok(!v.characters.some((c) => c.id === "vanya" || c.id === "masha"));
  const masha = v.hire_pool.find((c) => c.id === "masha")!;
  assert.equal(masha.name, "Маша");
  assert.equal(masha.role_name, "Помощник");
  assert.equal(masha.blurb, "Неторопливая, зато всё запоминает и умеет торговаться.");
  assert.ok(masha.vars.some((x) => x.id === "speed" && x.display === "0,9"));
  assert.ok(!masha.vars.some((x) => x.id === "hire_cost")); // скрыта
  assert.ok(masha.effects.some((x) => x.name === "Торговая жилка"));
  assert.deepEqual(v.actions.find((a) => a.id === "hire_helper")!.roles.candidate, ["vanya", "masha"]);
  ok(g, { type: "do_action", action: "hire_helper", actor: "baker", candidate: "vanya" });
  assert.deepEqual(g.view().hire_pool.map((c) => c.id), ["masha"]);
  assert.ok(g.view().characters.some((c) => c.id === "vanya"));
});

test("приёмка 7 (2.1): equippable, названия слотов и ролей", () => {
  const p = withStart(quietFixture(), [
    { type: "give_item", item: "good_peel", target: "hero" },
    { type: "add_character", character: "vanya", as: "worker" },
  ]);
  const g = createGame(p, 1);
  const v = g.view();
  const inv = v.inventory.map((i) => i.item);
  assert.equal(inv.length, 2);
  const hero = v.characters.find((c) => c.id === "baker")!;
  assert.deepEqual(hero.equippable, inv);
  assert.deepEqual(hero.slots.map((s) => s.slot_name), ["В руке"]);
  assert.equal(hero.role_name, "Хозяин");
  assert.deepEqual(v.characters.find((c) => c.id === "vanya")!.equippable, inv);
  const grandma = v.characters.find((c) => c.id === "grandma")!;
  assert.deepEqual(grandma.equippable, []); // нет слотов
  assert.equal(grandma.role_name, "Старшая в доме"); // role_name шаблона важнее names.roles
  ok(g, { type: "equip", character: "vanya", item: inv[1] });
  assert.deepEqual(g.view().characters.find((c) => c.id === "baker")!.equippable, [inv[0]]);
  // ручной установки/снятия оборудования нет: equip с id мастерской — ошибка
  assert.equal(g.perform({ type: "equip", character: v.workshops[0].id, item: inv[0] }).error!.code, "invalid");
});

test("приёмка 7 (2.1): display по каждому формату — number, pct, money", () => {
  const p = withStart(quietFixture(), [
    { type: "add_character", character: "vanya", as: "worker" },
    { type: "var", target: "hero", var: "bake_xp", add: 10.456 },
  ]);
  const g = createGame(p, 1);
  const vanya = g.view().characters.find((c) => c.id === "vanya")!;
  const d = (id: string) => vanya.vars.find((x) => x.id === id)!;
  assert.equal(d("speed").display, "1,2"); // number
  assert.equal(d("defect").format, "pct");
  assert.equal(d("defect").value, 0.25);
  assert.equal(d("defect").display, "25%"); // pct: доля × 100
  assert.equal(d("wage").format, "money");
  assert.equal(d("wage").display, "2 мон."); // money
  const hero = g.view().characters.find((c) => c.id === "baker")!;
  assert.equal(hero.vars.find((x) => x.id === "bake_xp")!.display, "10,46"); // до 2 знаков
  assert.equal(hero.vars.find((x) => x.id === "defect")!.display, "5%");
});

test("T-001: description действия — из пака в View.actions[].description, без поля — null", () => {
  const g = createGame(quietFixture(), 1);
  assert.equal(act(g, "bake_bread")!.description, "Простая работа: мука в хлеб.");
  assert.equal(act(g, "rest")!.description, null);
  const p = quietFixture();
  const a = p.actions.find((x) => x.id === "bake_bread")!;
  a.description = null;
  assert.equal(act(createGame(p, 1), "bake_bread")!.description, null);
});
