import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionEnabled,
  directCommand,
  initialUi,
  isBlocked,
  mainButtons,
  marketCommand,
  needsPicker,
  onceActions,
  overlayOf,
  panels,
  pickingCommand,
  startPicking,
  equipOptions,
  replaceCommand,
  saleValue,
  marketPlan,
  type UiState,
} from "../src/model.ts";
import { renderApp } from "../src/render.ts";
import { emptyView, fullView, sampleOffer } from "../src/stub.ts";
import type { View } from "../src/contract.ts";

/** Состояние с раскрытыми «Параметрами» и «Личным инвентарём» у всех людей. */
function opened(v: View): UiState {
  return { ...initialUi(), open: v.characters.flatMap((c) => [`p:${c.id}:vars`, `p:${c.id}:inv`]) };
}

test("пустой вид: все панели скрыты", () => {
  const v = emptyView();
  const p = panels(v, initialUi());
  for (const [k, on] of Object.entries(p)) assert.equal(on, false, `панель ${k} должна быть скрыта`);
  const html = renderApp(v, initialUi());
  for (const cls of ["actions", "notes", "obligations", "board", "workers", "family", "hire", "wshop", "storage", "market", "inventory", "world", "now"]) {
    assert.ok(!html.includes(`class="panel ${cls}"`), `в HTML не должно быть панели ${cls}`);
  }
  assert.ok(!html.includes('class="stress'), "стресса нет");
  assert.ok(html.includes('data-act="sleep"'), "кнопка сна есть всегда");
  assert.ok(!html.includes('data-act="work"'), "«Заняться делом» временно скрыта");
});

test("полный вид: все панели видны, вкладок мастерской при одной нет", () => {
  const v = fullView();
  const ui = initialUi();
  ui.lastEvents = [{ text: "x", kind: "info" }];
  const p = panels(v, ui);
  const { workshopTabs, ...rest } = p;
  for (const [k, on] of Object.entries(rest)) assert.equal(on, true, `панель ${k} должна быть видна`);
  assert.equal(workshopTabs, false);
  const html = renderApp(v, ui);
  for (const cls of ["actions", "notes", "obligations", "board", "workers", "family", "hire", "wshop", "storage", "market", "inventory", "world", "now"]) {
    assert.ok(html.includes(`class="panel ${cls}"`), `панель ${cls} есть`);
  }
  assert.ok(!html.includes('data-act="ws-tab"'));
  assert.ok(!html.includes('data-act="assign-ws"'), "выбора мастерской нет при одной");
});

test("каждая панель исчезает по отдельности при пустых данных", () => {
  const cases: [keyof ReturnType<typeof panels>, (v: ReturnType<typeof fullView>) => void][] = [
    ["notifications", (v) => (v.notifications = [])],
    ["actions", (v) => (v.actions = v.actions.filter((a) => a.mode === "assignable"))],
    ["workers", (v) => (v.characters = v.characters.filter((c) => !c.works))],
    ["family", (v) => (v.characters = v.characters.filter((c) => c.works))],
    ["hire", (v) => (v.hire_pool = [])],
    ["workshop", (v) => (v.workshops = [])],
    ["inventory", (v) => (v.inventory = [])],
    ["board", (v) => (v.board = [])],
    ["obligations", (v) => (v.obligations = [])],
    ["effects", (v) => (v.effects = [])],
    ["stress", (v) => (v.stress = null)],
  ];
  for (const [k, clear] of cases) {
    const v = fullView();
    clear(v);
    assert.equal(panels(v, initialUi())[k], false, k);
  }
  const v = fullView();
  v.storage.goods = [];
  v.market.raw = [];
  v.market.shop = [];
  assert.equal(panels(v, initialUi()).storage, false);
  assert.equal(panels(v, initialUi()).market, false);
});

test("две мастерские: вкладки и выбор мастерской у работников", () => {
  const v = fullView();
  v.workshops.push({ ...v.workshops[0], id: "w_two", name: "Вторая" });
  const html = renderApp(v, initialUi());
  assert.equal(panels(v, initialUi()).workshopTabs, true);
  assert.equal((html.match(/data-act="ws-tab"/g) ?? []).length, 2);
  assert.ok(html.includes('data-act="assign-ws"'));
});

