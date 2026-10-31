# model.ts — что показывать

Назначение: чистые функции от `View` и `UiState`. Без DOM и без игровых расчётов. На них держатся тесты панелей.

## UiState (состояние интерфейса, не игры)
| Поле | Смысл |
|---|---|
| `confirm` | кнопка, ждущая второго нажатия: `"restart"` или `"decline:<id>"` |
| `picking` | открытый выбор участников действия: `action`, `actor`, `partner`, `candidate` |
| `replacing` | окно замены оборудования: действие и готовая команда, ждущая выбора `replace` |
| `summaryClosedDay` | день, за который «Итог дня» уже закрыт |
| `showSummaryDetails` | раскрыты «Подробности» итога |
| `workshopTab` | выбранная вкладка мастерской |
| `dd` | ключ открытого выпадающего списка (`pick:<роль>`, `equip:<персонаж>`, `assign:<персонаж>`, `ws:<персонаж>`) или `null` |
| `totals` | накопленные доходы и расходы по итогам дней и день, который уже учтён (не прибавлять дважды); хранится в сохранении интерфейса |
| `open` | развёрнутые блоки «Параметры» / «Личный инвентарь» (ключи свёртки) |
| `market` | черновик закупки: `raw` (id сырья → количество), `items` (типы предметов лавки) |
| `lastEvents`, `lastStop` | `Result.events` и `Result.stop.text` последней успешной команды — блок «Только что» |
| `message` | короткое сообщение: ошибка команды (`error.text`) или служебное |
| `settings` | открыто окно «Настройки» |

## Правила
- `overlayOf`: `ending` → экран концовки; иначе `pending_offer` → окно выбора; иначе `replacing` (у действия есть `replace`) → окно замены; иначе `summary`, если не закрыт за текущий `meta.day` → итог дня; иначе `ui.settings` → настройки; иначе ничего.
- `isBlocked`: открыто любое окно → всё под ним неактивно.
- `panels`: панель видна, только если есть данные: `stress` не null; `notifications`; разовые действия (`mode` once/both); «Работники» (`workers`: есть `works: true`) и «Семья» (`family`: есть `works: false`) — списки дают `workersOf` (герой первым) и `familyOf`, «Можно нанять» (`hire_pool`); `workshops` (вкладки — при двух и больше); `storage.goods`; `inventory`; рынок (есть `raw`, `shop` или товар на складе); `board`; `obligations`; `effects`; «Только что» (есть события или stop).
- `mainButtons`: «Заняться делом» — не под окном и не ночью (`meta.is_night`); «Спать до утра» — не под окном.
- `actionEnabled`: не под окном, `enabled`, есть хотя бы один исполнитель.
- `needsPicker`: исполнителей больше одного или есть роль `partner`/`candidate`. Без выбора — `directCommand` (единственный исполнитель). С выбором — `startPicking` (первые в списках) и `pickingCommand` (выбранные обязаны быть в `roles`).
- `canAssign` — работающий персонаж с непустым `assignable`; `canPickWorkshop` — мастерских больше одной и персонаж работает; `canEquip` — есть слоты и вещи в `inventory`.
- `marketPlan` — план похода: `wantedRaw` (введённое «купить» или разница `keepOf` − `stockOf`, по умолчанию `KEEP_DEFAULT` = 10), лавка вычитается первой, сырьё по списку, пока хватает денег плюс выручки; `trimmed` — не хватило, `itemsShort` — лавка дороже. `marketCommand` берёт команду из плана. Состояние `market.keep` хранится в сохранении интерфейса вместе с `summaryClosedDay`.
- `summaryTotals` — доход и расход за день (сумма строк `summary`) и накопленные (`ui.totals` плюс сегодняшний, если ещё не учтён).
- `saleValue` — оценка выручки со склада: только товары с `sell_flag`, строка вниз до целого (CI-018). Это оценка для кнопки, решает движок (CI-022).
- `marketCommand`: `buy_raw` — только положительные целые количества по сырью из вида; `buy_items` — отмеченные и доступные (`enabled`) типы лавки.
- Переменные показываются готовой строкой `display` из вида; своего форматирования переменных нет. `fmtNum` / `fmtMoney` / `fmtSigned` — только для денег, количеств и `CostLine` (числа вида без пересчёта), `fmtHour` — для часа.
- `nameOf(view, id)` — имя из `characters`, затем из `hire_pool` (кандидаты в выборе роли `candidate`); если нет в виде — сам id.
- `equipOptions(view, c)` — экземпляры из `c.equippable` (названия из `inventory`); `canEquip` — список не пуст.
- Замена оборудования (core.md 3.7): у действия `replace` не `null` → `UiState.replacing = { action, cmd }` (готовая `do_action` без `replace`); `overlayOf` даёт `replace`; `replaceCommand(view, replacing, item)` добавляет `replace: item`, только если `item` есть в `replace.options`.

## Пример
```ts
const p = panels(view, ui);   // { board: false, obligations: true, ... }
const cmd = needsPicker(a) ? pickingCommand(a, ui.picking!) : directCommand(a);
```

## Группы действий
`UiState.catOpen: string[]`, `UiState.catPick: Record<string, string>`; `groupActions(view)` -> `{ ungrouped, groups: [{ category, actions, available }] }`; `pickedIn(ui, group)` — выбранное действие группы select или `null`. Ничего не считается: `available` — число `enabled` из вида.
- `goodsForNewObligations(before, after)` — товары склада с флажком продажи, названия которых есть в `requires` обязательств, появившихся после команды (их `id` не было в `before`). Сравнение по названию строки (в `CostLine` нет `id` товара). После успешного `choose_option` приложение снимает с них флажок командой `set_sell_flag` (вместе с `goodsToKeep` — товарами из расхода выбранного варианта).
