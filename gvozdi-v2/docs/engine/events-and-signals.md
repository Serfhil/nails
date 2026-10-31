# События и сигналы (`events.ts`)

**Назначение.** Очередь сигналов и запущенных событий; пулы; повторяемость; участник; события по условию; слежение за переходами.

## Сигналы
`game_start`, `night`, `morning`, `action_done {action, actor, partner}`, `batch_defect {action, actor}`, `idle_no_cost {action, actor}`, `ladder_step {var, owner, step, level, dir}`, `modifier_expired {template, owner, …данные}`, `became_visible {kind, id, owner}`, `incapacitated {owner, permanent}`, `hired {character}`, `market_trip {sold, spent}`, `obligation_done|failed|declined {obligation, …данные}`, `offer_expired {offer, …данные}`. Значения — числа, строки, `id` (вложенных объектов нет).

## Запуск события
- **по сигналу** (`trigger.signal`): все `trigger.conditions` истинны (контекст — данные сигнала и участник);
- **по условию** (нет `signal`, `conditions` не пусты): проверяется в каждом `settle()` (после часа, команды, утром); срабатывает при переходе ложь → истина. Прошлое значение хранится в сохранении;
- **вызовом** (`run_event`): `trigger` не проверяется (CI-007).

`repeat.max` — не больше N раз за забег; `repeat.cooldown_days` — не раньше чем через N дней после прошлого срабатывания. Ограничения действуют при любом способе запуска.

## Пулы
События одного `trigger.pool` на одном сигнале: сначала бросок `rand() < settings.pools[pool].chance` (нет настройки — 1), затем выбор одного из подходящих (повтор, участник, условия) по `weight` (по умолчанию 1; вес ≤ 0 — не выбирается). События без пула обрабатываются раньше пулов, в порядке пака.

## Участник
- `participant.from: "signal"` — первый из `owner`, `actor`, `character` в данных сигнала, если это персонаж в игре и выполнено `where`;
- `participant.pick: "random"` — случайный из `among` (`workers`, `characters` — все в игре, `family`) с `where` (`self` = кандидат);
- подходящего нет — событие не срабатывает.

## Данные
`data_defaults` события ⊕ данные источника (сигнал, `run_event`). Читаются как `{"$data": "имя"}` и `{имя}` в текстах.

## Остановка времени
Событие с `stops_time: true` останавливает `work_until_stop`; текст — первый `notify` события с подстановками.

## Порядок и глубина
Очередь FIFO. Каждая задача имеет глубину: сигнал/событие верхнего уровня — 1, порождённые — +1. Задача глубже `settings.max_event_chain` (32) не выполняется, в `debugView().errors` пишется «переполнение цепочки событий».

## Переходы (`settle`)
До затишья (не больше 64 кругов): очередь → снятие `while`-модификаторов → лестницы (`ladder_step`) → недееспособность (`incapacitated`) → видимость (`became_visible`) → события по условию.

## Пример
```json
{ "id": "theft", "trigger": { "signal": "modifier_expired", "conditions": [
    { "type": "data", "name": "template", "op": "==", "value": "thief_watching" },
    { "type": "calc", "name": "wealth", "op": ">", "value": 150 } ] },
  "effects": [ { "type": "var", "target": "world", "var": "money", "add": -40 } ] }
```
