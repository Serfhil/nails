// Правила core.md 3.12–3.17 на мини-фикстуре: видимость, предложения и обязательства, ночь и утро,
// остановки, итог дня, завершение игры.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import { clearOffers, money, ok, quietFixture, sleep, stock, withStart } from "./helpers.ts";

function pack() {
  const p = quietFixture();
  p.characters.find((c) => c.id === "vanya")!.vars!.defect = 0;
  p.characters.find((c) => c.id === "baker")!.vars = { defect: 0 };
  p.variables.find((v) => v.id === "bake_xp")!.ladder![0].modifiers = [];
  return p;
}

// ---------- 3.12 Видимость ----------

test("3.12 скрытые действие и переменная появляются при открытии; became_visible", () => {
  const p = pack();
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![0].add = 10;
  const g = createGame(p, 1);
  const hero = () => g.view().characters.find((c) => c.id === "baker")!;
  assert.ok(!g.view().actions.some((a) => a.id === "bake_pastry"));
  assert.ok(!hero().vars.some((v) => v.id === "pastry_xp"));
  for (let i = 0; i < 3; i++) ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.ok(g.view().actions.some((a) => a.id === "bake_pastry"));
  assert.ok(hero().vars.some((v) => v.id === "pastry_xp" && v.name === "Кондитерское дело"));
  // событие на became_visible с popup
  const po = g.view().pending_offer!;
  assert.equal(po.text, "Руки сами вспомнили бабушкин рецепт пирожных!");
  assert.deepEqual(po.options.map((o) => o.label), ["Понятно"]);
  assert.equal(g.debugView().opened["action:bake_pastry"], 1);
});

test("3.12 show_numbers: false — у эффекта нет чисел; видимый модификатор — с числами", () => {
  const p = withStart(pack(), [
    { type: "add_modifier", template: "grumpy", target: "hero" },
    { type: "add_modifier", template: "cozy_evening", target: "hero" },
  ]);
  const g = createGame(p, 1);
  const eff = g.view().characters.find((c) => c.id === "baker")!.effects;
  const grumpy = eff.find((x) => x.name === "Обида")!;
  assert.equal(grumpy.numbers, null);
  assert.equal(grumpy.negative, true);
  const cozy = eff.find((x) => x.name === "Бабушкин пирог")!;
  assert.equal(cozy.numbers, "Усталость ▲ −50%");
  assert.equal(cozy.negative, false);
});

test("3.12 скрытый персонаж становится видимым по условию", () => {
  const p = pack();
  p.pack.settings.pools = { daily: { chance: 1 } };
  for (const ev of p.events) if (ev.trigger?.pool && ev.id !== "cat_mischief") ev.weight = 0;
  const g = createGame(p, 1);
  assert.ok(!g.view().characters.some((c) => c.id === "cat"));
  sleep(g);
  assert.ok(g.view().characters.some((c) => c.id === "cat" && c.name === "Кот Пушок"));
});

// ---------- 3.13 Предложения и обязательства ----------

test("приёмка 7: окно now блокирует время; варианты скрытый, серый, с ценой", () => {
  const p = withStart(pack(), [{ type: "show_offer", offer: "royal_order" }, { type: "show_offer", offer: "victory_offer" }]);
  const g = createGame(p, 1);
  const po = g.view().pending_offer!;
  assert.equal(po.title, "Гонец из замка");
  assert.deepEqual(po.options.map((o) => o.id), ["take_cake", "gift", "refuse"]); // take_pastry скрыт
  const take = po.options.find((o) => o.id === "take_cake")!;
  assert.equal(take.enabled, false);
  assert.equal(take.reason, "Без большой печи торт не испечь.");
  const gift = po.options.find((o) => o.id === "gift")!;
  assert.equal(gift.enabled, false);
  assert.equal(gift.reason, "Не хватает: Торт — нужно 1, есть 0.");
  assert.deepEqual(gift.cost, [{ name: "Торт", need: 1, have: 0 }]);
  const before = g.save();
  for (const cmd of [{ type: "work_until_stop" }, { type: "sleep" }, { type: "do_action", action: "rest", actor: "baker" }] as const) {
    const r = g.perform(cmd as any);
    assert.equal(r.error!.code, "offer_pending");
  }
  assert.equal(g.perform({ type: "choose_option", offer: po.id, option: "take_cake" }).error!.code, "requirement_unmet");
  assert.equal(g.perform({ type: "choose_option", offer: po.id, option: "gift" }).error!.code, "insufficient");
  assert.equal(g.perform({ type: "choose_option", offer: po.id, option: "take_pastry" }).error!.code, "not_available");
  assert.equal(g.save(), before);
  const r = ok(g, { type: "choose_option", offer: po.id, option: "refuse" });
  assert.ok(r.events.some((l) => l.text === "Гонец пожал плечами и уехал."));
  // очередь окон
  assert.equal(g.view().pending_offer!.title, "Приглашение ко двору");
});

