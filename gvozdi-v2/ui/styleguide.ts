// Страница-витрина: все панели, окна и состояния интерфейса на выдуманных данных заглушки.
// Нужна, чтобы стилизовать styles.css, не запуская игру. Запуск: tsx ui/styleguide.ts [выходная папка]
// По умолчанию — docs/ui/styleguide/ (index.html + styles.css, копия ui/src/styles.css; правится и обновляется кнопкой F5).

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { View } from "./src/contract.ts";
import { initialUi, type UiState } from "./src/model.ts";
import type { PackEntry } from "./src/packs.ts";
import { renderApp } from "./src/render.ts";
import { emptyView, fullView, sampleOffer } from "./src/stub.ts";

const here = dirname(fileURLToPath(import.meta.url));

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Вид, в котором есть всё: длинные описания, предупреждение стресса, две мастерские, все виды строк. */
function richView(): View {
  const v = fullView();
  v.stress = { name: "Напряжение", value: 88, max: 100, step: "На пределе", warning: true };
  v.notifications = [
    { text: "Обычная строка уведомления (info).", kind: "info" },
    { text: "Хорошая новость (good).", kind: "good" },
    { text: "Предупреждение (warn).", kind: "warn" },
    { text: "Опасность (danger).", kind: "danger" },
    { text: "Печать (seal).", kind: "seal" },
  ];
  v.actions[0].description = "Короткое описание действия.";
  v.actions[1].description =
    "Очень длинное описание действия, которое должно переноситься на несколько строк и не вылезать за пределы кнопки действия, сколько бы текста ни написал автор пака.";
  v.actions[3].description = "Недоступное действие с описанием.";
  v.workshops.push({
    id: "w_two",
    type: "wt_one",
    name: "Вторая мастерская",
    vars: [{ id: "v_cap", name: "Мест", value: 4, display: "4", format: "number", level: null, step: null }],
    equipment: [],
    workers: [],
    effects: [{ id: "e_w", name: "Сырость", text: "Инструмент ржавеет", numbers: "−5%", days_left: 3, negative: true }],
  });
  v.characters[0].blurb = "Длинная подпись героя, чтобы увидеть перенос строк в карточке человека.";
  v.characters[0].effects = [{ id: "e_good", name: "Вдохновение", text: "Работает быстрее", numbers: "+15%", days_left: null, negative: false }];
  v.obligations.push({
    id: "ob_2",
    title: "Заказ, который не сдать",
    days_left: 1,
    requires: [{ name: "Изделие", need: 9, have: 3 }, { name: "Сырьё", need: 4, have: 5 }],
    can_deliver: false,
  });
  v.board.push({
    id: "o_board2",
    title: "Объявление с недоступным вариантом",
    text: "Нужен залог.",
    days_left: null,
    options: [
      { id: "take", label: "Взять", enabled: false, reason: "Мало денег", cost: [{ name: "Деньги", need: 100, have: 42 }] },
      { id: "skip", label: "Не брать", enabled: true, reason: null, cost: [] },
    ],
  });
  v.effects.push({ id: "e_bad", name: "Неурожай", text: "Цены на сырьё выше", numbers: "+20%", days_left: 5, negative: true });
  v.hire_pool[0].effects = [{ id: "e_c", name: "Честолюбив", text: "Просит больше платы", numbers: null, days_left: null, negative: false }];
  return v;
}

interface Frame {
  title: string;
  note?: string;
  width: number | null; // null — на всю страницу
  height: number;
  view: View;
  ui?: Partial<UiState>;
  packs?: PackEntry[];
}

/** Выдуманный список паков сборки для окна «Настройки». */
const SAMPLE_PACKS: PackEntry[] = [
  { id: "stubpack", name: "Заглушка", version: "0.0.1", description: "Описание заглушки.", url: "index.html" },
  {
    id: "p_two",
    name: "Второй пак с длинным названием, которое переносится",
    version: "1.4.2",
    description: "Длинное описание второго пака: одна-две фразы для игрока, которые должны переноситься и не вылезать за край окна на узком экране телефона.",
    url: "packs/p_two/index.html",
  },
  { id: "p_three", name: "Третий пак", version: "0.9.0", description: null, url: "packs/p_three/index.html" },
];

