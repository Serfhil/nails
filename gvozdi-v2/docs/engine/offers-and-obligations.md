# Предложения и обязательства (`offers.ts`)

**Назначение.** Выбор игрока: окно «сейчас» и записи доски; принятые заказы со сроком.

## Предложение
Создаётся эффектом `show_offer` (экземпляр `of<N>`). Наследует участника вызвавшего события; данные: `data_defaults` и `data` предложения < данные события < `data` эффекта.
- `delivery: "now"` — очередь окон; голова очереди — `view.pending_offer`; пока очередь не пуста, работает только `choose_option` для головы.
- `delivery: "board"` — `view.board`, `days_left = board_days` (по умолчанию 1); каждое утро −1, на нуле исчезает с сигналом `offer_expired`.
- `notify` с `popup: true` создаёт окно без шаблона: заголовок `texts.popup_title`, один вариант `ok` с подписью `texts.popup_ok`.

## Вариант
`open_when` ложно — варианта нет в виде, выбор — `not_available`. `enabled_when` ложно — серый с причиной (`text` узла / `disabled_text`), выбор — `requirement_unmet`. Расход не выполним — серый с `reason_cost`, выбор — `insufficient`. Выбор: предложение закрывается → расход (`offer:<id>`) → эффекты → обязательство. Контекст: `participant` и `self` — участник (нет — герой), данные предложения.

## Обязательство
Экземпляр `ob<N>`; `tpl` — `obligation.id` (по нему условие `obligation`). `requires` и `deadline_days` разрешаются по данным в момент создания. Поля вида: `title`, `days_left = день создания + deadline − сегодня` (null без срока), `requires` (нужно/есть), `can_deliver`.
- `deliver` — `requires` целиком (товар, лежавший до взятия, засчитывается), бесплатно по времени; `on_done`, сигнал `obligation_done`, строка `log_delivered`.
- `decline` — `on_decline`, `obligation_declined`, `log_declined`.
- Утром: день > создания + срок → `on_fail`, `obligation_failed`, строка `log_failed` (в уведомлениях и итоге утра).
- Закрытые обязательства из вида уходят, в состоянии остаются со статусом (`done`, `failed`, `declined`).

## Пример
```json
{ "id": "neighbor_bread", "delivery": "board", "board_days": 2, "data": { "qty": 4, "days": 2, "reward": 15 },
  "options": [ { "id": "take", "label": "Взять", "obligation": {
      "id": "neighbor_bread_ob", "title": "Хлеб для соседки",
      "requires": [ { "good": "bread", "qty": { "$data": "qty" } } ], "deadline_days": { "$data": "days" },
      "on_fail": [ { "type": "run_event", "event": "order_failed", "data": { "penalty": -10 } } ] } },
    { "id": "skip", "label": "Не брать" } ] }
```
`show_offer` с `data: {qty: 6}` даст заказ на 6 буханок.