test("3.13 доска: запись живёт board_days утр, затем offer_expired", () => {
  const p = withStart(pack(), [{ type: "show_offer", offer: "neighbor_bread" }]);
  p.events.push({ id: "probe_exp", trigger: { signal: "offer_expired", conditions: [{ type: "data", name: "offer", op: "==", value: "neighbor_bread" }] }, effects: [] });
  const g = createGame(p, 1);
  assert.equal(g.view().board.length, 1);
  assert.equal(g.view().board[0].days_left, 2);
  assert.equal(g.view().board[0].text, "Соседке нужно 4 буханок за 2 дн. Заплатит 15 мон.");
  ok(g, { type: "do_action", action: "rest", actor: "baker" }); // доска не блокирует время
  sleep(g);
  assert.equal(g.view().board[0].days_left, 1);
  sleep(g);
  assert.equal(g.view().board.length, 0);
  assert.equal(g.debugView().event_counts.probe_exp, 1);
});

test("приёмка 7: обязательство — сдача (товар со склада до взятия засчитывается)", () => {
  const p = withStart(pack(), [{ type: "goods", good: "bread", qty: 6 }, { type: "show_offer", offer: "neighbor_bread", data: { qty: 5, reward: 12 } }]);
  const g = createGame(p, 1);
  ok(g, { type: "choose_option", offer: g.view().board[0].id, option: "take" });
  const ob = g.view().obligations[0];
  assert.equal(ob.title, "Хлеб для соседки");
  assert.equal(ob.days_left, 2);
  assert.equal(ob.can_deliver, true);
  const r = ok(g, { type: "deliver", obligation: ob.id });
  assert.ok(r.events.some((l) => l.text === "Заказ сдан: «Хлеб для соседки»."));
  assert.equal(stock(g, "bread"), 1);
  assert.equal(g.view().obligations.length, 0);
  // награда — модификатор с данными, деньги приходят утром (on_expire)
  const fx = g.view().effects.find((x) => x.name === "Обещанная плата")!;
  assert.equal(fx.text, "Обещали занести 12 мон.");
  sleep(g);
  assert.equal(money(g), 30 + 12 - 2);
  assert.equal(g.debugView().obligations[0].state, "done");
});

test("приёмка 7: обязательство — провал по сроку (on_fail, run_event с данными)", () => {
  const p = withStart(pack(), [{ type: "show_offer", offer: "neighbor_bread" }]);
  const g = createGame(p, 1);
  ok(g, { type: "choose_option", offer: g.view().board[0].id, option: "take" });
  const ob = g.view().obligations[0];
  assert.equal(ob.can_deliver, false);
  assert.equal(g.perform({ type: "deliver", obligation: ob.id }).error!.code, "insufficient");
  sleep(g); // день 2
  sleep(g); // день 3 — последний
  assert.equal(g.view().obligations[0].days_left, 0);
  const r = sleep(g); // день 4 — провал
  assert.equal(g.view().obligations.length, 0);
  assert.equal(g.debugView().obligations[0].state, "failed");
  const morning = r.view.summary!.morning.map((l) => l.text);
  assert.ok(morning.includes("Срок вышел: заказ «Хлеб для соседки» провален."));
  assert.ok(morning.includes("Заказчик в гневе. Штраф: -10 мон."));
  assert.ok(g.view().effects.some((x) => x.name === "Дурная слава" && x.negative));
});

