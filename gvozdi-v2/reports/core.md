# Ядро

Сделано:
- `fixtures/mini-pack` («Мини-пекарня», `mini_bakery`) покрывает все пункты core.md 8, есть `READY.md`. Валидатор: 0 ошибок, 2 предупреждения. W001 (простуда опускает здоровье ниже `floor_pct`) — так задумано. W005 на `collapse` — см. CI-016.
- Движок `engine/src` (точка входа `index.ts`): `createGame`, `loadGame`, `Game.view/debugView/perform/save` и все типы контракта core.md 5. Чистая библиотека без `fs` и DOM, собирается esbuild под браузер (~104 КБ). Модули: game, time, vars, modifiers, conditions, effects, actions, costs, calc, events, offers, market, workforce, view, state, rng, pack, engine.
- Расчёт по core.md 3: модификаторы значений и изменений (с направлением, `value_from`, `action_tags`, копии); лестницы с сигналами `ladder_step`; партии с дробным прогрессом и браком; найм; мастерские и апгрейд с переносом; недееспособность; сигналы, пулы, события по условию (переход ложь → истина), предел цепочки; окна, доска, обязательства; рынок и торговец; сон и итог дня с источниками денег; видимость и `became_visible`; сохранение с ГСЧ sfc32.
- Ошибочная команда не меняет состояние: сначала проверка, а на случай исключения — снимок и откат.
- Тесты `engine/test` — 66, все проходят:
  - детерминизм и save/load;
  - ошибочные команды;
  - каждое правило 3.1–3.17;
  - весь список приёмки 7;
  - случайные прогоны «нет скрытого в виде»;
  - поиск id и текстов фикстуры в `engine/src`.
- Документация: `docs/engine/README.md` (API, оглавление) и 14 описаний модулей.
- В `CONTRACT_ISSUES.md` добавлены CI-002…CI-008 и CI-017…CI-019.

Не сделано и почему:
- `npm run typecheck`: в `engine/` ошибок нет. Одна ошибка — в чужом `ui/test/engine.test.ts:81` (`message?.text` типа `string | undefined` передаётся в `assert.equal`).

Открытые вопросы (нужна правка core.md — к владельцу):
- CI-002: необязательные служебные тексты (`assign_idle`, `assign_trade`, `reason_*`, `stop_game_over`, `popup_*`). Если ключа нет, движок показывает сам ключ.
- CI-003: поле `kind` у `notify`.
- CI-005: формат `transfer`.
- CI-006: нет команды установки оборудования из инвентаря. Пока — расширение `equip` с id мастерской.
- CI-007: `run_event` не проверяет `trigger`.
- CI-008: кандидаты пула идут в `characters`.
- CI-017: что значит `stress.warning`.
- CI-018: округление денег.
- CI-019: при браке эффекты не применяются.
- Вопросы Интерфейса, которые касаются вида движка: CI-009 (название слота), CI-010 (масштаб `pct` — движок отдаёт итог как есть), CI-011 (подпись роли), CI-012 (что можно надеть). Они требуют новых полей в View.

Как проверить:
```
npm run test:engine
npm run typecheck
npm run validate -- fixtures/mini-pack
npx esbuild engine/src/index.ts --bundle --platform=browser --format=esm --outfile=/tmp/engine.js
```

## Интеграция, круг 1
Сделано: убран шум плавающей точки (`74.00000000000003`). Функция `norm` в `engine/src/engine.ts` округляет до 9 знаков. Она стоит везде одинаково:
- в состоянии: сырые и итоговые значения, изменения, `value_from`, склад, цены, деньги и итог дня, расчётные величины;
- во всех числах View: переменные, стресс, деньги, CostLine, склад, рынок.
В строках числа по-прежнему форматируются до 2 знаков. Тест `engine/test/numbers.test.ts`: точные значения на фикстуре (0.15, 13.2), чистота чисел после save/load, случайные прогоны по фикстуре и по `packs/nails_for_count` (проверяются числа вида и строки `events`/`stop`/`error`). Документация — `docs/engine/variables-and-ladders.md`.
Проверка: `npm run test:engine` — 69 тестов, все проходят; `npm test` — 136, все проходят; `npm run typecheck` — без ошибок.

## Контракт 2.1
Сделано:
- **Оборудование.** Новый модуль `engine/src/equipment.ts`: линейка `line` и уровень `grade`, четыре случая установки (поставить нельзя / прямой апгрейд / свободное место / замена).
  - Действие, которое ставит оборудование, скрыто в случае 1.
  - В случае 4 у действия есть `ActionView.replace` (предупреждение `replace_warning` и варианты). `do_action` без `replace` даёт `requirement_unmet` с текстом предупреждения.
  - В событиях и предложениях случаи 1 и 4 предмет не выдают; это пишется в отладочный вид.
  - Оборудование не попадает ни в инвентарь, ни в лавку (кроме `overflow: "inventory"`).
  - Расширение `equip`/`unequip` с id мастерской убрано.
