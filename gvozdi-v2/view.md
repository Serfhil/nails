# view.md — руководство фронтендера

> **Паспорт роли — Интерфейс.** Ты пишешь интерфейс: показываешь `game.view()` и шлёшь команды `game.perform()`, ничего не считая.
>
> - **Пишешь только:** `ui/`, `docs/ui/`, `reports/view.md`.
> - **Читаешь:** этот документ целиком (разд. 2 — копия контракта интерфейса); `fixtures/mini-pack/` как вход; движок — только импорт из `engine/src/index.ts`.
> - **Не трогаешь:** `engine/` (в том числе его код), `validator/`, `simulator/`, `packs/`, `core.md` (кроме разд. 6 по необходимости). Нужно поле, которого нет в виде, — запись в `CONTRACT_ISSUES.md`.
> - Общие правила, зоны, чтение через граф, эскалация и формат отчёта — в `claude.md` (§0–§5, §9). Роль неясна из задачи — спроси владельца до любых действий.

**core.md приоритетен.** Если этот документ расходится с core.md, верен core.md; расхождение записывается в `CONTRACT_ISSUES.md`.

**Интерфейс не меняет движок и ничего не считает.** Он показывает то, что отдаёт `game.view()`, и отправляет команды через `game.perform()`. Нужно поле, которого нет в виде, — запись в `CONTRACT_ISSUES.md`, а не расчёт на своей стороне.

По этому документу интерфейс пишется без чтения кода движка.

Состав:
1. Принципы
2. Контракт для интерфейса (дословная копия раздела 5 core.md)
3. Экраны и панели
4. Оформление
5. Сохранение
6. Порядок работы и проверка

---

## 1. Принципы

1. **Только вид и команды.** Никаких игровых чисел, названий и текстов в коде интерфейса. Все строки для игрока приходят из движка готовыми. Даже заголовок игры — `view.meta.game_title`.
2. **Ничего «на всякий случай».** Панель или кнопка появляется, только если в виде есть что в ней показать. Пустой массив — нет панели. Интерфейс не знает, что ещё есть в игре: скрытое в виде отсутствует полностью.
3. **Открытое, но недоступное — серым с причиной.** `enabled: false` → кнопка неактивна, рядом `reason`.
4. **Окно выбора главнее всего.** Пока `view.pending_offer` не `null`, поверх всего открыто окно с вариантами; другие кнопки неактивны; закрыть окно без выбора нельзя.
5. **Телефон прежде всего.** Ширина от 360 px, одна колонка, крупные кнопки, без горизонтальной прокрутки. Главные кнопки — вверху, без пролистывания.
6. **Ошибки команд.** `Result.ok: false` → показать `error.text` коротким сообщением. Состояние не менялось.

---

## 2. Контракт для интерфейса

*Ниже — дословная копия раздела 5 core.md (заголовки сдвинуты на уровень ниже).*

<!-- sync:core-5:begin -->
### 5. Контракт для интерфейса

*Этот раздел дословно повторяется в view.md. При расхождении верен core.md.*

#### 5.1 API
```ts
createGame(pack: Pack, seed: number): Game
loadGame(pack: Pack, save: string): Game

interface Game {
  view(): View              // только видимое игроку
  debugView(): DebugView    // всё, раздел 6
  perform(cmd: Command): Result
  save(): string
}
```

#### 5.2 Команды
```ts
type Command =
  | { type: "work_until_stop" }
  | { type: "sleep" }
  | { type: "do_action", action: string, actor: string, partner?: string, candidate?: string, replace?: string }  // replace — id экземпляра оборудования под замену (3.7)
  | { type: "set_assignment", character: string, assignment: { kind: "idle" } | { kind: "action", action: string } | { kind: "trade" } }
  | { type: "market_trip", buy_raw: Record<string, number>, buy_items: string[] }
  | { type: "set_sell_flag", good: string, on: boolean }
  | { type: "choose_option", offer: string, option: string }   // offer — id экземпляра предложения
  | { type: "deliver", obligation: string }                     // id экземпляра обязательства
  | { type: "decline", obligation: string }
  | { type: "equip", character: string, item: string }          // item — id экземпляра
  | { type: "unequip", character: string, item: string }
  | { type: "assign_workshop", character: string, workshop: string }

interface Result {
  ok: boolean
  error?: { code: "not_available" | "requirement_unmet" | "no_time" | "insufficient" | "incapacitated" | "offer_pending" | "game_over" | "invalid", text: string }
  events: Line[]          // что произошло в ходе команды
  stop?: { reason: string, text: string }   // для work_until_stop
  view: View
}
interface Line { text: string, kind: "info" | "good" | "warn" | "danger" | "seal" }
```
Ошибочная команда не меняет состояние. Все строки для игрока приходят из движка готовыми.