test("приёмка 7: обязательство — отказ (on_decline)", () => {
  const p = withStart(pack(), [{ type: "give_item", item: "oven", target: "workshop" }, { type: "show_offer", offer: "royal_order" }]);
  const g = createGame(p, 1);
  const po = g.view().pending_offer!;
  assert.equal(po.options.find((o) => o.id === "take_cake")!.enabled, true);
  ok(g, { type: "choose_option", offer: po.id, option: "take_cake" });
  const ob = g.view().obligations[0];
  assert.equal(ob.title, "Торты для графа");
  const r = ok(g, { type: "decline", obligation: ob.id });
  assert.ok(r.events.some((l) => l.text === "Вы отказались от заказа «Торты для графа»."));
  assert.equal(g.debugView().obligations[0].state, "declined");
  assert.ok(g.view().effects.some((x) => x.name === "Дурная слава"));
});

// ---------- 3.14 Ночь и утро ----------

test("3.14 сон: ночь, новый день, сроки модификаторов (on_expire), расходы, утро, итог дня", () => {
  const p = withStart(pack(), [
    { type: "var", target: "hero", var: "stress", set: 50 },
    { type: "add_modifier", template: "day_off", target: "hero" },
  ]);
  const g = createGame(p, 1);
  assert.equal(g.view().characters[0].status, "incapacitated");
  const r = sleep(g);
  const v = r.view;
  assert.equal(v.meta.day, 2);
  assert.equal(v.meta.hour, 6);
  assert.equal(v.stress!.value, 20); // ночной отдых пака: −30
  const h = v.characters.find((c) => c.id === "baker")!;
  assert.equal(h.status, "ok");
  assert.ok(h.effects.some((x) => x.name === "Отдохнул"));
  assert.equal(v.summary!.title, "Итог дня");
  assert.equal(v.summary!.money_morning, 28);
  assert.equal(v.summary!.delta, -2);
});

// ---------- 3.15 Остановки ----------

