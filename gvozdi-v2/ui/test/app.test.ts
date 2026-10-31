import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import type { Pack } from "../src/contract.ts";
import { memoryStorage, saveKey } from "../src/storage.ts";
import { stubApi, type StubGame } from "../src/stub.ts";
import { S } from "../src/strings.ts";

const pack = { pack: { id: "stubpack" } } as Pack;

function setup() {
  const api = stubApi();
  const storage = memoryStorage();
  const app = createApp({ api, pack, storage, random: () => 0.5 });
  const game = () => api.created[api.created.length - 1] as StubGame;
  return { api, storage, app, game };
}

test("новая игра сохраняется под ключом с id пака", () => {
  const { storage } = setup();
  assert.ok(storage.data.has(saveKey("stubpack")));
  assert.ok(saveKey("stubpack").includes("stubpack"));
});

test("загрузка сохранения при запуске", () => {
  const { api, storage, app } = setup();
  app.handle({ act: "sleep" });
  const app2 = createApp({ api, pack, storage, random: () => 0.1 });
  assert.equal(app2.view.meta.day, app.view.meta.day);
});

test("отклонённое сохранение: сообщение и новая игра", () => {
  const api = stubApi();
  const storage = memoryStorage();
  storage.setItem(saveKey("stubpack"), "{\"stub\":999}");
  const app = createApp({ api, pack, storage, random: () => 0.5 });
  assert.equal(app.ui.message?.text, S.saveRejected);
  assert.equal(app.view.meta.day, 2);
  assert.ok(app.html().includes(S.saveRejected));
});

test("заняться делом: stop.text и события в «Только что»; окно выбора блокирует", () => {
  const { app, game } = setup();
  app.handle({ act: "work" });
  assert.equal(game().log[0].type, "work_until_stop");
  assert.equal(app.ui.lastStop, "Стучат в дверь");
  const html = app.html();
  assert.ok(html.includes("Стучат в дверь"));
  assert.ok(html.includes('class="overlay"'));
  // под окном команды не уходят
  const n = game().log.length;
  for (const act of ["work", "sleep", "action", "deliver", "market-go"]) app.handle({ act, data: { id: "a_once" } });
  app.handle({ act: "choose", data: { offer: "o_board", option: "take" } });
  assert.equal(game().log.length, n, "под окном движок не вызывается");
  app.handle({ act: "choose", data: { offer: "o_now", option: "yes" } });
  assert.deepEqual(game().log.at(-1), { type: "choose_option", offer: "o_now", option: "yes" });
  assert.equal(app.view.pending_offer, null);
});

test("ошибка команды показывается сообщением, сохранение не трогается", () => {
  const { app, storage } = setup();
  const before = storage.data.get(saveKey("stubpack"));
  app.perform({ type: "deliver", obligation: "нет" });
  assert.equal(app.ui.message?.kind, "danger");
  assert.equal(storage.data.get(saveKey("stubpack")), before);
});

test("успешная команда сохраняет", () => {
  const { app, storage } = setup();
  const before = storage.data.get(saveKey("stubpack"));
  app.handle({ act: "sleep" });
  assert.notEqual(storage.data.get(saveKey("stubpack")), before);
});

test("сон → итог дня → закрытие без команды", () => {
  const { app, game } = setup();
  app.handle({ act: "sleep" });
  assert.ok(app.html().includes('class="modal summary"'));
  const n = game().log.length;
  app.handle({ act: "summary-details" });
  assert.ok(app.html().includes("Хозяйство"));
  app.handle({ act: "summary-close" });
  assert.equal(game().log.length, n);
  assert.ok(!app.html().includes('class="modal summary"'));
});

test("«Начать заново» — по второму нажатию", () => {
  const { app, api } = setup();
  app.handle({ act: "sleep" });
  app.handle({ act: "summary-close" });
  const games = api.created.length;
  app.handle({ act: "settings-open" });
  app.handle({ act: "restart" });
  assert.equal(api.created.length, games, "первое нажатие не перезапускает");
  assert.ok(app.html().includes(S.restartConfirm));
  app.handle({ act: "restart" });
  assert.equal(api.created.length, games + 1);
  assert.equal(app.view.meta.day, 2);
});

test("ожидание второго нажатия сбрасывается другим нажатием", () => {
  const { app, api } = setup();
  const games = api.created.length;
  app.handle({ act: "restart" });
  app.handle({ act: "ws-tab", data: { id: "w_one" } });
  app.handle({ act: "restart" });
  assert.equal(api.created.length, games);
});

test("отказ от заказа — по второму нажатию", () => {
  const { app, game } = setup();
  app.handle({ act: "decline", data: { id: "ob_1" } });
  assert.equal(game().log.length, 0);
  assert.ok(app.html().includes(S.declineConfirm));
  app.handle({ act: "decline", data: { id: "ob_1" } });
  assert.deepEqual(game().log[0], { type: "decline", obligation: "ob_1" });
  assert.equal(app.view.obligations.length, 0);
});