test("окно выбора блокирует всё остальное", () => {
  const v = fullView();
  v.pending_offer = sampleOffer();
  const ui = initialUi();
  assert.equal(overlayOf(v, ui), "offer");
  assert.equal(isBlocked(v, ui), true);
  assert.deepEqual(mainButtons(v, ui), { work: false, sleep: false });
  for (const a of onceActions(v)) assert.equal(actionEnabled(v, ui, a), false);
  const html = renderApp(v, ui);
  const [game, modal] = html.split('<div class="overlay"');
  assert.ok(modal, "окно есть");
  assert.ok(game.includes("inert"), "игра под окном неактивна");
  // все кнопки и поля под окном отключены
  const btns = game.match(/<button[^>]*>/g) ?? [];
  assert.ok(btns.length > 5);
  for (const b of btns) assert.ok(b.includes(" disabled"), `кнопка под окном должна быть отключена: ${b}`);
  for (const s of game.match(/<input[^>]*>/g) ?? []) assert.ok(s.includes(" disabled"), s);
  // в окне: доступный вариант активен, недоступный серый с причиной и ценой
  assert.match(modal, /data-option="yes"(?![^>]*disabled)/);
  assert.match(modal, /data-option="pay"[^>]*disabled/);
  assert.ok(modal.includes("Мало денег"));
  assert.ok(modal.includes("нужно 100, есть 42"));
});

test("ночью активен только сон", () => {
  const v = fullView();
  v.meta.is_night = true;
  v.actions.forEach((a) => ((a.enabled = false), (a.reason = "ночь")));
  const mb = mainButtons(v, initialUi());
  assert.deepEqual(mb, { work: false, sleep: true });
});

test("итог дня показывается после сна до закрытия", () => {
  const v = fullView();
  v.summary = { title: "Итог", money_morning: 40, delta: -2, income: [], expense: [{ source: "s", label: "Хоз", amount: 2 }], morning: [] };
  const ui = initialUi();
  assert.equal(overlayOf(v, ui), "summary");
  ui.summaryClosedDay = v.meta.day;
  assert.equal(overlayOf(v, ui), null);
  v.meta.day += 1;
  assert.equal(overlayOf(v, ui), "summary");
});

test("концовка главнее всего", () => {
  const v = fullView();
  v.pending_offer = sampleOffer();
  v.ending = { title: "Конец", text: "Всё.", tag: "goal" };
  assert.equal(overlayOf(v, initialUi()), "ending");
  const html = renderApp(v, initialUi());
  assert.ok(html.includes('class="ending'));
  assert.equal((html.match(/<button/g) ?? []).length, 1, "только «Начать заново»");
  assert.ok(html.includes('data-act="restart"'));
});

test("выбор участников действия", () => {
  const v = fullView();
  const once = v.actions.find((a) => a.id === "a_once")!;
  const teach = v.actions.find((a) => a.id === "a_teach")!;
  const hire = v.actions.find((a) => a.id === "a_hire")!;
  assert.equal(needsPicker(once), false);
  assert.deepEqual(directCommand(v, once), { type: "do_action", action: "a_once", actor: "c_hero" });
  assert.equal(needsPicker(teach), true);
  assert.equal(directCommand(v, teach), null);
  const p = startPicking(v, hire);
  p.candidate = "c_cand2";
  assert.deepEqual(pickingCommand(hire, p), { type: "do_action", action: "a_hire", actor: "c_hero", candidate: "c_cand2" });
  p.candidate = "чужой";
  assert.equal(pickingCommand(hire, p), null);
  assert.deepEqual(pickingCommand(teach, startPicking(v, teach)), { type: "do_action", action: "a_teach", actor: "c_hero", partner: "c_help" });
});

test("описание действия: показано при строке, при null ничего не рисуется", () => {
  const v = fullView();
  const withDesc = v.actions.find((a) => a.id === "a_once")!;
  assert.ok(withDesc.description);
  const html = renderApp(v, initialUi());
  assert.equal((html.match(/class="desc"/g) ?? []).length, 1, "только у действия с описанием");
  assert.ok(html.includes('<p class="desc">Описание &lt;штуки&gt; &amp; пояснение.</p>'), "текст экранирован");
  assert.ok(!html.includes("<p class=\"desc\"></p>"), "пустых блоков нет");
  v.actions.forEach((a) => (a.description = null));
  assert.ok(!renderApp(v, initialUi()).includes('class="desc"'), "при null описаний нет вовсе");
});