test("3.15 work_until_stop: закат, окно, событие stops_time; минимум час", () => {
  const p = pack();
  const g = createGame(p, 1);
  let r = ok(g, { type: "work_until_stop" });
  assert.equal(r.stop!.reason, "sunset");
  assert.equal(r.stop!.text, "Солнце село. Пора закрывать лавку.");
  assert.equal(g.view().meta.hour, 18);
  // окно: гонец из замка по условию уровня и дня
  const p2 = withStart(pack(), [{ type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  const g2 = createGame(p2, 1);
  sleep(g2);
  clearOffers(g2);
  const p3 = withStart(pack(), [{ type: "var", target: "hero", var: "bake_xp", add: 10 }]);
  p3.events.find((e) => e.id === "royal_messenger")!.trigger!.conditions = [{ type: "hour", op: ">=", value: 9 }];
  const g3 = createGame(p3, 1);
  r = ok(g3, { type: "work_until_stop" });
  assert.equal(r.stop!.reason, "offer");
  assert.equal(r.stop!.text, "Нужно принять решение.");
  assert.equal(g3.view().meta.hour, 9);
  // событие stops_time: усталость
  const p4 = pack();
  p4.actions.find((a) => a.id === "bake_bread")!.per_hour![1].add = 25;
  const g4 = createGame(p4, 1);
  ok(g4, { type: "set_assignment", character: "baker", assignment: { kind: "action", action: "bake_bread" } });
  const r4 = ok(g4, { type: "work_until_stop" });
  assert.equal(r4.stop!.reason, "event");
  assert.ok(r4.stop!.text.includes("еле держится на ногах"));
  assert.equal(g4.view().meta.hour, 9);
});

// ---------- 3.16 Итог дня и уведомления ----------

test("3.16 уведомления за день очищаются утром; итог дня по источникам", () => {
  const p = withStart(pack(), [{ type: "goods", good: "bread", qty: 10 }]);
  const g = createGame(p, 1);
  assert.ok(g.view().notifications.length > 0);
  ok(g, { type: "market_trip", buy_raw: { flour: 3 }, buy_items: [] });
  const r = sleep(g);
  const s = r.view.summary!;
  assert.deepEqual(s.income, [{ source: "sale:baker", label: "Продажа (Пекарь)", amount: 30 }]);
  assert.ok(s.expense.some((x) => x.source === "purchase:baker" && x.label === "Закупка (Пекарь)" && x.amount === 3));
  assert.ok(s.expense.some((x) => x.source === "household" && x.amount === 1));
  assert.ok(s.expense.some((x) => x.source.startsWith("upkeep:") && x.label === "Содержание: Домашняя кухня"));
  assert.equal(s.delta, 30 - 3 - 2);
  assert.ok(!r.view.notifications.some((l) => l.text.startsWith("Утро. Печь остыла")));
});

// ---------- 3.17 Завершение игры ----------

test("приёмка 7: end_game — концовка fail; после неё доступна только view", () => {
  const p = withStart(pack(), [{ type: "var", target: "world", var: "money", add: -80 }]);
  const g = createGame(p, 1);
  const v = g.view();
  assert.deepEqual(v.ending, { title: "Долговая яма", text: "Пекарню забрали за долги. Стыдно показаться на улице.", tag: "fail" });
  const before = g.save();
  for (const cmd of [{ type: "work_until_stop" }, { type: "sleep" }, { type: "set_sell_flag", good: "flour", on: true }] as const) {
    const r = g.perform(cmd as any);
    assert.equal(r.ok, false);
    assert.equal(r.error!.code, "game_over");
  }
  assert.equal(g.save(), before);
  assert.deepEqual(g.debugView().endings_fired, [{ title: "Долговая яма", tag: "fail", day: 1 }]);
});

test("3.17 концовка от срывов: три копии ожога (min_count) — смерть", () => {
  const p = withStart(pack(), [
    { type: "add_modifier", template: "burn_scar", target: "hero" },
    { type: "add_modifier", template: "burn_scar", target: "hero" },
  ]);
  p.actions.find((a) => a.id === "bake_bread")!.per_hour![1].add = 100;
  const g = createGame(p, 1);
  assert.equal(g.view().ending, null);
  const r = ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  assert.equal(r.view.ending!.tag, "fail");
  assert.equal(r.view.ending!.title, "Сгорел на работе");
});

test("3.17 победа с продолжением: «Остаться» — игра идёт, «Принять» — концовка goal", () => {
  const p = withStart(pack(), [{ type: "show_offer", offer: "victory_offer" }, { type: "show_offer", offer: "victory_offer" }]);
  const g = createGame(p, 1);
  ok(g, { type: "choose_option", offer: g.view().pending_offer!.id, option: "stay" });
  assert.equal(g.view().ending, null);
  const r = ok(g, { type: "choose_option", offer: g.view().pending_offer!.id, option: "go" });
  assert.deepEqual(r.view.ending, { title: "Придворный пекарь", text: "Теперь ваш хлеб едят за графским столом.", tag: "goal" });
  assert.equal(g.perform({ type: "work_until_stop" }).error!.code, "game_over");
});

test("3.17 победа через заказ графа: сдача обязательства → окно → концовка goal", () => {
  const p = withStart(pack(), [
    { type: "give_item", item: "oven", target: "workshop" },
    { type: "goods", good: "cake", qty: 2 },
    { type: "show_offer", offer: "royal_order" },
  ]);
  const g = createGame(p, 1);
  ok(g, { type: "choose_option", offer: g.view().pending_offer!.id, option: "take_cake" });
  const r = ok(g, { type: "deliver", obligation: g.view().obligations[0].id });
  assert.equal(money(g), 230);
  assert.equal(r.view.pending_offer!.title, "Приглашение ко двору");
  ok(g, { type: "choose_option", offer: r.view.pending_offer!.id, option: "go" });
  assert.equal(g.view().ending!.tag, "goal");
});