#### 5.3 View
```ts
interface View {
  meta: { day: number, hour: number, day_start: number, day_end: number, is_night: boolean, game_title: string,
          pack_id: string, pack_version: string, pack_description: string | null }   // game_title — pack.json name
  money: { name: string, short: string, value: number }
  stress: null | { name: string, value: number, max: number | null, step: string | null, warning: boolean }
  notifications: Line[]                  // за сегодня
  summary: null | {                      // «Итог дня», после сна
    title: string, money_morning: number, delta: number,
    income: { source: string, label: string, amount: number }[],
    expense: { source: string, label: string, amount: number }[],
    morning: Line[] }
  pending_offer: null | OfferView        // окно «сейчас»; пока не null, игра ждёт выбора
  actions: ActionView[]                  // только открытые
  categories: CategoryView[]             // только категории, где есть хотя бы одно открытое действие, в порядке файла
  characters: CharacterView[]            // только видимые персонажи в игре (без пула найма)
  hire_pool: CandidateView[]             // видимые кандидаты пула найма
  workshops: WorkshopView[]              // если одна — переключатель не показывается
  storage: { goods: StockLine[], total_value: number }
  inventory: { item: string, type: string, name: string, effects: EffectView[] }[]
  market: { enabled: boolean, disabled_reason: string | null, hours: number,
            raw: { id: string, name: string, unit_price: number }[],
            shop: { item_type: string, name: string, price: number, enabled: boolean, disabled_reason: string | null }[] }
  board: OfferView[]
  obligations: ObligationView[]
  effects: EffectView[]                  // видимые модификаторы мира
  ending: null | { title: string, text: string, tag: "goal" | "fail" | null }
}
interface ActionView {
  id: string, label: string, description: string | null, category: string | null, hours: number, mode: "once" | "assignable" | "both",
  enabled: boolean, reason: string | null, cost: CostLine[],
  roles: { actor: string[], partner: string[] | null, candidate: string[] | null },   // candidate — id из hire_pool
  replace: null | { warning: string, options: { item: string, name: string }[] }      // 3.7, случай 4: перед do_action спросить, что заменить
}
interface CategoryView { id: string, name: string, view: "list" | "select" }
interface VarView { id: string, name: string, value: number, display: string, format: string, level: number | null, step: string | null }
interface CharacterView {
  id: string, name: string, role: string, role_name: string | null, works: boolean, blurb: string | null,
  status: "ok" | "incapacitated", incapacitated_permanent: boolean,
  workshop: string | null,
  vars: VarView[],
  slots: { slot: string, slot_name: string, item: string | null, name: string | null }[],
  equippable: string[],                  // id экземпляров инвентаря, которые можно надеть этому персонажу
  assignment: { kind: "idle" | "action" | "trade", label: string },
  assignable: { assignment: object, label: string, enabled: boolean, reason: string | null }[],
  effects: EffectView[]
}
interface EffectView { id: string, name: string, text: string, numbers: string | null, days_left: number | null, negative: boolean }
interface CandidateView { id: string, name: string, role_name: string | null, blurb: string | null, vars: VarView[], effects: EffectView[] }
interface WorkshopView { id: string, type: string, name: string, vars: VarView[], equipment: { item: string, name: string }[], workers: string[], effects: EffectView[] }
interface StockLine { id: string, name: string, unit: string, qty: number, unit_value: number, sell_flag: boolean }
interface CostLine { name: string, need: number, have: number }
interface OfferView { id: string, title: string, text: string, days_left: number | null,
  options: { id: string, label: string, enabled: boolean, reason: string | null, cost: CostLine[] }[] }
interface ObligationView { id: string, title: string, days_left: number | null, requires: CostLine[], can_deliver: boolean }
```
В `View` нет ничего скрытого: закрытые действия, скрытые переменные, модификаторы, варианты, мастерские и персонажи отсутствуют полностью. `numbers` у эффекта — `null`, если `show_numbers: false`.
<!-- sync:core-5:end -->