- **Вид:**
  - `View.hire_pool` (`CandidateView`); кандидатов больше нет в `characters`;
  - `VarView.display` по `format` (`number`, `pct` долей, `money`);
  - `CharacterView.role_name` (поле шаблона, иначе `names.roles`), `slots[].slot_name` (из `names.slots`), `equippable`;
  - `stress` не менялся.
- **Служебные тексты.** Ключи 4.14 обязательны. Голый ключ показывается только как аварийный вариант.
- **Фикстура** под 2.1 и раздел 8:
  - линейка печи 1 → 2, тестомес, витрина: все 4 случая и скрытая покупка;
  - `names.slots`, `names.roles`, `role_name`;
  - `defect` в формате `pct`;
  - `replace_warning`.
  READY.md обновлён («Контракт 2.1»). Валидатор: 0 ошибок, 1 предупреждение (W001, задумано).
- **Тесты** `engine/test/contract21.test.ts` по 10.7: все 4 случая оборудования, `do_action` без `replace`, события без выбора, лавка без оборудования, `hire_pool`, `equippable`, `slot_name`/`role_name`, `display` по каждому формату.
- **Документация:** `docs/engine` обновлена.
- **CONTRACT_ISSUES:** у CI-002, 003, 005, 006, 008, 009, 010, 011, 012, 020 дописано «Внесено: core.md 2.1, движок — сделано».

Проверка: `npm run test:engine` — 76 тестов, все проходят; `npm test` — 144, все проходят; `npm run typecheck` — 0 ошибок (в /ui тоже); поиск id и текстов пака в `engine/src` — чисто.

Решения на своё усмотрение (core.md не противоречат, вопросов к контракту не открывал):
- если в мастерской несколько экземпляров той же линейки ниже уровнем, апгрейд заменяет самый низкий;
- без `line` линейкой считается id типа, без `grade` уровень равен 1;
- `give_item` оборудования с целью-персонажем ставит его в мастерскую этого персонажа;
- при апгрейде мастерской оборудование переносится по порядку, без правил линеек;
- ключ `reason_busy_slot` движок не использует: занятый слот инструмента освобождается, прежний предмет уходит в инвентарь.

## T-001 Описание у действия (2026-10-27)
Сделано: `ActionDef.description?: string | null` и `ActionView.description: string | null` (`engine/src/types.ts`); `view.ts` отдаёт `a.description ?? null`. Фикстура: у `bake_bread` есть описание, у остальных (например `rest`) — нет. Тест в `engine/test/contract21.test.ts` (с описанием, без поля, явный `null`). Описание в `docs/engine/actions-and-costs.md` и `view-and-debug.md`. Статус T-001 в TASKS.md — «сделана».
Не сделано и почему: —
Открытые вопросы: —
Как проверить: `npm run test:engine` (77 проходят), `npm run typecheck` (чисто).

## Категории действий (T-005)
Сделано: необязательный `categories.json` (порядок сохраняется, `view` по умолчанию `list`), `category` у действия; `ActionView.category` (null, если нет) и `View.categories` — только категории с хотя бы одним открытым действием, в порядке файла. Пак без файла и поля работает (`[]`/`null`). Код: `engine/src/{types,pack,view,index}.ts`. Фикстура: `fixtures/mini-pack/categories.json` (`baking` select, `care` list), категории у пяти действий, остальные без категории. Тест `engine/test/categories.test.ts` (4 теста: скрытие, порядок, view по умолчанию, пак без категорий); помощник `engine/test/helpers.ts` читает `categories.json`. Описание: `docs/engine/categories.md`. T-005 — «сделана».
Не сделано и почему: проверка `category` на существующий id (V003) — зона валидатора; движок неизвестный id только отдаёт как есть. Другим потребителям (загрузчик пака `loadPack`, сборка) нужно читать `categories.json` — зона Валидатора/Оркестратора.
Открытые вопросы: —
Как проверить: `npm run test:engine` (81 проходит), `npm run typecheck` (чисто).

## T-014 Версия и описание пака в виде (2026-10-31)
Сделано: `PackMeta.description?: string | null` (core.md 4.2); `View.meta` дополнен полями `pack_id`, `pack_version`, `pack_description: string | null` (core.md 5.3), `game_title` по-прежнему = `name`. Код: `engine/src/types.ts`, `engine/src/view.ts`. Если `description` — не строка (нет поля или `null`), отдаётся `null`. Типы `View`/`PackMeta` уже экспортировались из `index.ts`, менять не пришлось. Фикстура: `description` в `fixtures/mini-pack/pack.json`. Тест `engine/test/pack-meta.test.ts`: с описанием; без поля (игра идёт, save/load); явный `null`. Документация: `docs/engine/view-and-debug.md`. T-014 удалена из TASKS.md.
Не сделано и почему: проверка полей pack.json — T-015 (Валидатор).
Открытые вопросы: —
Как проверить: `npm run test:engine` (83 проходят), `npm run typecheck` (чисто).