test("недоступное действие: серое с причиной и расходом", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  assert.match(html, /data-id="a_off"[^>]*disabled/);
  assert.ok(/<li class="action off" title="[^"]*Нужно больше сырья[^"]*нужно 9, есть 5/.test(html), "условия — в подсказке");
  assert.ok(!html.includes('class="reason">Нужно больше сырья'), "подписи условий под делом нет");
  const actions = html.slice(html.indexOf('class="panel actions"'));
  assert.ok(!actions.slice(0, actions.indexOf("</section>")).includes('class="cost"'), "строк расхода под делом нет");
  assert.ok(!html.includes('data-id="a_assign"'), "назначаемое действие не среди разовых");
});

test("стресс с предупреждением выделен сургучом", () => {
  const v = fullView();
  v.stress!.warning = true;
  assert.ok(renderApp(v, initialUi()).includes('class="stress warn"'));
});

test("команда рынка: только положительные количества и доступные предметы", () => {
  const v = fullView();
  const ui = initialUi();
  ui.market.raw = { g_raw: 3, unknown: 5 };
  ui.market.items = ["t_tool", "t_big"];
  assert.deepEqual(marketCommand(v, ui), { type: "market_trip", buy_raw: { g_raw: 3 }, buy_items: ["t_tool"] });
});

test("переменные: показывается готовая строка display, подпись роли и название слота — из вида", () => {
  const v = fullView();
  const html = renderApp(v, opened(v));
  assert.ok(!renderApp(v, initialUi()).includes(">15%<"), "свёрнутые параметры не выводятся");
  assert.ok(html.includes(">15%<"), "display, а не value");
  assert.ok(!html.includes(">0,15<"));
  assert.ok(html.includes("Хозяин заглушки"), "role_name");
  assert.ok(html.includes("Рука:"), "slot_name");
  v.characters[0].role_name = null;
  assert.ok(!renderApp(v, opened(v)).includes("Хозяин заглушки"));
});

