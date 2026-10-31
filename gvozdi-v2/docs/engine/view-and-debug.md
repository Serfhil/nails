# Вид и отладочный вид (`view.ts`)

**Назначение.** `view()` — только видимое игроку, все строки готовы (из `texts.json` и данных пака). `debugView()` — всё состояние для симулятора, валидатора и контентщика.

Сборка вида не меняет состояние (ошибки подстановок при сборке не пишутся).

## View (core.md 5.3) — как заполняется
- `meta`: день, час, границы дня, `is_night`, `game_title = pack.name`; данные пака из `pack.json` (core.md 4.2): `pack_id = pack.id`, `pack_version = pack.version`, `pack_description = pack.description` (строка) или `null`, если поля нет или оно `null`. Пример: `{ game_title: "Мини-пекарня", pack_id: "mini_bakery", pack_version: "0.1.0", pack_description: "Маленькая пекарня…" }`.
- `money`: `names.money`, `names.money_short`, итог `money`.
- `stress`: если `stress` видна у героя — имя (`names.stress`), значение, `max`, название ступени, `warning` — ступень выше первой.
- `notifications` — строки `notify` за сегодня; `summary` — итог последнего утра (null до первого сна).
- `pending_offer` — голова очереди окон.
- `actions` — открытые действия (см. actions-and-costs.md); `description` — текст пака или `null`; при замене оборудования у действия есть `replace`.
- `characters` — видимые персонажи в игре, в порядке появления; `role_name`, `slots[].slot_name`, `equippable` (см. hiring-and-workshops.md).
- `hire_pool` — видимые кандидаты пула (`CandidateView`).
- `VarView.display` — готовая строка по `format`: `number` — до 2 знаков после запятой, разделитель — запятая («0,8»); `pct` — доля × 100 и «%» («25%»); `money` — число и `names.money_short` («25 мон.»). `vars` — видимые переменные (все числа вида проходят `norm` — без шума плавающей точки, см. variables-and-ladders.md), `slots`, `assignment` (`label`: имя действия / `texts.assign_idle` / `texts.assign_trade`), `assignable` (без дела; открытые поручаемые действия, подходящие по `who`/`where`, `enabled` по `enabled_when`; торговля, если разрешена), `effects`. `workshop` у героя — `null`.
- `workshops` — все видимые мастерские игрока; `workers` — приписанные видимые работники.
- `storage`, `inventory` (эффекты — модификаторы шаблона предмета, предпросмотр), `market`, `board`, `obligations` (активные), `effects` (видимые модификаторы мира), `ending`.
- `EffectView.id` — `m<N>` у хранимых, `src:…` у модификаторов от источника.

## DebugView
| Поле | Содержимое |
|---|---|
| `time`, `ending` | время, концовка |
| `entities` | мир, персонажи, мастерские, предметы: все переменные (`raw`, `value`, `level`, `step`), все модификаторы (хранимые и от источников, срок, данные, видимость), `extra` (назначение, прогресс партии, слоты, недееспособность, видимость, место предмета, оборудование) |
| `hire_pool`, `stock`, `calc` | пул, склад с галочками, все расчётные величины |
| `actions` | все действия, открытые и закрытые: `open`, трассировки `open_when` и `enabled_when` (каждый узел с результатом), `available`, `reason` |
| `offers` | очередь окон и доска: данные, участник, варианты с трассировками |
| `obligations` | все, со статусом и днём срока |
| `event_counts`, `event_last_day` | счётчики событий |
| `opened`, `fired`, `endings_fired` | реестры «открывалось» (первый день), «срабатывало» (первый день), концовки |
| `errors` | ошибки выполнения: переполнение цепочки, отсутствующие данные, неизвестные ссылки |
| `rng_state` | состояние ГСЧ |

## Пример
```ts
const d = game.debugView();
d.actions.find(a => a.id === "bake_cake").open_trace;
// { node: "{\"type\":\"has_modifier\",\"subject\":\"workshop\",\"template\":\"has_oven\"}", result: false }
```
