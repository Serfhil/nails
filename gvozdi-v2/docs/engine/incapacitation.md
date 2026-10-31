# Недееспособность (`vars.ts`: `incapReasons`, `isIncap`, `isIncapPermanent`)

**Назначение.** Определяет, может ли персонаж работать и участвовать в действиях.

## Правила
- Причины: переменная с `floor_pct`, у которой итог < `сырое × floor_pct / 100`; модификатор с `incapacitates: true` (хранимый или от источника).
- **Постоянная** — все причины — хранимые модификаторы с `duration.kind: "forever"` (причины по `floor_pct` и сроки делают её временной).
- Переход в недееспособность — сигнал `incapacitated {owner, permanent}` (проверяется в `settle()`).
- Недееспособный: не работает по назначению, не может быть исполнителем или партнёром, не попадает в `ActionView.roles`. Назначение сохраняется и продолжается после выздоровления.
- Недееспособный герой: доступны `sleep`, `work_until_stop`, `do_action` с другим исполнителем, `set_assignment`, `equip`, `unequip`, `set_sell_flag`, `choose_option`, `deliver`, `decline`, `assign_workshop`; `market_trip` и действия героя — `incapacitated` с текстом `reason_incapacitated {name}`.
- Конец игры при постоянной недееспособности — решение пака (событие по условию `incapacitated` с `permanent: true`).

## Вид
`CharacterView.status: "incapacitated"`, `incapacitated_permanent`.

## Пример
`flu`: `health` −60% при `floor_pct: 50` → итог 40 < 50 — недееспособен два дня.
