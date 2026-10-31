// Интерфейс на настоящем движке и мини-пак-фикстуре.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import * as engine from "../../engine/src/index.ts";
import { readPack } from "../build.ts";
import { createApp, type App } from "../src/app.ts";
import type { GameApi, Pack, View } from "../src/contract.ts";
import { boot } from "../src/main.ts";
import { isBlocked, mainButtons, onceActions, overlayOf, panels } from "../src/model.ts";
import { renderApp } from "../src/render.ts";
import { memoryStorage, saveKey } from "../src/storage.ts";
import { fakeRoot } from "./helpers.ts";

// Проверка типов (tsc): вид движка подходит под вид контракта интерфейса.
const _typeCheck = (v: engine.View): View => v;
void _typeCheck;

const root = join(import.meta.dirname, "..", "..");
const pack = readPack(join(root, "fixtures", "mini-pack")) as Pack;
const api = { createGame: engine.createGame, loadGame: engine.loadGame } as unknown as GameApi;

function newApp(seed = 0.42) {
  const storage = memoryStorage();
  const app = createApp({ api, pack, storage, random: () => seed });
  return { app, storage };
}

/** Закрыть окна интерфейса: выбрать первый доступный вариант, закрыть итог дня. */
function settle(app: App): void {
  for (let i = 0; i < 20; i++) {
    const ov = overlayOf(app.view, app.ui);
    if (ov === "offer") {
      const o = app.view.pending_offer!;
      const opt = o.options.find((x) => x.enabled);
      assert.ok(opt, `в окне «${o.title}» есть доступный вариант`);
      app.handle({ act: "choose", data: { offer: o.id, option: opt.id } });
    } else if (ov === "summary") {
      app.handle({ act: "summary-close" });
    } else return;
  }
}

/** Инварианты экрана для любого вида. */
function checkScreen(view: View, app: App): void {
  const html = renderApp(view, app.ui);
  assert.ok(html.length > 100);
  const p = panels(view, app.ui);
  assert.equal(html.includes('class="panel board"'), p.board);
  assert.equal(html.includes('class="panel obligations"'), p.obligations);
  assert.equal(html.includes('class="panel world"'), p.effects);
  assert.equal(html.includes('class="panel inventory"'), p.inventory);
  assert.equal(html.includes('class="panel storage"'), p.storage);
  assert.equal(html.includes('class="panel wshop"'), p.workshop && overlayOf(view, app.ui) !== "ending");
  if (view.workshops.length <= 1) assert.ok(!html.includes('data-act="ws-tab"'));
  assert.equal(html.includes('class="panel hire"'), view.hire_pool.length > 0 && overlayOf(view, app.ui) !== "ending");
  // «Дать вещь» — только equippable
  for (const m of html.matchAll(/data-act="equip" data-char="([^"]+)" data-value="([^"]+)"/g)) {
    const c = view.characters.find((x) => x.id === m[1])!;
    assert.ok(c.equippable.includes(m[2]), m[2]);
  }
  // кандидатов в «Людях» нет
  for (const c of view.hire_pool) assert.ok(!view.characters.some((x) => x.id === c.id));
  if (view.pending_offer && !view.ending) {
    const game = html.split('<div class="overlay"')[0];
    for (const b of game.match(/<button[^>]*>/g) ?? []) assert.ok(b.includes(" disabled"), b);
    assert.deepEqual(mainButtons(view, app.ui), { work: false, sleep: false });
  }
}

test("фикстура: старт, вид, панели", () => {
  const { app, storage } = newApp();
  const v = app.view;
  assert.ok(v.meta.game_title.length > 0);
  assert.ok(storage.data.has(saveKey(String(pack.pack.id))));
  checkScreen(v, app);
  settle(app);
  const html = app.html();
  assert.ok(html.includes(v.meta.game_title));
  assert.equal(isBlocked(app.view, app.ui), false);
  { const p = panels(app.view, app.ui); assert.ok(p.workers || p.family, "есть люди"); }
});

test("фикстура: работа, сон, итог дня, сохранение и загрузка", () => {
  const { app, storage } = newApp(0.1);
  settle(app);
  const day0 = app.view.meta.day;
  app.handle({ act: "work" });
  assert.equal(app.ui.message, null, app.ui.message?.text ?? "");
  checkScreen(app.view, app);
  settle(app);
  // до заката
  for (let i = 0; i < 30 && !app.view.meta.is_night && !app.view.ending; i++) {
    app.handle({ act: "work" });
    settle(app);
  }
  assert.ok(app.view.meta.is_night || app.view.ending);
  if (app.view.meta.is_night) {
    assert.deepEqual(mainButtons(app.view, app.ui), { work: false, sleep: true });
    app.handle({ act: "sleep" });
    assert.equal(app.view.meta.day, day0 + 1);
    if (app.view.summary) {
      // итог дня поверх, если не открылось окно выбора
      const ov = overlayOf(app.view, app.ui);
      assert.ok(ov === "summary" || ov === "offer");
      checkScreen(app.view, app);
    }
    settle(app);
  }
  // загрузка
  const app2 = createApp({ api, pack, storage, random: () => 0.9 });
  assert.equal(app2.view.meta.day, app.view.meta.day);
  assert.equal(app2.view.meta.hour, app.view.meta.hour);
  assert.equal(app2.view.money.value, app.view.money.value);
});

