# contract.ts — типы контракта

Назначение: копия типов core.md 5.1–5.3 (версия контракта 2.1: `hire_pool` / `CandidateView`, `ActionView.replace` и `do_action.replace`, `VarView.display`, `role_name`, `slot_name`, `equippable`) (`View`, `Command`, `Result`, `Line`, `ActionView`, `CharacterView`, `OfferView`, `ObligationView`, `EffectView`, `WorkshopView`, `StockLine`, `CostLine`) и интерфейсы `Game`, `GameApi` (`createGame`, `loadGame`).

Правила:
- Источник истины — core.md 5. Расхождение с движком — запись в `CONTRACT_ISSUES.md`.
- Вложенные типы вынесены под своими именами (`VarView`, `MarketView`, `SummaryView`, `OfferOptionView`, `AssignableView` и т. д.) только для удобства; форма та же, что в core.md.
- `Pack` — объект формы CI-001; интерфейсу из него нужен только `pack.id` (ключ сохранения).
- Совместимость с типами движка проверяется тестом `ui/test/engine.test.ts`.

Добавлено: `View.categories: CategoryView[]` (`id`, `name`, `view: "list" | "select"`) и `ActionView.category: string | null` (core.md 5.3).

Добавлено (T-017): `View.meta.pack_id`, `pack_version`, `pack_description: string | null` (core.md 5.3) — сведения о паке в окне «Настройки».
