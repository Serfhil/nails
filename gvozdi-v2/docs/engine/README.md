# Движок — документация

Движок текстового инкрементала по `core.md` (контракт 2.1). Чистая библиотека TypeScript без ввода-вывода и DOM: её бандлит esbuild вместе с интерфейсом и паком. В коде нет ни одного `id`, названия или текста пака, кроме зарезервированных переменных (core.md 4.3) — это проверяет тест `engine/test/purity.test.ts`.

## API (core.md 5.1)

```ts
import { createGame, loadGame } from "./engine/src/index.ts";

const game = createGame(pack, seed);   // pack — объект Pack (CONTRACT_ISSUES CI-001)
const v = game.view();                  // View: только видимое игроку
const r = game.perform({ type: "work_until_stop" }); // Result: ok, error?, events, stop?, view
const s = game.save();                  // строка JSON
const g2 = loadGame(pack, s);           // бросает Error с понятным текстом, если сохранение несовместимо
game.debugView();                       // DebugView: всё состояние, раздел 6
```

`Pack` — объект, ключи которого — имена файлов пака без `.json`: `{ pack, variables, modifiers, goods, items, workshops, characters, actions, events, offers, texts, strategy_hints? }`.

Все типы контракта экспортируются из `engine/src/index.ts`: `Pack`, `Game`, `Command`, `Result`, `View`, `Line`, `ActionView`, `CharacterView`, `EffectView`, `WorkshopView`, `StockLine`, `CostLine`, `OfferView`, `ObligationView`, `DebugView` и типы записей пака.

## Модули

| Файл | Документ | Что делает |
|---|---|---|
| `game.ts` | [time-and-commands.md](time-and-commands.md) | API, разбор команд, откат ошибочной команды |
| `time.ts` | [time-and-commands.md](time-and-commands.md) | «Заняться делом», сон, утро, итог дня |
| `vars.ts` | [variables-and-ladders.md](variables-and-ladders.md) | сырое и итоговое значение, изменения, лестницы |
| `modifiers.ts` | [modifiers.md](modifiers.md) | сбор действующих модификаторов, наложение, снятие, числа для вида |
| `conditions.ts` | [conditions.md](conditions.md) | дерево условий, причины, трассировка |
| `effects.ts` | [effects.md](effects.md) | эффекты пака |
| `actions.ts`, `costs.ts` | [actions-and-costs.md](actions-and-costs.md) | доступность, разовые действия, назначения, партии, брак, расход |
| `events.ts` | [events-and-signals.md](events-and-signals.md) | очередь сигналов, пулы, события по условию, переходы |
| `offers.ts` | [offers-and-obligations.md](offers-and-obligations.md) | окна, доска, обязательства |
| `market.ts` | [market-and-trade.md](market-and-trade.md) | склад, рынок, торговец |
| `workforce.ts` | [hiring-and-workshops.md](hiring-and-workshops.md) | персонажи, найм, мастерские, предметы |
| `equipment.ts` | [hiring-and-workshops.md](hiring-and-workshops.md#оборудование) | линейки и уровни оборудования, 4 случая установки, замена |
| `vars.ts` (недееспособность) | [incapacitation.md](incapacitation.md) | недееспособность |
| `events.ts`, `view.ts` | [visibility.md](visibility.md) | видимость и `became_visible` |
| `view.ts` | [view-and-debug.md](view-and-debug.md) | обычный и отладочный вид |
| `state.ts`, `rng.ts`, `game.ts` | [save.md](save.md) | состояние, сохранение, ГСЧ, детерминизм |
| `calc.ts` | [actions-and-costs.md](actions-and-costs.md#расчётные-величины) | расчётные величины |
| `pack.ts`, `engine.ts` | этот файл | индекс пака, общий контекст |

## Устройство

- `Engine` (`engine.ts`) держит индекс пака (`pack.ts`), сериализуемое состояние `State` (`state.ts`), кэш вычислений и переходные данные команды (строки `Result.events`, запрос остановки, занятые разовым действием персонажи).
- Любая мутация состояния вызывает `touch()` — кэш итоговых значений и модификаторов сбрасывается.
- Сущности адресуются ссылками: `world`, `char:<id>`, `ws:<id>`, `item:<id>`. Персонаж в игре имеет `id` своего шаблона; мастерские и предметы — сгенерированные `ws<N>`, `it<N>`.
- После каждого часа, каждой команды и утром вызывается `settle()`: очередь событий, переходы лестниц, недееспособность, видимость, события по условию — до затишья.

## Тесты

`npm run test:engine` — тесты в `engine/test/`: детерминизм и save/load (`core.test.ts`), правила раздела 3 (`rules-a…d.test.ts`), видимость (`visibility.test.ts`), чистота кода от контента (`purity.test.ts`). Фикстура — `fixtures/mini-pack` («Мини-пекарня»).

## Решения по дырам контракта

В core.md 2.1 вошли (decisions-log.md): служебные тексты обязательны (CI-002), `notify.kind` (CI-003), формат `transfer` (CI-005), оборудование с линейками и заменой (CI-006, CI-020), `View.hire_pool` (CI-008), `slot_name` (CI-009), `display` (CI-010), `role_name` (CI-011), `equippable` (CI-012). Решения движка вне core.md: CI-004 (`visible: false`), CI-007 (`run_event`), CI-017 (`stress.warning`), CI-018 (округление денег), CI-019 (эффекты при браке).

Служебный текст, которого нет в texts.json, движок показывает самим ключом. Это аварийный вариант для непроверенного пака, а не норма: валидатор требует все ключи 4.14.