---

## 3. Экраны и панели

Названия панелей ниже — рабочие. Тексты на экране — из вида.

### 3.1 Шапка
День и час (`meta`), деньги (`money.name`, `money.value`), стресс героя (`stress`, если не `null`; при `warning: true` — выделить красным сургучом). Кнопка настроек (открывает окно 3.14); отдельной кнопки «Начать заново» в шапке нет.

### 3.2 Главные кнопки (сразу под шапкой)
- «Заняться делом» → `work_until_stop`. После ответа показать `Result.stop.text`.
- «Спать до утра» → `sleep`. Ночью (`meta.is_night`) это единственная активная кнопка, кроме команд без времени.
- Разовые действия героя — из `actions` с `mode` `once` или `both`; если у действия несколько ролей, перед отправкой выбрать исполнителя, партнёра, кандидата из `roles` (кандидатов показывать по `hire_pool`).
- У каждой кнопки действия показывать `description`, если он не `null` (под названием или подсказкой по нажатию — как удобнее на телефоне). Если `null` — ничего не рисовать, пустого места не оставлять.
- Группировка: действия с `category` собираются по `categories` (в их порядке); действия с `category: null` идут вне групп, списком. Тип группы — `view`: `select` — выбор одного действия из выпадающего списка, рядом подтягиваются `description`, `cost` и кнопка выполнения выбранного; недоступные (`enabled: false`) пункты видны, но выбрать их нельзя, причина — `reason`; `list` — раскрывающийся список действий, по умолчанию свёрнут, можно открыть несколько. В заголовке группы — число доступных действий. Состояние раскрытия и выбранный пункт хранит интерфейс, не движок. Ничего не считать: порядок, названия и доступность — из вида.
- Если у действия `replace` не `null` — перед отправкой показать `replace.warning` и выбор из `replace.options` (что заменить) с возможностью отказаться; выбранный `item` уходит в `do_action.replace`.

### 3.3 Уведомления
`notifications` — на видном месте, новые сверху. Строки окрашиваются по `kind` (`danger` и `seal` — красным сургучом). `Result.events` последней команды — блок «Только что».

### 3.4 Окно выбора
`pending_offer`: заголовок, текст, 1–4 кнопки вариантов. Недоступный вариант — серый с `reason` и строками `cost` (сколько нужно и сколько есть). Выбор → `choose_option`. Один вариант «Понятно» — это уведомление-окно.

### 3.5 Итог дня
После сна, если `summary` не `null`: крупно `money_morning` и `delta`; под раскрытием «Подробности» — `income` и `expense` по строкам; ниже `morning`. Закрывается кнопкой (команда не нужна: окно показывается, пока игрок не закроет его в интерфейсе).

### 3.6 Люди
Два блока в левой колонке: **«Работники»** — персонажи с `works: true`, в том числе герой (он первым); **«Семья»** — персонажи с `works: false`. Разбиение только по `works` из вида, ничего не вычислять; пустой блок не показывать. Заголовки блоков — служебные слова интерфейса.
Карточка персонажа в обоих блоках — `characters`: имя, подпись роли (`role_name`, если не `null`), `blurb`, статус (недееспособен — пометка), видимые переменные (`vars`: `name` и готовая строка `display`, со ступенью `step`, если есть), предметы в слотах (`slots`: `slot_name` и вещь или «пусто»), эффекты (`effects`). Назначение: выпадающий список из `assignable` → `set_assignment`. Снаряжение: `equip` — выбор только из `equippable` (названия — из `inventory`), `unequip` — из занятых слотов. Кандидаты найма — отдельная панель по `hire_pool`. Если мастерских больше одной — выбор мастерской → `assign_workshop`; при одной этого элемента нет.

### 3.7 Мастерская
`workshops`: название, переменные, оборудование, работники, эффекты. Если мастерских больше одной — переключатель вкладками; при одной переключателя нет.

### 3.8 Склад
`storage.goods`: строки «Название: количество» и общая стоимость. У каждой строки галочка «продать при походе на рынок» (`sell_flag`) → `set_sell_flag`.