function frames(): Frame[] {
  const base = richView();
  const summary = (): View => {
    const v = clone(base);
    v.summary = {
      title: "Итог дня",
      money_morning: 39,
      delta: -3,
      income: [{ source: "sales", label: "Продажи", amount: 12 }],
      expense: [{ source: "household", label: "Хозяйство", amount: 15 }],
      morning: [{ text: "Новое утро.", kind: "good" }],
    };
    return v;
  };
  const night = clone(base);
  night.meta = { ...night.meta, hour: 21, is_night: true };
  const offer = clone(base);
  offer.pending_offer = sampleOffer();
  const replace = clone(base);
  const noDesc = clone(base);
  noDesc.meta = { ...noDesc.meta, pack_description: null };
  const ending = (tag: "goal" | "fail" | null): View => {
    const v = clone(base);
    v.ending = { title: "Заголовок концовки", text: "Текст концовки в одном-двух абзацах.", tag };
    return v;
  };
  const lastEvents = [
    { text: "Работали три часа.", kind: "info" as const },
    { text: "Сделано изделие.", kind: "good" as const },
  ];
  return [
    { title: "Экран целиком (десктоп)", note: "Все панели, колонки слева/в центре/справа.", width: null, height: 1100, view: base, ui: { lastEvents, lastStop: "Закат — пора спать" } },
    { title: "Телефон 360 px", note: "Одна колонка.", width: 360, height: 1400, view: base, ui: { lastEvents } },
    {
      title: "Выбор участников действия",
      note: "Открыт .picker у действия с партнёром.",
      width: 480,
      height: 700,
      view: base,
      ui: { picking: { action: "a_teach", actor: "c_hero", partner: null, candidate: null } },
    },
    { title: "Окно выбора (pending_offer)", width: 480, height: 520, view: offer },
    {
      title: "Окно замены оборудования",
      width: 480,
      height: 520,
      view: replace,
      ui: { replacing: { action: "a_equip", cmd: { type: "do_action", action: "a_equip", actor: "c_hero" } } },
    },
    { title: "Итог дня", width: 480, height: 640, view: summary() },
    { title: "Итог дня, подробности", width: 480, height: 760, view: summary(), ui: { showSummaryDetails: true } },
    { title: "Ночь", width: 480, height: 760, view: night },
    { title: "Ошибка команды", note: "message под шапкой.", width: 480, height: 420, view: base, ui: { message: { text: "Сейчас нельзя.", kind: "danger" } } },
    { title: "Настройки, телефон 360 px", note: "Сведения о паке, «Начать заново», выбор пака (текущий отмечен).", width: 360, height: 900, view: base, ui: { settings: true }, packs: SAMPLE_PACKS },
    { title: "Настройки: «Начать заново» взведено, пак один", note: "Второе нажатие; описания пака нет.", width: 360, height: 640, view: noDesc, ui: { settings: true, confirm: "restart" } },
    { title: "Концовка: цель", width: 480, height: 420, view: ending("goal") },
    { title: "Концовка: провал", width: 480, height: 420, view: ending("fail") },
    { title: "Концовка: без метки", width: 480, height: 420, view: ending(null) },
    { title: "Пустой вид", note: "Все панели исчезли, остались главные кнопки.", width: 480, height: 380, view: emptyView() },
  ];
}

const SG_CSS = `
body { padding: 16px; }
.sg-head { font-family: system-ui, sans-serif; margin: 0 0 16px; }
.sg-head h1 { margin: 0 0 4px; font-size: 22px; }
.sg-head p { margin: 0; color: #666; }
.sg-toc { font-family: system-ui, sans-serif; margin: 0 0 24px; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px 14px; }
.sg-toc a { color: #36c; }
.sg-sec { margin: 0 0 28px; }
.sg-sec > h2 { font-family: system-ui, sans-serif; font-size: 15px; margin: 0 0 6px; border: 0; color: #333; }
.sg-sec > h2 small { font-weight: normal; color: #777; margin-left: 8px; }
/* рамка: transform превращает position:fixed окон в привязанные к рамке */
.sg-frame { position: relative; transform: translate(0); overflow: auto; border: 2px dashed #bbb; background: var(--paper, #f4ecd8); }
`;

function section(f: Frame, i: number): string {
  const ui: UiState = { ...initialUi(), ...f.ui, summaryClosedDay: null };
  const style = `${f.width ? `width:${f.width}px;` : ""}height:${f.height}px;`;
  return `<section class="sg-sec" id="s${i}"><h2>${i + 1}. ${f.title}<small>${f.note ?? ""}</small></h2><div class="sg-frame" style="${style}"><div id="app">${renderApp(f.view, ui, f.packs)}</div></div></section>`;
}

export function styleguide(): string {
  const fs = frames();
  const toc = fs.map((f, i) => `<li><a href="#s${i}">${i + 1}. ${f.title}</a></li>`).join("");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Витрина интерфейса</title>
<link rel="stylesheet" href="styles.css">
<style>${SG_CSS}</style>
</head>
<body>
<header class="sg-head"><h1>Витрина интерфейса</h1><p>Все панели и окна на выдуманных данных. Правьте <b>styles.css</b> рядом с этим файлом и обновляйте страницу. Страница статична: кнопки не работают.</p></header>
<ul class="sg-toc">${toc}</ul>
${fs.map(section).join("\n")}
</body>
</html>
`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = resolve(process.argv[2] ?? join(here, "..", "docs", "ui", "styleguide"));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), styleguide(), "utf8");
  copyFileSync(join(here, "src", "styles.css"), join(out, "styles.css"));
  console.log(`Витрина: ${join(out, "index.html")}`);
}