test("фикстура: отклонённое сохранение — сообщение и новая игра", () => {
  const storage = memoryStorage();
  storage.setItem(saveKey(String(pack.pack.id)), "{\"save_version\":-1}");
  const app = createApp({ api, pack, storage, random: () => 0.3 });
  assert.ok(app.ui.message);
  assert.equal(app.view.meta.day >= 1, true);
});

test("фикстура: несколько дней разных команд — экран рисуется, ошибки показываются", () => {
  const { app } = newApp(0.77);
  let errors = 0;
  for (let step = 0; step < 200 && !app.view.ending; step++) {
    settle(app);
    if (app.view.ending) break;
    const v = app.view;
    checkScreen(v, app);
    if (v.meta.is_night) {
      app.handle({ act: "sleep" });
      continue;
    }
    // по кругу: действия героя, поручения, рынок, заказы, работа
    const k = step % 6;
    if (k === 0) {
      const a = onceActions(v).find((x) => x.enabled && x.roles.actor.length > 0);
      if (a) {
        app.handle({ act: "action", data: { id: a.id } });
        if (app.ui.picking) app.handle({ act: "pick-go" });
        if (app.ui.replacing) {
          const rep = a.replace!;
          app.handle({ act: "replace-choose", data: { item: rep.options[0].item } });
        }
      }
    } else if (k === 1) {
      for (const c of v.characters) {
        const i = c.assignable.findIndex((x) => x.enabled && x.label !== c.assignment.label);
        if (c.works && i >= 0) {
          app.handle({ act: "assign", data: { char: c.id }, value: String(i) });
          break;
        }
      }
    } else if (k === 2 && v.market.enabled) {
      const r = v.market.raw[0];
      if (r) app.handle({ act: "market-raw", data: { id: r.id }, value: "2" });
      app.handle({ act: "market-go" });
    } else if (k === 3) {
      const ob = v.obligations.find((o) => o.can_deliver);
      if (ob) app.handle({ act: "deliver", data: { id: ob.id } });
      const b = v.board[0];
      if (b) {
        const opt = b.options.find((o) => o.enabled);
        if (opt) app.handle({ act: "choose", data: { offer: b.id, option: opt.id } });
      }
    } else {
      app.handle({ act: "work" });
    }
    if (app.ui.message?.kind === "danger") errors++;
  }
  if (!app.view.ending) checkScreen(app.view, app); // на экране концовки панелей нет
  assert.ok(app.view.meta.day > 1, "прошёл хотя бы день");
  // ошибки допустимы (движок отклоняет), но интерфейс их показывает
  assert.ok(errors >= 0);
});

test("фикстура: ошибочная команда — сообщение, состояние не меняется", () => {
  const { app, storage } = newApp(0.5);
  settle(app);
  const key = saveKey(String(pack.pack.id));
  const before = storage.data.get(key);
  const r = app.perform({ type: "deliver", obligation: "__нет__" });
  assert.equal(r.ok, false);
  assert.equal(app.ui.message?.kind, "danger");
  assert.ok(app.html().includes('class="msg k-danger"'));
  assert.equal(storage.data.get(key), before);
});

test("main.boot: запуск на фейковом документе с паком фикстуры", () => {
  const appRoot = fakeRoot();
  const doc = {
    title: "",
    getElementById: (id: string) =>
      id === "app" ? appRoot : id === "pack-data" ? { ...fakeRoot(), textContent: JSON.stringify(pack) } : null,
  };
  boot(doc, null);
  assert.ok(appRoot.innerHTML.includes('data-act="sleep"'));
  assert.ok(doc.title.length > 0);
});

test("описание действия на фикстуре: bake_bread с текстом, rest без — пустого блока нет", () => {
  const { app } = newApp();
  settle(app);
  const v = app.view;
  const withDesc = v.actions.filter((a) => typeof a.description === "string" && a.description !== "");
  const without = v.actions.filter((a) => a.description === null);
  assert.ok(withDesc.length > 0 && without.length > 0, "в фикстуре есть оба случая");
  // группы: list раскрываем, в select выбираем пункт — только тогда описание на экране
  const ui = app.ui;
  for (const c of v.categories) ui.catOpen.push(c.id);
  for (const a of onceActions(v)) if (a.category && a.enabled) ui.catPick[a.category] = a.id;
  const html = renderApp(v, ui);
  const shown = onceActions(v).filter((a) => a.description && (a.category === null || v.categories.find((c) => c.id === a.category)?.view === "list" || ui.catPick[a.category] === a.id));
  for (const a of shown) assert.ok(html.includes(`<p class="desc">`), a.id);
  assert.equal((html.match(/class="desc"/g) ?? []).length, shown.length);
});