### 3.9 Рынок
`market`: кнопка похода (активна по `enabled`, иначе `disabled_reason`), поля количества закупки сырья (`raw`), список предметов лавки (`shop`). Отправка → `market_trip` с `buy_raw` и `buy_items`.

### 3.10 Доска объявлений
`board`: записи со сроком (`days_left`) и вариантами («Взять», «Не брать»), как в окне выбора, но без блокировки игры. Выбор → `choose_option`.

### 3.11 Заказы
`obligations`: название, срок, строки `requires` (нужно / есть), кнопка «Сдать товар» (активна при `can_deliver`) → `deliver`, кнопка «Отказаться» → `decline` (по второму нажатию).

### 3.12 Эффекты мира
`effects`: плашки с `name`, `text` и `numbers` (если не `null`) и сроком. `negative: true` — тёмная плашка.

### 3.13 Концовка
`ending` не `null` → экран концовки с `title` и `text`; игра окончена, доступна только кнопка «Начать заново».

### 3.14 Настройки и выбор пака
Окно поверх игры, открывается кнопкой в шапке, закрывается крестиком и тапом мимо.
- Сведения о паке из вида: `meta.game_title`, `meta.pack_version`, `meta.pack_description` (если не `null`).
- «Начать заново» — по второму нажатию (подтверждение), как раньше.
- «Выбор пака» — список паков сборки: название, версия, описание; текущий отмечен. Выбор другого пака переходит на его страницу; сохранение каждого пака своё (ключ с `id` пака), переход его не трогает.
- Список паков — не из движка: его кладёт в страницу сборка (см. ниже). Пак один — список всё равно виден, с одним пунктом.

**Сборка сайта.** `npm run build:site` собирает все паки из `packs/*` (фикстуры — нет): `dist/index.html` — **основной пак** (по умолчанию при открытии сайта грузится сразу он, а не меню), `dist/packs/<id>/index.html` — каждый пак отдельно. В каждую страницу вкладывается список паков `{ id, name, version, description, url }` с относительными ссылками (сайт работает из подпапки GitHub Pages и при открытии файла с диска). Основной пак задаётся аргументом сборки (`--main <id>`, в `package.json` — `nails_for_count`). `npm run build` по-прежнему собирает один основной пак.

---

## 4. Оформление

По умолчанию — как ниже, **можно менять**:
- кремовая бумага (фон и карточки), тёмное дерево (шапка, кнопки);
- красный сургуч — только для печатей (`kind: "seal"`) и опасностей (`danger`, предупреждение стресса);
- полностью текстовый интерфейс, без картинок;
- шрифт с засечками для заголовков, читаемый шрифт для текста.

Цвета — через CSS-переменные в одном месте, чтобы тему можно было сменить без правки разметки.

**Телефон — основной экран.** Вёрстка проверяется на ширине 360 px: одна колонка, без горизонтальной прокрутки, кнопки и пункты списков не меньше 44 px по высоте, шрифт текста не меньше 16 px (без автозума при вводе), длинные тексты переносятся. Шире 900 px — можно в две колонки (левая — люди и мастерская).

---

## 5. Сохранение

Интерфейс хранит `game.save()` в `localStorage` после каждой успешной команды и при запуске вызывает `loadGame`. Если сохранение отклонено движком (несовместимое), показать сообщение и начать новую игру. Ключ хранения включает `id` пака.

---

## 6. Порядок работы и проверка

1. Работа идёт параллельно с ядром на мини-пак-фикстуре `/fixtures/mini-pack` (её делает Ядро первой). До её готовности — по контракту из раздела 2 с заглушкой вида.
2. Код — в `/ui`. Стек: TypeScript, обычный веб без тяжёлых фреймворков. Сборка — в один HTML-файл `dist/index.html` с движком и паком внутри.
3. md-описание каждого модуля интерфейса — в `/docs/ui/`.
4. Проверка: каждая панель исчезает, когда её данные пусты; окно выбора блокирует остальное; на экране 360 px ничего не уезжает; в коде интерфейса нет ни одного `id` и текста из пака (проверка поиском).
5. В конце — отчёт `reports/view.md`: кратко и сухо — что сделано, что не сделано и почему, открытые вопросы.

Общие правила проекта — `claude.md`.
