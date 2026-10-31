# Время и команды (`game.ts`, `time.ts`)

**Назначение.** Принимает команды интерфейса, проверяет их, выполняет и продвигает время. Время идёт только от команд.

## Время
- Тик = 1 час. День — от `settings.day_start` до `settings.day_end`. Ночь — `hour == day_end` (`view.meta.is_night`).
- Час (`hourStep`): начисления разового действия (если идёт) → каждый персонаж с назначением, не занятый разовым действием и дееспособный, работает час (в порядке появления в игре) → `hour + 1` → `settle()`.
- Ночью доступны только `sleep` и команды без затрат времени (`set_assignment`, `set_sell_flag`, `choose_option`, `deliver`, `decline`, `equip`, `unequip`, `assign_workshop`). Остальные — ошибка `no_time` с текстом `reason_night`.

## Команды
| Команда | Проверка | Выполнение |
|---|---|---|
| `work_until_stop` | не ночь | часы по одному до остановки (ниже) |
| `sleep` | — | ночь → утро (ниже) |
| `do_action` | действие `once`/`both`, открыто, роли, `enabled_when`, `replace` при замене оборудования, мест для найма, расход, дееспособность, успевает до заката | расход сразу → часы → выходы, эффекты, `action.text`, `action_done` |
| `set_assignment` | персонаж в игре и работает; действие `assignable`/`both`, открыто, `who`/`where`, `enabled_when`; торговля — `trade_open_when` | новое назначение, прогресс партии сбрасывается |
| `market_trip` | не ночь, герой дееспособен, успевает, сырьё — видимые `buy: true`, количества целые ≥ 0, предметы лавки открыты, денег с учётом выручки хватает | продажа → закупка → `market_hours` часов (герой занят) → сигнал `market_trip` |
| `set_sell_flag` | товар видим | галочка |
| `choose_option` | окно — голова очереди `now` или запись доски; вариант открыт и доступен | расход, эффекты, обязательство, предложение закрыто |
| `deliver` / `decline` | активное обязательство; для сдачи — `requires` выполним целиком | см. offers-and-obligations.md |
| `equip` / `unequip` | инструмент в инвентаре героя и слот у персонажа / инструмент в слоте этого персонажа | перенос; если слот занят, прежний предмет уходит в инвентарь. Оборудования команды не касаются |
| `assign_workshop` | работник, мастерская есть, в ней есть место (`max_workers`) | приписка |

**Окно `now`.** Пока очередь `now` не пуста, любая команда, кроме `choose_option` для головы очереди, — ошибка `offer_pending`.

**Недееспособный герой.** `market_trip` и `do_action`, где герой — исполнитель или партнёр, — ошибка `incapacitated` (`reason_incapacitated`).

**Конец игры.** После `end_game` любая команда — `game_over`; `view()` работает.

**Ошибочная команда не меняет состояние.** Проверка идёт до мутаций; дополнительно `perform` снимает снимок состояния и откатывает его при любом исключении.

Коды ошибок и тексты: `invalid` (`reason_invalid`), `not_available` (`reason_not_available`), `requirement_unmet` (текст узла условия / `disabled_text`), `insufficient` (`reason_cost`), `no_time` (`reason_no_time`/`reason_night`), `incapacitated`, `offer_pending` (`reason_offer_pending`), `game_over` (`reason_game_over`).

## `work_until_stop` (core.md 3.15)
Минимум один час. После каждого часа: конец игры → `{reason:"game_over", text: stop_game_over}`; открылось окно → `offer`/`stop_offer`; сработало событие с `stops_time` → `event`/текст его первого `notify`; закат → `sunset`/`stop_sunset`.

## Сон и утро (core.md 3.14)
1. сигнал `night`, обработка;
2. день + 1, час = `day_start`, уведомления очищаются;
3. срок модификаторов `days` − 1; истёкшие снимаются, выполняются `on_expire` (цель `self` — владелец, данные — данные модификатора), сигнал `modifier_expired` (`template`, `owner` и данные модификатора);
4. расходы: `household_expense` мира, `wage` каждого работника, `upkeep` каждой мастерской (через модификаторы изменений денег), строка `log_expenses`;
5. записи доски: `days_left − 1`, на нуле — исчезают, сигнал `offer_expired`;
6. просрочка обязательств: день > день создания + `deadline_days` → `on_fail`, `obligation_failed`, строка `log_failed`;
7. сигнал `morning` (пулы);
8. события по условию;
9. итог дня.

## Итог дня (core.md 3.16)
`summary`: `money_morning` — деньги сейчас; `delta` — к прошлому утру (или к началу игры); `income`/`expense` — суммы движений денег с прошлого утра по источникам (`expense.amount` положительный); `morning` — строки этого утра. Источники: `sale:<персонаж>`, `purchase:<персонаж>`, `wage:<персонаж>`, `upkeep:<мастерская>`, `household`, `event:<id>`, `offer:<id>`, `obligation:<id>`, `action:<id>`; подписи — из `texts.source_*` (`{name}` — имя персонажа или мастерской). Деньги от `on_expire` модификатора идут как `event:<шаблон>`. Расходы действий (цена найма, покупка печи) — `action:<id>`.

## Пример
```ts
const g = createGame(pack, 1);
g.perform({ type: "set_assignment", character: "baker", assignment: { kind: "action", action: "bake_bread" } });
const r = g.perform({ type: "work_until_stop" });
// r.stop = { reason: "event", text: "Муки осталось на пару часов работы." }
g.perform({ type: "market_trip", buy_raw: { flour: 8 }, buy_items: [] });
g.perform({ type: "sleep" }); // view.summary — итог дня
```