test("сдать товар", () => {
  const { app, game } = setup();
  app.handle({ act: "deliver", data: { id: "ob_1" } });
  assert.deepEqual(game().log[0], { type: "deliver", obligation: "ob_1" });
});

test("действие с одной ролью уходит сразу, с несколькими — через выбор", () => {
  const { app, game } = setup();
  app.handle({ act: "action", data: { id: "a_once" } });
  assert.deepEqual(game().log[0], { type: "do_action", action: "a_once", actor: "c_hero" });

  app.handle({ act: "action", data: { id: "a_hire" } });
  assert.equal(game().log.length, 1);
  assert.ok(app.html().includes('data-act="pick-go"'));
  app.handle({ act: "pick", data: { role: "candidate" }, value: "c_cand2" });
  app.handle({ act: "pick-go" });
  assert.deepEqual(game().log[1], { type: "do_action", action: "a_hire", actor: "c_hero", candidate: "c_cand2" });
  assert.equal(app.ui.picking, null);

  app.handle({ act: "action", data: { id: "a_teach" } });
  app.handle({ act: "pick-cancel" });
  assert.equal(app.ui.picking, null);
  assert.equal(game().log.length, 2);
});

test("поручение, снаряжение, мастерская, галочка продажи, рынок", () => {
  const { app, game } = setup();
  app.handle({ act: "assign", data: { char: "c_help" }, value: "0" });
  assert.deepEqual(game().log.at(-1), { type: "set_assignment", character: "c_help", assignment: { kind: "idle" } });
  app.handle({ act: "equip", data: { char: "c_help" }, value: "i_2" });
  assert.deepEqual(game().log.at(-1), { type: "equip", character: "c_help", item: "i_2" });
  app.handle({ act: "unequip", data: { char: "c_hero", item: "i_1" } });
  assert.deepEqual(game().log.at(-1), { type: "unequip", character: "c_hero", item: "i_1" });
  app.handle({ act: "assign-ws", data: { char: "c_help" }, value: "w_one" });
  assert.deepEqual(game().log.at(-1), { type: "assign_workshop", character: "c_help", workshop: "w_one" });
  app.handle({ act: "sell-flag", data: { id: "g_raw" }, checked: true });
  assert.deepEqual(game().log.at(-1), { type: "set_sell_flag", good: "g_raw", on: true });
  assert.equal(app.view.storage.goods[0].sell_flag, true);

  app.handle({ act: "market-raw", data: { id: "g_raw" }, value: "4" });
  app.handle({ act: "market-item", data: { id: "t_tool" }, checked: true });
  app.handle({ act: "market-go" });
  assert.deepEqual(game().log.at(-1), { type: "market_trip", buy_raw: { g_raw: 4 }, buy_items: ["t_tool"] });
  assert.deepEqual(app.ui.market, { raw: {}, keep: {}, items: [] }, "черновик закупки очищен");
});

test("без хранилища игра идёт, с предупреждением", () => {
  const api = stubApi();
  const app = createApp({ api, pack, storage: null, random: () => 0.5 });
  assert.equal(app.ui.message?.text, S.storageUnavailable);
  app.handle({ act: "sleep" });
  assert.equal(app.view.meta.day, 3);
});

test("onRender получает HTML после изменений", () => {
  const api = stubApi();
  let last = "";
  const app = createApp({ api, pack, storage: memoryStorage(), random: () => 0.5, onRender: (h) => (last = h) });
  app.handle({ act: "sleep" });
  assert.ok(last.includes('class="modal summary"'));
});

test("действие с replace: окно замены → do_action.replace; отказ ничего не шлёт", () => {
  const { app, game } = setup();
  app.handle({ act: "action", data: { id: "a_equip" } });
  assert.equal(game().log.length, 0, "сначала окно, команда не ушла");
  assert.ok(app.html().includes('class="modal replace"'));
  // под окном замены другие команды не проходят
  app.handle({ act: "work" });
  assert.equal(game().log.length, 0);
  app.handle({ act: "replace-cancel" });
  assert.equal(game().log.length, 0);
  assert.ok(!app.html().includes('class="modal replace"'));

  app.handle({ act: "action", data: { id: "a_equip" } });
  app.handle({ act: "replace-choose", data: { item: "чужое" } });
  assert.equal(game().log.length, 0, "вариант не из replace.options не отправляется");
  app.handle({ act: "replace-choose", data: { item: "i_eq2" } });
  assert.deepEqual(game().log[0], { type: "do_action", action: "a_equip", actor: "c_hero", replace: "i_eq2" });
  assert.equal(app.ui.replacing, null);
  assert.ok(!app.view.workshops[0].equipment.some((e) => e.item === "i_eq2"));
});

