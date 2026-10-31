# Graph Report - blacksmith  (2026-10-31)

## Corpus Check
- Large corpus: 594 files · ~222,838 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1510 nodes · 4604 edges · 61 communities (59 shown, 2 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 399 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Engine Entry & Pack Index
- Validator Schema
- UI Model Helpers
- UI Game API & DOM
- Engine Core
- Actions Engine
- Costs & Batches
- UI App Controller
- Validator Checks
- Frontend Design Guidance
- Conditions & Modifiers
- UI Stub & App Tests
- Effects Engine
- GitHub Pages Workflow
- Broken Fixtures Generator
- Simulator CLI
- Contract Issues (View)
- Validator Pack Index
- Reachability Analysis
- Project Rules & Graph
- UI Overlays & Site Build Docs
- Simulator Strategies
- Event Processing
- UI Contract Types
- Validator Entry & Walker
- Core Spec & Event Issues
- Actions Docs
- Market Engine
- Validator Docs & Codes
- Site Build Script
- Content Guide
- Owner Decisions Log
- Simulator Strategies Doc
- UI Model Flows
- Action Categories Feature
- Engine Documentation
- Package Manifest
- Simulator Coverage
- Effects Docs
- NPM Scripts
- Simulator Bot
- Root TypeScript Config
- View Formatting & Reports
- Event Data Contexts
- Time & Settle Order
- Events & Signals Docs
- Role Surfaces & Tasks
- Incapacitation
- Simulator Report
- UI Purity Test
- Hidden Content Question
- Content Recipes & W003
- Simulator Contract Issues
- UI Render & Mobile Layout
- Simulator Pack Hints
- Commands & Expiry
- Conditions Docs
- Market & Trade Docs
- Simulator TS Config
- Validator TS Config
- Role Report Format

## God Nodes (most connected - your core abstractions)
1. `isObj()` - 60 edges
2. `charRef()` - 46 edges
3. `Engine` - 44 edges
4. `finalValue()` - 44 edges
5. `CONTRACT_ISSUES — журнал вопросов к контракту` - 38 edges
6. `applyEffect()` - 36 edges
7. `createApp()` - 36 edges
8. `arr()` - 36 edges
9. `validatePack()` - 34 edges
10. `renderApp()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `Команды проекта (npm ci/test/validate/build:site/sim)` --semantically_similar_to--> `Команды проекта (§7)`  [INFERRED] [semantically similar]
  README.md → gvozdi-v2/claude.md
- `Гвозди для графа — README репозитория` --references--> `core.md — ТЗ движка (контракт 2.1)`  [EXTRACTED]
  README.md → gvozdi-v2/core.md
- `Сборка сайта build:site` --conceptually_related_to--> `Публикация на GitHub Pages (pages.yml)`  [INFERRED]
  gvozdi-v2/view.md → README.md
- `Вопросы из графа проекта (graphify)` --references--> `core.md — ТЗ движка (контракт 2.1)`  [EXTRACTED]
  graph-questions.md → gvozdi-v2/core.md
- `Движок — документация (README)` --references--> `Мини-пекарня (mini_bakery) test fixture pack`  [INFERRED]
  gvozdi-v2/docs/engine/README.md → gvozdi-v2/fixtures/mini-pack/READY.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Скрытый контент: замысел, метрика симулятора и достижимость V010** — gvozdi_v2_content_hidden_content_replayability, gvozdi_v2_simulator_hidden_content_metric, gvozdi_v2_validator_v010_reachability, gvozdi_v2_core_visibility, graph_questions_hidden_metric_vs_v010 [INFERRED 0.85]
- **Синхронизация копий контракта core §4/§5 в content.md и view.md** — gvozdi_v2_core_pack_contract, gvozdi_v2_core_interface_contract, gvozdi_v2_content_guide, gvozdi_v2_view_guide, gvozdi_v2_claude_contract_sync [EXTRACTED 1.00]
- **Эскалация: роль → CONTRACT_ISSUES → Оркестратор → владелец → core.md** — gvozdi_v2_contract_issues_doc, gvozdi_v2_claude_escalation, gvozdi_v2_claude_role_orchestrator, gvozdi_v2_claude_new_owner_rule, gvozdi_v2_core_engine_spec [EXTRACTED 1.00]
- **Решения владельца 2026-10-27 по вопросам контракта (core.md 2.1)** — gvozdi_v2_decisions_log_core_21_edits [EXTRACTED 1.00]
- **Action categories feature across roles (T-005..T-008)** — gvozdi_v2_docs_engine_categories_categories_json, gvozdi_v2_docs_engine_categories_view_categories, gvozdi_v2_docs_ui_contract_categoryview, gvozdi_v2_docs_ui_model_groupactions, gvozdi_v2_reports_validator_t006, gvozdi_v2_reports_content_categories_t007 [INFERRED 0.85]
- **settle() quiescence pipeline** — gvozdi_v2_docs_engine_events_and_signals_settle_order, gvozdi_v2_docs_engine_modifiers_while_modifiers, gvozdi_v2_docs_engine_variables_and_ladders_ladder, gvozdi_v2_docs_engine_incapacitation_incapacitation, gvozdi_v2_docs_engine_visibility_became_visible, gvozdi_v2_docs_engine_events_and_signals_conditional_events [EXTRACTED 1.00]
- **Equipment placement/replace flow across engine, UI and validator (contract 2.1)** — gvozdi_v2_docs_engine_hiring_and_workshops_equipment_placement, gvozdi_v2_docs_engine_hiring_and_workshops_equipment_line_grade, gvozdi_v2_docs_ui_model_replacecommand [INFERRED 0.85]
- **UI event -> command -> render cycle** — gvozdi_v2_docs_ui_dom_mount, gvozdi_v2_docs_ui_app_createapp, gvozdi_v2_docs_ui_render_renderapp, gvozdi_v2_docs_ui_model_uistate, gvozdi_v2_docs_ui_storage_savekey [EXTRACTED 1.00]
- **Modal windows sharing the inert-overlay pattern** — gvozdi_v2_docs_ui_styleguide_index_modal_overlay, gvozdi_v2_docs_ui_styleguide_index_pending_offer_modal, gvozdi_v2_docs_ui_styleguide_index_replace_modal, gvozdi_v2_docs_ui_styleguide_index_day_summary_modal, gvozdi_v2_docs_ui_styleguide_index_settings_modal [EXTRACTED 1.00]
- **People panels built from person cards** — gvozdi_v2_docs_ui_styleguide_index_panel_workers, gvozdi_v2_docs_ui_styleguide_index_panel_family, gvozdi_v2_docs_ui_styleguide_index_panel_hire, gvozdi_v2_docs_ui_styleguide_index_person_card [EXTRACTED 1.00]
- **Settings window pack choice (T-017)** — gvozdi_v2_docs_ui_build_site_build, gvozdi_v2_docs_ui_packs_packsforview, gvozdi_v2_docs_ui_render_settingsmodal, gvozdi_v2_docs_engine_view_and_debug_view_meta, gvozdi_v2_docs_ui_storage_savekey [INFERRED 0.85]

## Communities (61 total, 2 thin omitted)

### Community 0 - "Engine Entry & Pack Index"
Cohesion: 0.05
Nodes (85): createGame(), loadGame(), byId(), indexPack(), PackIndex, ActionDef, Assignment, CandidateView (+77 more)

### Community 1 - "Validator Schema"
Cohesion: 0.05
Nodes (81): A(), Action, ALL_ANY, AMONG, B(), CALCS, Category, Character (+73 more)

### Community 2 - "UI Model Helpers"
Cohesion: 0.10
Nodes (68): actionEnabled(), activeWorkshop(), canAssign(), canPickWorkshop(), familyOf(), fmtHour(), fmtMoney(), fmtNum() (+60 more)

### Community 3 - "UI Game API & DOM"
Cohesion: 0.06
Nodes (39): AppOptions, GameApi, Pack, actor(), DocLike, ElLike, FocusLike, mount() (+31 more)

### Community 4 - "Engine Core"
Cohesion: 0.09
Nodes (31): Engine, fmtValue(), StopRequest, WORLD_REF, actionEquipment(), lineOf(), placement, slotsOf() (+23 more)

### Community 5 - "Actions Engine"
Cohesion: 0.14
Nodes (49): actionHours(), actionOpen(), actionStatus, applyPerHour(), assignError(), checkOnce(), completeAction(), hasHire() (+41 more)

### Community 6 - "Costs & Batches"
Cohesion: 0.13
Nodes (38): CmdError, tryStartBatch(), CostItem, costLines(), costName(), firstShort(), have(), payCost() (+30 more)

### Community 7 - "UI App Controller"
Cohesion: 0.12
Nodes (40): createApp(), handle(), perform(), persistedKeep(), persistGame(), persistUi(), restart(), send() (+32 more)

### Community 8 - "Validator Checks"
Cohesion: 0.16
Nodes (41): cannotBecomeFalse(), checkActionWarnings(), checkCycles(), checkDataUse(), checkDuplicates(), checkEndGameTags(), checkEventWarnings(), checkGoalExists() (+33 more)

### Community 9 - "Frontend Design Guidance"
Cohesion: 0.07
Nodes (32): AI-generated design tells (5 default clusters), Frontend Design guidance, Action participant picker (.picker), Command error message (msg under header), Day summary window (Итог дня, with details), Dropdown listbox pattern (.dd), Empty view (all panels gone, main buttons remain), Ending screens (goal / fail / no mark) (+24 more)

### Community 10 - "Conditions & Modifiers"
Cohesion: 0.13
Nodes (38): roleOf(), hasItem(), leaf(), cmp(), fmtNum(), ActiveMod, activeMods(), allRefs() (+30 more)

### Community 11 - "UI Stub & App Tests"
Cohesion: 0.09
Nodes (24): stub.ts — заглушка вида, StubGame fake Game + stubApi(), App, Command, Game, Line, LineKind, Result (+16 more)

### Community 12 - "Effects Engine"
Cohesion: 0.17
Nodes (33): resolveData(), resolveDeep(), applyEffect(), KINDS, num(), resolveTargets(), installEquipment(), textVars() (+25 more)

### Community 13 - "GitHub Pages Workflow"
Cohesion: 0.06
Nodes (35): defaults, runs-on, steps, concurrency, cancel-in-progress, group, run, environment (+27 more)

### Community 14 - "Broken Fixtures Generator"
Cohesion: 0.08
Nodes (19): basePack(), BROKEN, Json, main(), writePack(), args, dir, json (+11 more)

### Community 15 - "Simulator CLI"
Cohesion: 0.14
Nodes (19): main(), parse(), readHints(), strList(), load(), SimOptions, simulate(), traceRun() (+11 more)

### Community 16 - "Contract Issues (View)"
Cohesion: 0.13
Nodes (28): Эскалация через CONTRACT_ISSUES (§5), Чего движок не умеет, CI-003 Окраска строки notify (kind), CI-005 Формат transfer у replace_workshop, CI-006 Установка оборудования (обезличенные слоты, линейка/уровень), CI-008 View.hire_pool для кандидатов найма, CI-009 Название слота (names.slots, slot_name), CI-010 Формат pct и VarView.display (+20 more)

### Community 17 - "Validator Pack Index"
Cohesion: 0.12
Nodes (20): byId(), CondSite, DEFAULT_VARS, EffectSite, ObligationRef, PackIndex, Scope, ScopeKind (+12 more)

### Community 19 - "Project Rules & Graph"
Cohesion: 0.09
Nodes (20): claude.md — заглушка (корень blacksmith), Копии контракта core §4/§5 и docs:sync/docs:check, Порядок: Ядро → Валидатор+Интерфейс → Контент → интеграция, Команды проекта (§7), Структура проекта blacksmith/gvozdi-v2, Роль Ядро, Роль Интерфейс, Роль Оркестратор (+12 more)

### Community 20 - "UI Overlays & Site Build Docs"
Cohesion: 0.12
Nodes (25): createApp, app.ts controller doc, Second-press confirmation (restart, decline), build.ts doc, page() single HTML, Site build (--site, buildSite), siteUrl relative links, data-backdrop close-on-tap (+17 more)

### Community 21 - "Simulator Strategies"
Cohesion: 0.11
Nodes (11): Hints, Rng, BotFlags, Ctx, DEFAULTS, Idle, makeStrategy(), moneyCost() (+3 more)

### Community 22 - "Event Processing"
Cohesion: 0.18
Nodes (22): OnceRun, evalAll(), checkCondEvents(), checkIncap(), checkLadders(), checkVisibility(), drain(), eventCtx() (+14 more)

### Community 23 - "UI Contract Types"
Cohesion: 0.09
Nodes (22): ActionView, AssignableView, Assignment, CandidateView, CategoryView, CharacterView, CostLine, EffectView (+14 more)

### Community 24 - "Validator Entry & Walker"
Cohesion: 0.17
Nodes (15): jsonErrorText(), loadPack(), Walker, Pack, PACK_FILES, Problem, Ref, RefKind (+7 more)

### Community 25 - "Core Spec & Event Issues"
Cohesion: 0.16
Nodes (20): Документы и их статус (§6), CI-007 run_event безусловен, CI-016 W005 на событиях по редкому сигналу, CI-017 Когда stress.warning истинно, CI-019 Эффекты действия при браке партии, CI-024 Накопленные доходы/расходы в итоге дня (открыт), Приёмка движка, Действия и производство (разовое, назначение, брак) (+12 more)

### Community 26 - "Actions Docs"
Cohesion: 0.13
Nodes (16): Action definition fields (mode, roles, per_hour, outputs), ActionView.description, Batch defect (defect chance), Cost lines (costs.ts, CostLine), Actions, Costs and Calc (actions.ts, costs.ts, calc.ts), speed_scaled duration, debugView(), View and DebugView (view.ts) (+8 more)

### Community 27 - "Market Engine"
Cohesion: 0.29
Nodes (15): norm(), addGoods(), buyItem(), buyRaw(), buyUnitPrice(), ceilM(), floorM(), itemPrice() (+7 more)

### Community 28 - "Validator Docs & Codes"
Cohesion: 0.18
Nodes (16): readPack, Broken pack fixtures (fixtures/broken), Pack object shape (CI-001), Cycle check (V008, SCC), Data contexts check (V006, W004), Validator README, Error codes V001-V014, loadPack (+8 more)

### Community 29 - "Site Build Script"
Cohesion: 0.23
Nodes (13): build(), buildSite(), bundle(), escHtml(), here, jsonForScript(), packInfo(), page() (+5 more)

### Community 30 - "Content Guide"
Cohesion: 0.21
Nodes (17): Роль Контент, Как устроена игра изнутри (за 5 минут), content.md — руководство контентмейкера, Порядок работы и чек-лист пака, CI-002 Служебные тексты texts.json (12 ключей), CI-013 Обязательные поля (V001), CI-014 Срок модификатора по умолчанию (forever), CI-023 Категория и описание дела (+9 more)

### Community 31 - "Owner Decisions Log"
Cohesion: 0.13
Nodes (15): decisions-log.md — история решений, Правки core.md 2.1 по итогам первого запуска (2026-10-27), Найм, персонажи, мастерские, предметы, Character kind (hero, worker, family, pet...), Equipment line and grade, CharacterView.equippable / slot_name / role_name, Hire rule (from pool, under Σ max_workers), Hire pool and CandidateView (view.hire_pool) (+7 more)

### Community 32 - "Simulator Strategies Doc"
Cohesion: 0.16
Nodes (13): DEFAULTS (strategies.ts), Simulator README, Spread (Jaccard of neighbouring runs), Run outcomes (goal, fail, end, cap), Simulator strategies (idle, routine, solo, delegator, random, optimizer), strategy_hints.json, Trace mode (--trace seed), CI-027 semi-finished goods (+5 more)

### Community 33 - "UI Model Flows"
Cohesion: 0.13
Nodes (17): Equipment replace window flow, model.ts doc, goodsForNewObligations, marketPlan / marketCommand, needsPicker / directCommand / pickingCommand, overlayOf, panels(), replaceCommand (+9 more)

### Community 34 - "Action Categories Feature"
Cohesion: 0.17
Nodes (16): ActionView.category, categories.json, Action Categories (engine), View.categories, CategoryView, CONTRACT_ISSUES.md, contract.ts doc, groupActions / pickedIn (+8 more)

### Community 35 - "Engine Documentation"
Cohesion: 0.17
Nodes (14): Движок — документация (README), createGame(pack, seed), Engine (engine.ts): pack index, State, cache, command transient data, Entity references world / char:<id> / ws:<id> / item:<id>, Game.debugView() → DebugView, Game.save() → JSON string, Game.view() → View, loadGame(pack, save) (+6 more)

### Community 36 - "Package Manifest"
Cohesion: 0.16
Nodes (15): devDependencies, esbuild@^0.28.2, tsx@^4.23.15, @types/node@^26.6.5, typescript@^5.9.3, engines, node, name (+7 more)

### Community 37 - "Simulator Coverage"
Cohesion: 0.19
Nodes (13): EntityInfo, finish(), isCond(), Obj, OPENED_KIND, openedKey(), sample(), universe() (+5 more)

### Community 38 - "Effects Docs"
Cohesion: 0.22
Nodes (15): Эффекты (effects.ts), Effect targets (hero, self, actor, all_workers, char:<id>...), Effect types (var, goods, add/remove_modifier, give_item, hire, add_character, add_workshop, replace_workshop, notify, show_offer, run_event, end_game), end_game effect (title, text, tag goal/fail), give_item effect (tool to inventory/slot, equipment to workshop), notify effect (kind, popup), run_event effect (no trigger check, CI-007), show_offer effect (+7 more)

### Community 39 - "NPM Scripts"
Cohesion: 0.13
Nodes (15): scripts, build, build:fixture, build:site, docs:check, docs:sync, make-broken, sim (+7 more)

### Community 40 - "Simulator Bot"
Cohesion: 0.34
Nodes (5): ActionView, CharacterView, View, Bot, heroOf()

### Community 41 - "Root TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, esModuleInterop, lib, module, moduleResolution, noEmit, resolveJsonModule (+5 more)

### Community 42 - "View Formatting & Reports"
Cohesion: 0.18
Nodes (11): VarView.display formatting (number, pct, money), bundle() esbuild IIFE, Core report, Engine engine/src (createGame, loadGame, Game), equipment.ts (line/grade, four install cases), fixtures/mini-pack (mini_bakery), norm() float-noise rounding, Contract 2.1 (+3 more)

### Community 43 - "Event Data Contexts"
Cohesion: 0.23
Nodes (4): DataContexts, keysOf(), SIGNAL_DATA, Src

### Community 44 - "Time & Settle Order"
Cohesion: 0.17
Nodes (11): Время: тик = час, день day_start..day_end, settle order: queue → while-modifiers → ladders → incapacitation → visibility → conditional events (≤64 rounds), Модификаторы (modifiers.ts), EffectView.numbers strings (+10%, ▲ −50%), remove_modifier (by template/tag, stored only), Modifier stacking / extension (addModifier), Modifier template fields (var, applies_to, direction, op, value_from, action_tags, duration, stack...), Negative modifier definition (+3 more)

### Community 45 - "Events & Signals Docs"
Cohesion: 0.18
Nodes (12): Остановки work_until_stop, События и сигналы (events.ts), Conditional events (false → true transition), Event chain depth limit (max_event_chain = 32), Event pools (chance roll + weighted pick), repeat.max / repeat.cooldown_days, Event participant (from signal / random pick), Event triggered by signal (trigger.signal + conditions) (+4 more)

### Community 46 - "Role Surfaces & Tasks"
Cohesion: 0.27
Nodes (9): Публичные поверхности между ролями, CI-001 Форма объекта Pack в памяти, CI-025 TASKS.md хранит только открытые задачи, Отладочный вид debugView, API: createGame / loadGame / Game, Документация модулей docs/engine, Порядок чтения и подключения движка (§2.1), TASKS.md — открытые задачи владельца (+1 more)

### Community 47 - "Incapacitation"
Cohesion: 0.22
Nodes (10): Недееспособность, floor_pct threshold, Commands allowed for incapacitated hero, Incapacitation (floor_pct or incapacitates modifier), Permanent incapacitation (all reasons forever modifiers), Переменные и лестницы, action_tags-scoped modifiers, addExact: costs and prices bypass change modifiers (+2 more)

### Community 48 - "Simulator Report"
Cohesion: 0.31
Nodes (10): buildSummary(), csv(), csvCell(), median(), num(), pct(), spread(), StrategyRuns (+2 more)

### Community 49 - "UI Purity Test"
Cohesion: 0.22
Nodes (7): literals(), packDirs, RESERVED, root, TEXT_KEYS, VOCAB, vocabulary()

### Community 50 - "Hidden Content Question"
Cohesion: 0.28
Nodes (8): Вопросы из графа проекта (graphify), Вопрос: метрика закрытого контента vs достижимость V010, Бриф пака «Гвозди для графа» (nails_for_count), CI-004 visible:false и недостижимость V010, Видимость (visible, open_when, became_visible), Метрика закрытого контента, Достижимость V010 (оптимистичная неподвижная точка), Оформление (бумага, дерево, сургуч, CSS-переменные)

### Community 51 - "Content Recipes & W003"
Cohesion: 0.28
Nodes (9): Как сделать типовые вещи (навык, найм, кража, срыв …), CI-015 Видимый предвестник W003 и пустое поручение W007, Расчётные величины (wealth, cost_hours …), Условия (дерево проверок), Сломанные паки fixtures/broken, Вывод проблем (severity, code, file, id, path, message), validator.md — ТЗ валидатора пака, Видимый предвестник поражения (W003) (+1 more)

### Community 52 - "Simulator Contract Issues"
Cohesion: 0.28
Nodes (9): CI-027 Подсказки симулятору и цепочки производства, CI-028 Шаблон предложения в OfferView (открыт), CI-029 Скорость движка: 1000 прогонов не в минуту (открыт), Завершение игры (end_game, goal/fail), Проверка симулятора (1000 прогонов в минуту), Исходы прогона (goal / fail / cap), simulator.md — ТЗ симулятора, Стратегии (idle, routine, solo, delegator, random, optimizer) (+1 more)

### Community 53 - "UI Render & Mobile Layout"
Cohesion: 0.28
Nodes (7): render.ts doc, dropdown() custom list, Three-column layout (>= 900 px), styles.css doc, Phone layout media queries (T-012), Rustic house theme (CSS variables in :root), T-012 phone layout

### Community 54 - "Simulator Pack Hints"
Cohesion: 0.39
Nodes (8): collectItems(), collectVarConds(), DEFAULT_COVERAGE, findEndings(), isObj(), Obj, packFacts, VarCond

### Community 55 - "Commands & Expiry"
Cohesion: 0.32
Nodes (7): Modifier expiry in the morning (on_expire, modifier_expired), Game.perform(command) → Result, Время и команды, Command error codes (invalid, not_available, requirement_unmet, insufficient, no_time, incapacitated, offer_pending, game_over), Commands (work_until_stop, sleep, do_action, set_assignment, market_trip, choose_option, deliver, decline, equip, assign_workshop), Day summary with money sources (sale:, wage:, upkeep:, event:...), Sleep and morning sequence (9 steps)

### Community 56 - "Conditions Docs"
Cohesion: 0.38
Nodes (7): Calculated values (wealth, stock_value, cost_hours, income_yesterday), Условия (conditions.ts), Condition leaf types (var, var_cmp, has_modifier, has_item, stock, calc, role, obligation, some, data...), Condition subjects and contexts (hero, self, actor, workshop, char:<id>...), Condition tree (all/any/not/leaf, text), {"$data": name} value reference, failText: first false node with text → reason

### Community 57 - "Market & Trade Docs"
Cohesion: 0.70
Nodes (5): Склад, рынок и торговля, Hero market trip (market_trip), Sell/buy price formula (floor sales, ceil purchases), Stock with sell flags (set_sell_flag), Trader assignment {kind: "trade"} with commission

### Community 58 - "Simulator TS Config"
Cohesion: 0.50
Nodes (3): extends, include, ../tsconfig.json

### Community 59 - "Validator TS Config"
Cohesion: 0.50
Nodes (3): extends, include, ../tsconfig.json

## Knowledge Gaps
- **61 isolated node(s):** `../tsconfig.json`, `../tsconfig.json`, `Структура проекта blacksmith/gvozdi-v2`, `Эскалация через CONTRACT_ISSUES (§5)`, `Документы и их статус (§6)` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 318 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Движок — документация (README)` connect `Engine Documentation` to `Effects Docs`, `Time & Settle Order`, `Events & Signals Docs`, `Incapacitation`, `Commands & Expiry`, `Conditions Docs`, `Market & Trade Docs`, `Actions Docs`, `Owner Decisions Log`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **What connects `../tsconfig.json`, `../tsconfig.json`, `Структура проекта blacksmith/gvozdi-v2` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Engine Entry & Pack Index` be split into smaller, more focused modules?**
  _Cohesion score 0.05051480051480051 - nodes in this community are weakly interconnected._
- **Why does `createGame(pack, seed)` connect `Engine Documentation` to `Engine Entry & Pack Index`, `Role Surfaces & Tasks`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Should `Validator Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04789915966386555 - nodes in this community are weakly interconnected._
- **Why does `Visibility rule: closed is not visible at all` connect `Actions Docs` to `Hidden Content Question`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `UI Model Helpers` be split into smaller, more focused modules?**
  _Cohesion score 0.10187553282182438 - nodes in this community are weakly interconnected._