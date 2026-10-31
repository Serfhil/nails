// Окно «Настройки» и выбор пака (view.md 3.1, 3.14), список паков сборки, сохранения разных паков.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import type { Pack } from "../src/contract.ts";
import { mount } from "../src/dom.ts";
import { initialUi, overlayOf } from "../src/model.ts";
import { packsForView, parsePackList, type PackEntry } from "../src/packs.ts";
import { renderApp } from "../src/render.ts";
import { memoryStorage, saveKey, uiKey } from "../src/storage.ts";
import { fullView, sampleOffer, stubApi } from "../src/stub.ts";
import { S } from "../src/strings.ts";
import { el, fakeRoot } from "./helpers.ts";

const pack = { pack: { id: "stubpack" } } as Pack;
const list: PackEntry[] = [
  { id: "stubpack", name: "Заглушка", version: "0.0.1", description: "Описание заглушки.", url: "index.html" },
  { id: "other", name: "Другой пак", version: "2.1.0", description: null, url: "packs/other/index.html" },
];

function setup(packs?: PackEntry[]) {
  const api = stubApi();
  const storage = memoryStorage();
  const app = createApp({ api, pack, packs, storage, random: () => 0.5 });
  return { api, storage, app };
}

test("шапка: кнопка настроек вместо «Начать заново»", () => {
  const html = renderApp(fullView(), initialUi());
  assert.ok(html.includes('data-act="settings-open"'));
  assert.ok(html.includes(S.settings));
  assert.ok(!html.includes('data-act="restart"'), "в шапке нет «Начать заново»");
});

test("кнопка настроек неактивна, пока открыто другое окно", () => {
  const v = fullView();
  v.pending_offer = sampleOffer();
  const html = renderApp(v, initialUi());
  assert.match(html, /data-act="settings-open"[^>]*disabled/);
  const { app } = setup();
  assert.equal(app.handle({ act: "settings-open" }), true);
  assert.equal(overlayOf(app.view, app.ui), "settings");
  assert.equal(app.handle({ act: "settings-open" }), false, "уже открыто — повторно не открывается");
});

test("окно: название, версия, описание; «Начать заново» и выбор пака", () => {
  const ui = { ...initialUi(), settings: true };
  const v = fullView();
  const html = renderApp(v, ui, list);
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('data-backdrop="settings-close"'), "тап мимо закрывает");
  assert.ok(html.includes('data-act="settings-close"'), "крестик");
  assert.ok(html.includes(v.meta.game_title));
  assert.ok(html.includes(v.meta.pack_version));
  assert.ok(html.includes(v.meta.pack_description!));
  assert.ok(html.includes('data-act="restart"'));
  assert.ok(html.includes(S.packChoose));
  // текущий отмечен и не ссылка; другой — ссылка на свою страницу
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes(S.packCurrent));
  assert.ok(html.includes('href="packs/other/index.html"'));
  assert.ok(!html.includes('href="index.html"'), "на текущий пак ссылки нет");
  assert.ok(html.includes("Другой пак") && html.includes("2.1.0"));
  // игра под окном неактивна
  assert.ok(html.includes('<main class="game" aria-hidden="true" inert'));
});

test("описание null — не рисуется", () => {
  const v = fullView();
  v.meta.pack_description = null;
  const html = renderApp(v, { ...initialUi(), settings: true }, []);
  const about = html.slice(html.indexOf('class="about"'), html.indexOf('data-act="restart"'));
  assert.ok(about.length > 0);
  assert.ok(!about.includes("<p"), "пустого описания нет");
});

test("пак один (списка нет) — в выборе всё равно один пункт, текущий", () => {
  const v = fullView();
  const items = packsForView(v, []);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, v.meta.pack_id);
  const html = renderApp(v, { ...initialUi(), settings: true });
  assert.equal((html.match(/class="pack[ "]/g) ?? []).length, 1);
  assert.ok(html.includes('aria-current="page"'));
});

test("«Начать заново» в окне — по второму нажатию; прочие нажатия окно не пропускает", () => {
  const { app, api } = setup(list);
  app.handle({ act: "summary-close" });
  app.handle({ act: "settings-open" });
  const games = api.created.length;
  const day = app.view.meta.day;
  app.handle({ act: "sleep" });
  assert.equal(app.view.meta.day, day, "команды игры заблокированы окном");
  app.handle({ act: "restart" });
  assert.equal(api.created.length, games);
  assert.ok(app.html().includes(S.restartConfirm));
  app.handle({ act: "restart" });
  assert.equal(api.created.length, games + 1);
  assert.equal(app.ui.settings, false, "после перезапуска окно закрыто");
});

test("закрытие крестиком и тапом мимо (через DOM)", () => {
  const api = stubApi();
  const root = fakeRoot();
  const app = mount(root, { api, pack, packs: list, storage: memoryStorage(), random: () => 0.5 });
  app.handle({ act: "summary-close" });
  root.fire("click", el("BUTTON", { act: "settings-open" }));
  assert.ok(root.innerHTML.includes('data-backdrop="settings-close"'));
  root.fire("click", el("BUTTON", { act: "settings-close" }));
  assert.ok(!root.innerHTML.includes('data-backdrop'), "крестик закрыл");
  root.fire("click", el("BUTTON", { act: "settings-open" }));
  // тап по самому фону окна
  root.fire("click", el("DIV", { backdrop: "settings-close" }));
  assert.ok(!root.innerHTML.includes('data-backdrop'), "тап мимо закрыл");
  // тап по содержимому окна (не кнопка) окно не закрывает
  root.fire("click", el("BUTTON", { act: "settings-open" }));
  const inside = { tagName: "P", dataset: {}, closest: () => null };
  root.fire("click", inside);
  assert.ok(root.innerHTML.includes('data-backdrop'), "тап внутри окна не закрывает");
});

test("перезапуск не трогает сохранения других паков", () => {
  const { app, storage } = setup(list);
  storage.setItem(saveKey("other"), "чужое сохранение");
  storage.setItem(uiKey("other"), "чужое состояние");
  app.handle({ act: "settings-open" });
  app.handle({ act: "restart" });
  app.handle({ act: "restart" });
  assert.equal(storage.getItem(saveKey("other")), "чужое сохранение");
  assert.equal(storage.getItem(uiKey("other")), "чужое состояние");
  assert.ok(storage.data.has(saveKey("stubpack")));
});

test("разбор вложенного списка паков", () => {
  assert.deepEqual(parsePackList(null), []);
  assert.deepEqual(parsePackList("не json"), []);
  assert.deepEqual(parsePackList("{}"), []);
  const got = parsePackList(JSON.stringify([{ id: "a", name: "А", version: "1", description: "", url: "x/index.html" }, { name: "без id" }]));
  assert.deepEqual(got, [{ id: "a", name: "А", version: "1", description: null, url: "x/index.html" }]);
});