test("найм: кандидат из hire_pool уходит в команду, пул обновляется", () => {
  const { app, game } = setup();
  app.handle({ act: "action", data: { id: "a_hire" } });
  app.handle({ act: "pick", data: { role: "candidate" }, value: "c_cand1" });
  app.handle({ act: "pick-go" });
  assert.deepEqual(game().log[0], { type: "do_action", action: "a_hire", actor: "c_hero", candidate: "c_cand1" });
  assert.ok(!app.view.hire_pool.some((c) => c.id === "c_cand1"));
});

test("выпадающий список: открытие, выбор по data-value, закрытие нажатием мимо", () => {
  const { app } = setup();
  assert.equal(app.handle({ act: "dd", data: { key: "k1" } }), true);
  assert.equal(app.ui.dd, "k1");
  assert.equal(app.handle({ act: "dd", data: { key: "k1" } }), true);
  assert.equal(app.ui.dd, null, "второе нажатие закрывает");
  app.handle({ act: "dd", data: { key: "k2" } });
  assert.equal(app.handle({ act: "dd-close" }), true);
  assert.equal(app.ui.dd, null);
  assert.equal(app.handle({ act: "dd-close" }), false, "закрытый список не перерисовывается");
});

test("поле закупки: нецифры отбрасываются, ввод перерисовывает экран", () => {
  const { app } = setup();
  assert.equal(app.handle({ act: "market-raw", data: { id: "g_raw" }, value: "1a2" }), true);
  assert.equal(app.ui.market.raw.g_raw, 12);
  app.handle({ act: "market-raw", data: { id: "g_raw" }, value: "" });
  assert.equal(app.ui.market.raw.g_raw, undefined);
});

test("«поддерживать количество»: запоминается, переживает перезапуск", () => {
  const { api, storage, app } = setup();
  app.handle({ act: "market-keep", data: { id: "g_raw" }, value: "7" });
  assert.equal(app.ui.market.keep.g_raw, 7);
  app.handle({ act: "market-keep", data: { id: "g_raw" }, value: "" });
  assert.equal(app.ui.market.keep.g_raw, null, "очищенное поле");
  app.handle({ act: "market-keep", data: { id: "g_raw" }, value: "12" });
  const again = createApp({ api, pack, storage, random: () => 0.5 });
  assert.equal(again.ui.market.keep.g_raw, 12);
});

test("итог дня: суммы накапливаются по дням, один день не считается дважды", () => {
  const { app } = setup();
  app.handle({ act: "sleep" });
  assert.equal(app.ui.totals.expense, 3);
  assert.equal(app.ui.totals.day, app.view.meta.day);
  app.handle({ act: "summary-details" });
  app.handle({ act: "summary-close" });
  assert.equal(app.ui.totals.expense, 3, "закрытие и перерисовка не прибавляют");
  app.handle({ act: "sleep" });
  assert.equal(app.ui.totals.expense, 6);
  const html = app.html();
  assert.ok(html.includes("<b>3</b> за день, всего <b>6</b>"));
  assert.ok(!html.includes("Новое утро"), "утренних строк нет");
  assert.ok(/class="delta minus">-3</.test(html), "изменение за день под деньгами, красным");
});

test("принятие заказа снимает флажок продажи с нужных товаров", () => {
  const { app, game } = setup();
  game().v.board[0].options[0].cost = [{ name: "Изделие", need: 2, have: 3 }];
  app.handle({ act: "sell-flag", data: { id: "g_raw" }, checked: true }); // обновить вид приложения
  app.handle({ act: "sell-flag", data: { id: "g_raw" }, checked: false });
  assert.equal(app.view.storage.goods.find((g) => g.id === "g_prod")?.sell_flag, true);
  app.handle({ act: "choose", data: { offer: "o_board", option: "take" } });
  assert.ok(game().log.some((c) => c.type === "set_sell_flag" && c.good === "g_prod" && !c.on));
  assert.equal(app.view.storage.goods.find((g) => g.id === "g_prod")?.sell_flag, false);
});

test("принятие заказа снимает с продажи товар, который заказ требует", () => {
  const { app, api } = setup();
  const g = api.created[0];
  g.v.storage.goods[1].sell_flag = true;
  const name = g.v.storage.goods[1].name;
  const id = g.v.storage.goods[1].id;
  // выбор объявления на доске: после него появляется заказ, требующий этот товар
  const perform = g.perform.bind(g);
  g.perform = (cmd) => {
    const r = perform(cmd);
    if (cmd.type === "choose_option" && r.ok) {
      g.v.obligations.push({ id: "ob_new", title: "Новый", days_left: 2, requires: [{ name, need: 1, have: 3 }], can_deliver: true });
      r.view = g.view();
    }
    return r;
  };
  app.handle({ act: "choose", data: { offer: "o_board", option: "take" } });
  assert.equal(g.v.storage.goods.find((x) => x.id === id)!.sell_flag, false);
});
