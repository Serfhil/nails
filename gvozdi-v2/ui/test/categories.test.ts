import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import type { Pack, View } from "../src/contract.ts";
import { groupActions, initialUi } from "../src/model.ts";
import { renderApp } from "../src/render.ts";
import { memoryStorage } from "../src/storage.ts";
import { fullView, stubApi, type StubGame } from "../src/stub.ts";

const pack = { pack: { id: "stubpack" } } as Pack;

/** Вид с двумя группами (select, list), пустой группой и действиями без категории. */
function catView(): View {
  const v = fullView();
  const byId = (id: string) => v.actions.find((a) => a.id === id)!;
  byId("a_once").category = "c_sel";
  byId("a_off").category = "c_sel";
  byId("a_teach").category = "c_list";
  byId("a_hire").category = "c_list";
  v.categories = [
    { id: "c_list", name: "Список", view: "list" },
    { id: "c_empty", name: "Пустая", view: "select" },
    { id: "c_sel", name: "Выбор", view: "select" },
  ];
  return v;
}

function setup() {
  const api = stubApi(catView);
  const app = createApp({ api, pack, storage: memoryStorage(), random: () => 0.5 });
  const game = () => api.created[api.created.length - 1] as StubGame;
  return { app, game };
}

test("группы идут в порядке categories, пустые не показываются, без категории — вне групп", () => {
  const g = groupActions(catView());
  assert.deepEqual(g.groups.map((x) => x.category.id), ["c_list", "c_sel"]);
  assert.deepEqual(g.ungrouped.map((a) => a.id), ["a_equip"]);
  const html = renderApp(catView(), initialUi());
  assert.ok(!html.includes("Пустая"));
  assert.ok(html.includes("Поставить станок"), "действие без категории видно сразу");
  assert.ok(html.indexOf("Список") < html.indexOf("Выбор"));
});

test("число доступных в заголовке группы", () => {
  const g = groupActions(catView());
  assert.equal(g.groups[0].available, 2);
  assert.equal(g.groups[1].available, 1);
  const html = renderApp(catView(), initialUi());
  assert.ok(html.includes("Список (2)"));
  assert.ok(html.includes("Выбор (1)"));
});

test("list: по умолчанию свёрнут, можно открыть несколько", () => {
  const v = catView();
  v.actions.find((a) => a.id === "a_equip")!.category = "c_empty";
  const { app } = setup();
  assert.ok(!app.html().includes("Научить"), "свёрнут");
  app.handle({ act: "cat-fold", data: { id: "c_list" } });
  assert.ok(app.html().includes("Научить"));
  app.handle({ act: "cat-fold", data: { id: "c_empty" } });
  assert.deepEqual(app.ui.catOpen, ["c_list", "c_empty"]);
  app.handle({ act: "cat-fold", data: { id: "c_list" } });
  assert.ok(!app.html().includes("Научить"));
});

test("select: недоступный виден с причиной, но не выбирается; выбранный подтягивает описание, расход и кнопку", () => {
  const { app, game } = setup();
  let html = app.html();
  assert.ok(html.includes("Недоступное — Нужно больше сырья"), "недоступный пункт виден с причиной");
  assert.ok(!html.includes("Описание &lt;штуки&gt;"), "пока ничего не выбрано");
  // недоступный выбрать нельзя
  assert.match(html, /data-value="a_off"[^>]*disabled/);
  assert.equal(app.handle({ act: "cat-pick", data: { cat: "c_sel" }, value: "a_off" }), false);
  assert.equal(app.ui.catPick.c_sel, undefined);
  // доступный выбирается
  assert.equal(app.handle({ act: "cat-pick", data: { cat: "c_sel" }, value: "a_once" }), true);
  html = app.html();
  assert.ok(html.includes("Описание &lt;штуки&gt;"));
  assert.ok(html.includes("Сырьё 1"));
  app.handle({ act: "action", data: { id: "a_once" } });
  assert.deepEqual(game().log.at(-1), { type: "do_action", action: "a_once", actor: "c_hero" });
});

test("состояние раскрытия и выбора не теряется после команды", () => {
  const { app } = setup();
  app.handle({ act: "cat-fold", data: { id: "c_list" } });
  app.handle({ act: "cat-pick", data: { cat: "c_sel" }, value: "a_once" });
  app.handle({ act: "action", data: { id: "a_once" } });
  app.handle({ act: "sleep" });
  app.handle({ act: "summary-close" });
  const html = app.html();
  assert.ok(html.includes("Научить"), "группа осталась раскрытой");
  assert.ok(html.includes("Описание &lt;штуки&gt;"), "выбор сохранился");
});

test("выбор, которого больше нет в виде, сбрасывается без ошибки", () => {
  const { app } = setup();
  app.handle({ act: "cat-pick", data: { cat: "c_sel" }, value: "a_once" });
  const v = catView();
  v.actions = v.actions.filter((a) => a.id !== "a_once");
  assert.doesNotThrow(() => renderApp(v, app.ui));
  assert.ok(!renderApp(v, app.ui).includes("Описание &lt;штуки&gt;"));
});

test("без категорий в виде всё идёт плоским списком", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  assert.ok(!html.includes("cat-select") && !html.includes("cat-list"));
  assert.ok(html.includes("Сделать штуку"));
});