test("экранирование текстов вида", () => {
  const v = fullView();
  v.notifications = [{ text: "<script>alert(1)</script>", kind: "info" }];
  const html = renderApp(v, initialUi());
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("кандидаты найма — панель по hire_pool, имена в выборе кандидата", () => {
  const v = fullView();
  const html = renderApp(v, { ...initialUi(), picking: startPicking(v, v.actions.find((a) => a.id === "a_hire")!) });
  const people = html.slice(html.indexOf('class="panel workers"'), html.indexOf('class="panel hire"'));
  assert.ok(!people.includes("Кандидат Один"));
  assert.ok(html.slice(html.indexOf('class="panel hire"')).includes("Кандидат Один"));
  assert.ok(html.includes('data-act="pick" data-role="candidate" data-value="c_cand2"'));
  assert.ok(html.includes(">Кандидат Два</button>"));
});

test("«Дать вещь» предлагает только equippable", () => {
  const v = fullView();
  const help = v.characters.find((c) => c.id === "c_help")!;
  assert.deepEqual(equipOptions(v, help).map((i) => i.item), ["i_2"]);
  const hero = v.characters.find((c) => c.id === "c_hero")!;
  assert.deepEqual(equipOptions(v, hero), []);
  const html = renderApp(v, opened(v));
  const opts = html.match(/<button[^>]*data-act="equip"[^>]*>/g) ?? [];
  assert.equal(opts.length, 1, "вариант только тому, кому есть что дать");
  assert.ok(opts[0].includes('data-char="c_help"'));
  assert.ok(opts[0].includes('data-value="i_2"'));
  assert.ok(!html.includes('data-value="i_3"'), "чужой вещи нет");
});

test("окно замены оборудования блокирует всё и даёт выбор и отказ", () => {
  const v = fullView();
  const ui = initialUi();
  ui.replacing = { action: "a_equip", cmd: { type: "do_action", action: "a_equip", actor: "c_hero" } };
  assert.equal(overlayOf(v, ui), "replace");
  assert.equal(isBlocked(v, ui), true);
  const html = renderApp(v, ui);
  const [game, modal] = html.split('<div class="overlay"');
  for (const b of game.match(/<button[^>]*>/g) ?? []) assert.ok(b.includes(" disabled"), b);
  assert.ok(modal.includes("Места нет: что-то придётся убрать."));
  assert.ok(modal.includes('data-act="replace-choose" data-item="i_eq"'));
  assert.ok(modal.includes('data-act="replace-choose" data-item="i_eq2"'));
  assert.ok(modal.includes('data-act="replace-cancel"'));
  assert.deepEqual(replaceCommand(v, ui.replacing, "i_eq2"), { type: "do_action", action: "a_equip", actor: "c_hero", replace: "i_eq2" });
  assert.equal(replaceCommand(v, ui.replacing, "чужое"), null);
});

test("склад: «всего на продажу» считает только отмеченные товары, длинный список прокручивается", () => {
  const v = fullView();
  assert.equal(saleValue(v), 12, "Изделие 3 × 4; сырьё не отмечено");
  const html = renderApp(v, initialUi());
  assert.ok(html.includes("Всего на продажу:"));
  assert.ok(!html.includes(">Всего на <"));
  assert.ok(!html.includes('class="stock scroll"'), "до шести товаров полосы нет");
  const g = v.storage.goods[0];
  v.storage.goods = Array.from({ length: 7 }, (_, i) => ({ ...g, id: "g" + i }));
  assert.ok(renderApp(v, initialUi()).includes('class="stock scroll"'), "больше шести — полоса прокрутки");
  v.storage.goods = v.storage.goods.slice(0, 6);
  assert.ok(!renderApp(v, initialUi()).includes('class="stock scroll"'));
});

test("рынок: сначала продажа, потом покупка; сырьё по списку, пока хватает денег", () => {
  const v = fullView();
  const ui = initialUi();
  v.money.value = 0;
  ui.market.raw = { g_raw: 12 };
  let plan = marketPlan(v, ui);
  assert.equal(plan.buy_raw.g_raw, 12, "12 = выручка за изделия");
  assert.equal(plan.trimmed, false);
  ui.market.raw = { g_raw: 13 };
  plan = marketPlan(v, ui);
  assert.equal(plan.buy_raw.g_raw, 12, "куплено, пока хватает денег");
  assert.equal(plan.trimmed, true);
  assert.ok(renderApp(v, ui).includes(">Денег не хватает на всю закупку"), "предупреждение в интерфейсе");
  v.storage.goods[0].sell_flag = true;
  assert.equal(marketPlan(v, ui).trimmed, false, "отметили сырьё к продаже — хватает");
  // лавка дороже денег плюс продажи — поход закрыт, подсказка вместо текста
  v.storage.goods[0].sell_flag = false;
  ui.market.items = ["t_tool"];
  v.money.value = 0;
  v.market.shop[0].price = 50;
  const html = renderApp(v, ui);
  assert.ok(marketPlan(v, ui).itemsShort > 0);
  assert.ok(html.match(/<button[^>]*data-act="market-go"[^>]*disabled/));
  assert.ok(html.includes('class="go-wrap" title="Не хватает: 38'));
  const shopHtml = renderApp(v, { ...ui, open: ["market:shop"] });
  const shop = shopHtml.slice(shopHtml.indexOf('class="shop"'));
  assert.ok(shop.includes('title="Не хватает денег"'), "причина — во всплывающей подсказке");
  assert.ok(!shop.includes('class="reason"'), "текстом причина не выводится");
});

test("рынок: «купить» пусто — подставляется разница до «поддерживать», ввод главнее", () => {
  const v = fullView(); // на складе сырья 5
  v.money.value = 100;
  const ui = initialUi();
  assert.deepEqual(marketPlan(v, ui).buy_raw, { g_raw: 5 }, "10 по умолчанию − 5 на складе");
  ui.market.keep = { g_raw: 7 };
  assert.deepEqual(marketPlan(v, ui).buy_raw, { g_raw: 2 }, "запомненное значение");
  ui.market.keep = { g_raw: 3 };
  assert.deepEqual(marketPlan(v, ui).buy_raw, {}, "на складе уже больше");
  ui.market.keep = { g_raw: null };
  assert.deepEqual(marketPlan(v, ui).buy_raw, { g_raw: 5 }, "очищенное поле — умолчание");
  ui.market.raw = { g_raw: 4 };
  assert.deepEqual(marketPlan(v, ui).buy_raw, { g_raw: 4 }, "введённое «купить» главнее");
  const html = renderApp(v, initialUi());
  assert.ok(html.includes("Купить") && html.includes("Поддерживать количество"));
  assert.ok(/data-act="market-keep"[^>]*value="10"/.test(html));
  assert.ok(/data-act="market-raw"[^>]*placeholder="5"/.test(html), "в «купить» виден расчёт");
});

test("свёртка: содержимое есть, только когда блок открыт", () => {
  const v = fullView();
  const closed = renderApp(v, initialUi());
  assert.ok(closed.includes('data-act="fold"'));
  assert.ok(closed.includes('aria-expanded="false"'));
  assert.ok(!closed.includes('data-act="equip"'));
  assert.ok(renderApp(v, opened(v)).includes('data-act="equip"'));
});

test("выпадающий список: закрыт по умолчанию, открывается и закрывается, выбор берёт data-value", () => {
  const v = fullView();
  const closed = renderApp(v, opened(v));
  assert.ok(/<ul class="dd-list scroll" role="listbox" hidden>/.test(closed));
  assert.ok(!/<select/.test(closed), "родного select нет");
  const open = renderApp(v, { ...opened(v), dd: "equip:c_help" });
  assert.ok(open.includes('class="choice dd open"'), "«Дать вещь» — кнопка со списком, как у занятия");
  assert.ok(/data-act="dd" data-key="equip:c_help"[^>]*>Дать вещь</.test(open) || open.includes("Дать вещь"), "кнопка «Дать вещь»");
  assert.ok(!open.includes("— выбрать —"), "поля выбора вещи нет");
  assert.ok(/<ul class="dd-list scroll" role="listbox">/.test(open), "нужный список открыт");
});

test("поле закупки: текстовое с цифровой клавиатурой, берутся только цифры", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  assert.ok(/<input type="text" inputmode="numeric"[^>]*data-act="market-raw"/.test(html));
});

test("доска объявлений — в правой колонке сверху, перед складом", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  const right = html.slice(html.indexOf('class="col col-right"'));
  assert.ok(right.indexOf('class="panel board"') >= 0, "доска справа");
  assert.ok(right.indexOf('class="panel board"') < right.indexOf('class="panel storage"'), "выше склада");
  const center = html.slice(html.indexOf('class="col col-center"'), html.indexOf('class="col col-right"'));
  assert.ok(!center.includes('class="panel board"'), "в центре доски нет");
});

