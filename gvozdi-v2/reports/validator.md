# Валидатор
## T-006 Категории действий
Сделано: `categories.json` (необязательный) в `PACK_FILES`, схема `{id, name, view?}` (V001), `category` в схеме действия (ссылка, V003 с подсказкой; без файла любая `category` — V003), дубликаты `id` категорий (V002), W002 для категории без действий; файл не даёт W010. Фикстуры в `fixtures/broken/` (6, через `npm run make-broken`), тест «T-006» (2), `docs/validator/README.md`. Отсутствие файла и поля — без проблем. Тесты валидатора 30/30, typecheck чист. Мини-пак: без изменений (0 ошибок, W001).
Не сделано и почему: —
Открытые вопросы: нет. Ниже — отчёт предыдущего раунда.

Сделано:
- `validator/src`: `loadPack(dir)` (fs), `validatePack(pack)` (без fs), `formatProblems`, CLI `validate <путь> [--json]` (выход 1 при error, 2 без пути).
- Все коды V001–V014, W001–W010 из validator.md; достижимость (раздел 5) неподвижной точкой; предвестник W003 (раздел 6); контексты данных для V006/W004; циклы V008 (Тарьян); подсказки «возможно, имелось в виду» для опечаток id, полей, типов.
- Сообщения по-русски с тем, что исправить; сортировка: сначала ошибки.
- Нет файла / битый JSON → один V001, без каскада V003; проверки всего пака (V010, W001–W003, W009) на неполном паке не выполняются.
- Учтены CI-002 (необязательные ключи texts), CI-003 (`notify.kind`), CI-004 (`visible: false`), CI-005 (`transfer`), CI-007 (`run_event` без проверки условий).
- `fixtures/broken/_base` (0 проблем) и 24 сломанных пака `<код>_<кратко>` — каждый даёт ровно свой код; генератор `validator/scripts/make-broken.ts`.
- Тесты `validator/test/validator.test.ts` (26): база, все сломанные паки, мини-фикстура, формат и CLI, точечные случаи по кодам, устойчивость к мусору (400 случайных порч), скорость (≈750 записей — ~10 мс).
- Описание: `docs/validator/README.md`.
- `fixtures/mini-pack`: ошибок 0, предупреждений 2 — W001 `health` (простуда −60% при `floor_pct` 50, задумано), W005 `collapse` (`stops_time` без `repeat`, см. CI-016).

Не сделано и почему: —

Открытые вопросы:
- CI-013 обязательные поля, не помеченные в core.md (нужна правка core.md 4).
- CI-014 срок модификатора по умолчанию и у `characters[].modifiers` (правка core.md 4.4/4.8).
- CI-015 расширение W003 и W007 (правка validator.md).
- CI-016 W005 на событиях по редкому сигналу (правка validator.md).
- Скрипт пересборки сломанных паков в `package.json` не добавлен (папка оркестратора): `npx tsx validator/scripts/make-broken.ts` (в 2.1 добавлен `npm run make-broken`).

Как проверить:
```
npm run test:validator
npm run validate -- fixtures/mini-pack
npm run validate -- fixtures/broken/V003_unknown_ref --json
npx tsc --noEmit -p validator/tsconfig.json
```

## Контракт 2.1
Сделано:
- texts.json: 38 обязательных ключей (12 из CI-002 + `replace_warning` {item, old}), особый список необязательных убран.
- `names.slots`: слот из `characters[].slots`/`items[].slot` без названия — V003; `names.roles` {hero, worker, family, pet}, `role_name` у персонажа.
- Оборудование: обязательны `line` (snake_case, не ссылка) и `grade` (целое ≥ 1), `slot` запрещён — V001; оборудование в `settings.shop` — V003; `give_item` оборудования не в мастерскую и инструмента в мастерскую — V001 (core.md 3.7).
- `notify.kind`, формат `transfer` — норма контракта; W005 — только события по условию и по сигналам action_done/batch_defect/idle_no_cost/became_visible (CI-016); W007, W003 — по CI-015 (было).
- Достижимость: `give_item` оборудования в мастерскую даёт предмет (без учёта мест).
- База `fixtures/broken/_base` под 2.1; новые сломанные паки: V001_equipment_no_line, V001_equipment_no_grade, V003_slot_no_name, V003_equipment_in_shop, V006_no_replace_warning — всего 29, каждый даёт ровно свой код.
- `fixtures/mini-pack` (контракт 2.1): ошибок 0, предупреждений 1 — W001 `health` (задумано). W005 `collapse` ушёл.
- `packs/nails_for_count` (до правки Контентом): 16 ошибок — V001 ×12 (6 единиц оборудования без `line`/`grade`), V003 ×3 (слоты hand/apron/belt без `names.slots`), V006 ×1 (нет `replace_warning`).

Не сделано и почему: —

Открытые вопросы: —

Как проверить:
```
npm run make-broken
npm run test:validator
npm run validate -- fixtures/mini-pack
npm run validate -- packs/nails_for_count
```

## T-002 Описание у действия (2026-10-27)
Сделано: `description` добавлено в схему действия (`validator/src/schema.ts`) как необязательная строка: отсутствие и `null` — без проблем, число/массив — V001 (путь `description`), W010 нет. Новый сломанный пак `fixtures/broken/V001_action_description_type` (генератор `make-broken.ts`, всего 30). Тест «T-002» в `validator/test/validator.test.ts`. `docs/validator/README.md` обновлён (V001, число паков).
Не сделано и почему: —
Открытые вопросы: —
Как проверить: `npm run test:validator` (28 passed), `npm run typecheck`.

## T-015 Проверка полей pack.json (2026-10-31)
Сделано: T-015 выполнена — по validator.md V001 и core.md 4.2 в схеме `pack.json` (`validator/src/schema.ts`, `PackMeta`): `version` стал обязательным; `name` и `version` проверяются новым комбинатором `NonEmptyS` (не строка, `null`, `""`, одни пробелы — V001 по своему полю); `description` — необязательная строка, `null` или отсутствие — без ошибок и без W010, не строка — V001 (путь `description`). Новые сломанные паки (генератор `validator/scripts/make-broken.ts`): `fixtures/broken/V001_pack_empty_version`, `fixtures/broken/V001_pack_description_type` — всего 38, каждый даёт ровно V001. Тест «T-015» в `validator/test/validator.test.ts`. `docs/validator/README.md`: строка V001, правило «Поля pack.json» с примерами сообщений, число паков. `fixtures/mini-pack` не трогал (description туда добавляет Ядро): сейчас ошибок 0, W001 `health` (как и было). `packs/nails_for_count`: ошибок и предупреждений нет. Задача удалена из TASKS.md.
Не сделано и почему: —
Открытые вопросы: пустая строка в `description` допускается — контракт её не запрещает (core.md 4.2 требует непустоты только от `name`/`version`).
Как проверить: `npm run make-broken`, `npm run test:validator` (31 passed), `npm run typecheck`.