test("дела: кнопка с названием, справа цена — время и требуемое, нехватка красным", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  const off = html.slice(html.indexOf('<li class="action off"'));
  const li = off.slice(0, off.indexOf("</li>"));
  assert.ok(/<button[^>]*data-id="a_off"[^>]*>[^<·]*<\/button>/.test(li), "в кнопке только название");
  assert.ok(li.includes('class="price-col"'));
  assert.ok(li.includes('class="p-time"'));
  assert.ok(li.includes('class="p-cost short"'), "не хватает — красным");
});

test("мастерская: сколько мест занято и сколько свободно", () => {
  const v = fullView();
  const w = v.workshops[0];
  w.vars = [{ id: "equipment_slots", name: "Мест для снаряда", value: 3, display: "3", format: "int", level: null, step: null }];
  w.equipment = [{ item: "i_eq1", name: "Наковальня" }];
  const html = renderApp(v, initialUi());
  assert.ok(html.includes("занято 1, свободно 2"));
  assert.equal((html.match(/class="pip on"/g) ?? []).length, 1);
  assert.equal((html.match(/class="pip"/g) ?? []).length, 2);
});

test("занятие: строка «Занятие: …» и кнопка «Новое»; лавка — под свёрткой", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  assert.ok(html.includes("Занятие: <b>"));
  assert.ok(html.includes(">Новое</button>"));
  assert.ok(!html.includes('class="shop"'), "лавка свёрнута");
  assert.ok(renderApp(v, { ...initialUi(), open: ["market:shop"] }).includes('class="shop"'));
});

test("итог дня: деньги, изменение под ними, строки доходов и расходов; детали по кнопке «Подробнее»", () => {
  const v = fullView();
  v.summary = {
    title: "Итог", money_morning: 40, delta: 7,
    income: [{ source: "s", label: "Продажа", amount: 9 }],
    expense: [{ source: "e", label: "Хоз", amount: 2 }],
    morning: [{ text: "Утренняя строка", kind: "info" }],
  };
  const ui = initialUi();
  ui.totals = { day: null, income: 100, expense: 50 };
  const html = renderApp(v, ui);
  assert.ok(/class="delta plus">\+7</.test(html));
  assert.ok(html.includes("<b>9</b> за день, всего <b>109</b>"));
  assert.ok(html.includes("<b>2</b> за день, всего <b>52</b>"));
  assert.ok(!html.includes("Утренняя строка"));
  assert.ok(html.includes(">Подробнее</button>"));
  assert.ok(!html.includes("Продажа"), "без нажатия деталей нет");
  const open = renderApp(v, { ...ui, showSummaryDetails: true });
  assert.ok(open.includes("Продажа") && open.includes(">Скрыть</button>"));
});

test("колонки: «Только что» слева сверху, «Заказы» справа сверху", () => {
  const v = fullView();
  const html = renderApp(v, { ...initialUi(), lastStop: "Остановились" });
  const L = html.indexOf('class="col col-left"'), C = html.indexOf('class="col col-center"'), R = html.indexOf('class="col col-right"');
  const at = (cls: string) => html.indexOf(`class="panel ${cls}"`);
  assert.ok(at("now") > L && at("now") < C, "«Только что» слева");
  assert.ok(at("now") < at("notes"), "выше «Сегодня»");
  assert.ok(at("obligations") > R, "«Заказы» справа");
  assert.ok(at("obligations") < at("board"), "выше доски");
});

/** Кусок HTML одной панели. */
function panelOf(html: string, cls: string): string {
  const i = html.indexOf(`class="panel ${cls}"`);
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
}

test("«Работники» (works: true, герой первым) и «Семья» (works: false), исполнитель дела — герой без вопроса", () => {
  const v = fullView();
  const html = renderApp(v, initialUi());
  const iw = html.indexOf('panel workers');
  const ish = html.indexOf('panel wshop');
  assert.ok(iw >= 0 && iw < ish, "работники над мастерской");
  const workers = panelOf(html, "workers");
  assert.ok(workers.includes(">Работники</h2>"));
  assert.ok(workers.includes("Помощник") && workers.includes("Герой заглушки") && workers.includes("это вы"));
  assert.ok(workers.indexOf("Герой заглушки") < workers.indexOf("Помощник"), "герой первым");
  assert.ok(!workers.includes("Кот"));
  const family = panelOf(html, "family");
  assert.ok(family.includes(">Семья</h2>") && family.includes("Кот"));
  assert.ok(!family.includes("Помощник") && !family.includes("Герой заглушки"));
  assert.ok(!html.includes('class="panel people"'), "общего блока «Люди» больше нет");
  // герой первым, даже если в виде идёт не первым; порядок остальных — как в виде
  const moved = fullView();
  moved.characters.push(moved.characters.shift()!);
  const w2 = panelOf(renderApp(moved, initialUi()), "workers");
  assert.ok(w2.indexOf("Герой заглушки") < w2.indexOf("Помощник"));
  // разбиение только по works: герой с works: false — в «Семье»; пустой блок не показывается
  const lazy = fullView();
  lazy.characters.forEach((c) => (c.works = false));
  const h3 = renderApp(lazy, initialUi());
  assert.ok(!h3.includes('class="panel workers"'), "пустых «Работников» нет");
  assert.ok(panelOf(h3, "family").includes("Герой заглушки"));
  const busy = fullView();
  busy.characters.forEach((c) => (c.works = true));
  assert.ok(!renderApp(busy, initialUi()).includes('class="panel family"'), "пустой «Семьи» нет");
  const teach = v.actions.find((a) => a.id === "a_teach")!;
  assert.equal(startPicking(v, teach).actor, "c_hero");
  assert.ok(!renderApp(v, { ...initialUi(), picking: startPicking(v, teach) }).includes("Исполнитель"));
});

test("лавка: дорогой предмет доступен, если денег хватит с выручкой от продажи", () => {
  const v = fullView();
  const ui = initialUi();
  ui.market.items = ["t_big"];
  assert.deepEqual(marketPlan(v, ui).buy_items, []);
  v.storage.goods.find((g) => g.id === "g_prod")!.unit_value = 30;
  assert.deepEqual(marketPlan(v, ui).buy_items, ["t_big"]);
  assert.equal(marketPlan(v, ui).itemsShort, 0);
  const html = renderApp(v, { ...initialUi(), open: ["market:shop"] });
  const li = html.slice(html.indexOf('data-id="t_big"') - 80, html.indexOf('data-id="t_big"') + 120);
  assert.ok(!li.includes("disabled"));
});

test("телефон: причина недоступного дела и предмета лавки — текстом .tip-touch (title на сенсоре не виден), без дублей", () => {
  const v = fullView();
  const html = renderApp(v, { ...initialUi(), open: ["market:shop"] });
  assert.ok(html.includes('<div class="tip-touch">Нужно больше сырья</div>'), "причина дела");
  assert.ok(html.includes('<div class="tip-touch">Не хватает денег</div>'), "причина лавки");
  assert.equal((html.match(/class="tip-touch"/g) ?? []).length, 2, "у доступных — нет");
});
