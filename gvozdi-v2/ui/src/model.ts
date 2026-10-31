// Чистая логика «что показывать»: видимость панелей, активность кнопок, окна поверх игры.
// Только чтение View и состояния интерфейса. Игровых расчётов нет.

import type { ActionView, CategoryView, CharacterView, Command, InventoryItemView, Line, LineKind, View } from "./contract.ts";

/** Состояние самого интерфейса (не игры). */
export interface UiState {
  /** Ключ кнопки, ждущей второго нажатия («restart», «decline:<id>»). */
  confirm: string | null;
  /** Открытый выбор участников действия. */
  picking: Picking | null;
  /** Окно замены оборудования: готовая команда do_action ждёт выбора, что заменить (core.md 3.7). */
  replacing: Replacing | null;
  /** День, за который игрок уже закрыл «Итог дня». */
  summaryClosedDay: number | null;
  showSummaryDetails: boolean;
  /** Выбранная вкладка мастерской (если их больше одной). */
  workshopTab: string | null;
  /** Ключ открытого выпадающего списка. */
  dd: string | null;
  /** Накопленные доходы и расходы по «Итогам дня», включая день `day` (чтобы не считать день дважды). */
  totals: { day: number | null; income: number; expense: number };
  /** Развёрнутые блоки (ключи свёртки «Параметры», «Личный инвентарь»). */
  open: string[];
  /** Раскрытые группы действий типа list (id категорий). */
  catOpen: string[];
  /** Выбранное действие в группах типа select: id категории → id действия. */
  catPick: Record<string, string>;
  /** Черновик закупки на рынке: raw — «купить», keep — «поддерживать количество» (null — поле очищено), items — лавка. */
  market: { raw: Record<string, number>; keep: Record<string, number | null>; items: string[] };
  /** Result.events последней успешной команды. */
  lastEvents: Line[];
  /** Result.stop.text последней команды work_until_stop. */
  lastStop: string | null;
  /** Короткое сообщение (ошибка команды, сохранение). */
  message: { text: string; kind: LineKind } | null;
  /** Открыто окно «Настройки» (view.md 3.14). */
  settings: boolean;
}

export interface Picking {
  action: string;
  actor: string | null;
  partner: string | null;
  candidate: string | null;
}

/** Ожидание выбора замены: действие и команда без поля replace. */
export interface Replacing {
  action: string;
  cmd: Extract<Command, { type: "do_action" }>;
}

export function initialUi(): UiState {
  return {
    confirm: null,
    picking: null,
    replacing: null,
    summaryClosedDay: null,
    showSummaryDetails: false,
    workshopTab: null,
    open: [],
    catOpen: [],
    catPick: {},
    totals: { day: null, income: 0, expense: 0 },
    dd: null,
    market: { raw: {}, keep: {}, items: [] },
    lastEvents: [],
    lastStop: null,
    message: null,
    settings: false,
  };
}

export type Overlay = "ending" | "offer" | "replace" | "summary" | "settings" | null;

/** Что открыто поверх игры: концовка, окно выбора, окно замены, итог дня, настройки — в этом порядке. */
export function overlayOf(view: View, ui: UiState): Overlay {
  if (view.ending) return "ending";
  if (view.pending_offer) return "offer";
  if (ui.replacing && replaceOf(view, ui.replacing.action)) return "replace";
  if (view.summary && ui.summaryClosedDay !== view.meta.day) return "summary";
  if (ui.settings) return "settings";
  return null;
}

/** Пока открыто окно — всё остальное неактивно. */
export function isBlocked(view: View, ui: UiState): boolean {
  return overlayOf(view, ui) !== null;
}

/** Разовые действия героя: mode once или both. */
export function onceActions(view: View): ActionView[] {
  return view.actions.filter((a) => a.mode === "once" || a.mode === "both");
}

export interface ActionGroup {
  category: CategoryView;
  actions: ActionView[];
  /** Сколько действий группы доступны (enabled из вида). */
  available: number;
}

/** Разбивка разовых действий: без категории (или с неизвестной) — вне групп; группы — в порядке categories, пустые не показываются. */
export function groupActions(view: View): { ungrouped: ActionView[]; groups: ActionGroup[] } {
  const once = onceActions(view);
  const known = new Set(view.categories.map((c) => c.id));
  const ungrouped = once.filter((a) => a.category === null || !known.has(a.category));
  const groups: ActionGroup[] = [];
  for (const category of view.categories) {
    const actions = once.filter((a) => a.category === category.id);
    if (actions.length > 0) groups.push({ category, actions, available: actions.filter((a) => a.enabled).length });
  }
  return { ungrouped, groups };
}

/** Выбранное действие группы select; null — не выбрано или его уже нет в виде. */
export function pickedIn(ui: UiState, g: ActionGroup): ActionView | null {
  const id = ui.catPick[g.category.id];
  return g.actions.find((a) => a.id === id) ?? null;
}

export interface Panels {
  stress: boolean;
  now: boolean;
  notifications: boolean;
  actions: boolean;
  /** «Работники»: персонажи с works: true, герой первым (view.md 3.6). */
  workers: boolean;
  /** «Семья»: персонажи с works: false (view.md 3.6). */
  family: boolean;
  hire: boolean;
  workshop: boolean;
  workshopTabs: boolean;
  storage: boolean;
  inventory: boolean;
  market: boolean;
  board: boolean;
  obligations: boolean;
  effects: boolean;
}

/** Панель видна, только если в виде есть что в ней показать. */
export function panels(view: View, ui: UiState): Panels {
  return {
    stress: view.stress !== null,
    now: ui.lastEvents.length > 0 || ui.lastStop !== null,
    notifications: view.notifications.length > 0,
    actions: onceActions(view).length > 0,
    workers: workersOf(view).length > 0,
    family: familyOf(view).length > 0,
    hire: view.hire_pool.length > 0,
    workshop: view.workshops.length > 0,
    workshopTabs: view.workshops.length > 1,
    storage: view.storage.goods.length > 0,
    inventory: view.inventory.length > 0,
    market: view.market.raw.length > 0 || view.market.shop.length > 0 || view.storage.goods.length > 0,
    board: view.board.length > 0,
    obligations: view.obligations.length > 0,
    effects: view.effects.length > 0,
  };
}

export interface MainButtons {
  work: boolean;
  sleep: boolean;
}

/** Ночью активен только сон (и команды без времени). Под окном всё неактивно. */
export function mainButtons(view: View, ui: UiState): MainButtons {
  const blocked = isBlocked(view, ui);
  return {
    work: !blocked && !view.meta.is_night,
    sleep: !blocked,
  };
}

/** Кнопка разового действия активна: не под окном, движок разрешил, есть исполнитель. */
export function actionEnabled(view: View, ui: UiState, a: ActionView): boolean {
  return !isBlocked(view, ui) && a.enabled && a.roles.actor.length > 0;
}

/** Главный герой — персонаж с ролью `hero` (слово контракта). */
export function isHero(c: CharacterView): boolean {
  return c.role === "hero";
}

/** Поручения выдаются в карточке: занят работой и не герой (герой действует через «Дела»). */
export function isWorker(c: CharacterView): boolean {
  return c.works && !isHero(c);
}

/** Блок «Работники»: все с works: true, в том числе герой; герой первым, остальные — в порядке вида. */
export function workersOf(view: View): CharacterView[] {
  const list = view.characters.filter((c) => c.works);
  return [...list.filter(isHero), ...list.filter((c) => !isHero(c))];
}

/** Блок «Семья»: все с works: false, в порядке вида. */
export function familyOf(view: View): CharacterView[] {
  return view.characters.filter((c) => !c.works);
}

/** Исполнитель дела: всегда герой, если движок его допускает; иначе первый допустимый. */
export function actorOf(view: View, a: ActionView): string | null {
  const hero = view.characters.find(isHero);
  if (hero && a.roles.actor.includes(hero.id)) return hero.id;
  return a.roles.actor[0] ?? null;
}

/** Нужен ли выбор участников перед отправкой: исполнитель не спрашивается, только партнёр и кандидат. */
export function needsPicker(a: ActionView): boolean {
  return a.roles.partner !== null || a.roles.candidate !== null;
}

/** Команда для действия без выбора участников. */
export function directCommand(view: View, a: ActionView): Extract<Command, { type: "do_action" }> | null {
  const actor = actorOf(view, a);
  if (needsPicker(a) || !actor) return null;
  return { type: "do_action", action: a.id, actor };
}

/** Начальный выбор: первый подходящий в каждой роли. */
export function startPicking(view: View, a: ActionView): Picking {
  return {
    action: a.id,
    actor: actorOf(view, a),
    partner: a.roles.partner?.[0] ?? null,
    candidate: a.roles.candidate?.[0] ?? null,
  };
}

/** Команда из выбора участников; null — выбор неполный. */
export function pickingCommand(a: ActionView, p: Picking): Extract<Command, { type: "do_action" }> | null {
  if (!p.actor || !a.roles.actor.includes(p.actor)) return null;
  const cmd: Extract<Command, { type: "do_action" }> = { type: "do_action", action: a.id, actor: p.actor };
  if (a.roles.partner !== null) {
    if (!p.partner || !a.roles.partner.includes(p.partner)) return null;
    cmd.partner = p.partner;
  }
  if (a.roles.candidate !== null) {
    if (!p.candidate || !a.roles.candidate.includes(p.candidate)) return null;
    cmd.candidate = p.candidate;
  }
  return cmd;
}

/** Замена оборудования у действия (null — спрашивать не нужно). */
export function replaceOf(view: View, actionId: string): ActionView["replace"] {
  return view.actions.find((a) => a.id === actionId)?.replace ?? null;
}

/** Команда с выбранной заменой; null — такого варианта у действия нет. */
export function replaceCommand(view: View, r: Replacing, item: string): Command | null {
  const rep = replaceOf(view, r.action);
  if (!rep || !rep.options.some((o) => o.item === item)) return null;
  return { ...r.cmd, replace: item };
}

/** Имя по id: персонаж в игре или кандидат пула найма; если нет в виде — сам id. */
export function nameOf(view: View, id: string): string {
  return view.characters.find((c) => c.id === id)?.name ?? view.hire_pool.find((c) => c.id === id)?.name ?? id;
}

/** Активная вкладка мастерской. */
export function activeWorkshop(view: View, ui: UiState): string | null {
  if (view.workshops.length === 0) return null;
  if (ui.workshopTab && view.workshops.some((w) => w.id === ui.workshopTab)) return ui.workshopTab;
  return view.workshops[0].id;
}

/** Выбор мастерской у персонажа — только при нескольких мастерских и только у работающих. */
export function canPickWorkshop(view: View, c: CharacterView): boolean {
  return view.workshops.length > 1 && c.works;
}

/** Список поручений — у работающих, если движок что-то предлагает. */
export function canAssign(c: CharacterView): boolean {
  return c.works && c.assignable.length > 0;
}

/** Что можно дать персонажу: только экземпляры из equippable, названия — из inventory. */
export function equipOptions(view: View, c: CharacterView): InventoryItemView[] {
  const ok = new Set(c.equippable);
  return view.inventory.filter((it) => ok.has(it.item));
}

export function canEquip(view: View, c: CharacterView): boolean {
  return equipOptions(view, c).length > 0;
}

/** Уведомления — новые сверху. */
export function notificationsNewestFirst(view: View): Line[] {
  return [...view.notifications].reverse();
}

/** Свёрнутый блок открыт? */
export function isOpen(ui: UiState, key: string): boolean {
  return ui.open.includes(key);
}

/** Оценка выручки со склада: только товары с галочкой «продать» (строка — вниз до целого, CI-018). Показ, не решение движка. */
export function saleValue(view: View): number {
  let sum = 0;
  for (const g of view.storage.goods) if (g.sell_flag) sum += Math.floor(g.qty * g.unit_value);
  return sum;
}

/** «Поддерживать количество» по умолчанию. */
export const KEEP_DEFAULT = 10;

/** Сколько поддерживать на складе: запомненное значение или умолчание (очищенное поле — умолчание). */
export function keepOf(ui: UiState, id: string): number {
  const k = ui.market.keep[id];
  return typeof k === "number" ? k : KEEP_DEFAULT;
}

/** Сколько сырья лежит на складе (сырьё и товар склада имеют один id). */
export function stockOf(view: View, id: string): number {
  return view.storage.goods.find((g) => g.id === id)?.qty ?? 0;
}

/** Желаемая закупка сырья до учёта денег: введённое «купить», а если пусто — разница до «поддерживать». */
export function wantedRaw(view: View, ui: UiState, id: string): number {
  const q = ui.market.raw[id];
  if (typeof q === "number" && Number.isFinite(q) && q > 0) return Math.floor(q);
  return Math.max(0, Math.floor(keepOf(ui, id) - stockOf(view, id)));
}

export interface MarketPlan {
  buy_raw: Record<string, number>;
  buy_items: string[];
  /** Лавка дороже, чем деньги плюс выручка: поход невозможен. 0 — хватает. */
  itemsShort: number;
  /** Сырья куплено меньше желаемого: не хватило денег. */
  trimmed: boolean;
}

/** План похода. Сначала продажа, потом покупка: денег = деньги + выручка отмеченных товаров.
 *  Лавка вычитается первой, сырьё берётся по списку, пока хватает денег. Строка сырья — вверх до целого (CI-018). */
/** Товары склада с флажком продажи, которые назвал расход выбранного варианта (по названию строки расхода): флажок надо снять. */
export function goodsToKeep(view: View, offerId: string, optionId: string): string[] {
  const offer = view.pending_offer?.id === offerId ? view.pending_offer : view.board.find((o) => o.id === offerId);
  const cost = offer?.options.find((o) => o.id === optionId)?.cost ?? [];
  const names = new Set(cost.map((c) => c.name));
  return view.storage.goods.filter((g) => g.sell_flag && names.has(g.name)).map((g) => g.id);
}

/** Товары склада с флажком продажи, которые требуются новым обязательствам (их не было в `before`): по названию строки `requires`. */
export function goodsForNewObligations(before: View, after: View): string[] {
  const known = new Set(before.obligations.map((o) => o.id));
  const names = new Set(after.obligations.filter((o) => !known.has(o.id)).flatMap((o) => o.requires.map((r) => r.name)));
  return after.storage.goods.filter((g) => g.sell_flag && names.has(g.name)).map((g) => g.id);
}

/**
 * Предмет лавки можно отметить: движок разрешил, либо он закрыт, а денег сейчас не хватает, но хватит с выручкой
 * от отмеченного к продаже (продажа идёт раньше покупки). Причину отказа в виде не отличить — оценка интерфейса (CI-022).
 */
export function shopAvailable(view: View, s: View["market"]["shop"][number]): boolean {
  if (s.enabled) return true;
  return view.money.value < s.price && s.price <= view.money.value + saleValue(view);
}

export function marketPlan(view: View, ui: UiState): MarketPlan {
  const allowed = new Set(view.market.shop.filter((s) => shopAvailable(view, s)).map((s) => s.item_type));
  const buy_items = ui.market.items.filter((t) => allowed.has(t));
  const itemsCost = buy_items.reduce((sum, t) => sum + (view.market.shop.find((s) => s.item_type === t)?.price ?? 0), 0);
  const have = view.money.value + saleValue(view);
  const itemsShort = Math.max(0, itemsCost - have);
  let left = itemsShort > 0 ? 0 : have - itemsCost;
  const buy_raw: Record<string, number> = {};
  let trimmed = false;
  for (const r of view.market.raw) {
    let q = wantedRaw(view, ui, r.id);
    if (q <= 0) continue;
    if (r.unit_price > 0 && Math.ceil(q * r.unit_price) > left) {
      q = Math.max(0, Math.floor(left / r.unit_price));
      trimmed = true;
    }
    if (q <= 0) continue;
    if (r.unit_price > 0) left -= Math.ceil(q * r.unit_price);
    buy_raw[r.id] = q;
  }
  return { buy_raw, buy_items, itemsShort, trimmed };
}

/** Команда закупки на рынке из плана. */
export function marketCommand(view: View, ui: UiState): Command {
  const p = marketPlan(view, ui);
  return { type: "market_trip", buy_raw: p.buy_raw, buy_items: p.buy_items };
}

/** Итоги дня: доходы и расходы за день и накопленные за все дни, что видел игрок (по строкам `summary`). */
export function summaryTotals(view: View, ui: UiState): { dayIncome: number; dayExpense: number; allIncome: number; allExpense: number } {
  const s = view.summary;
  const dayIncome = s ? s.income.reduce((a, r) => a + r.amount, 0) : 0;
  const dayExpense = s ? s.expense.reduce((a, r) => a + r.amount, 0) : 0;
  const counted = ui.totals.day === view.meta.day;
  return {
    dayIncome,
    dayExpense,
    allIncome: ui.totals.income + (counted || !s ? 0 : dayIncome),
    allExpense: ui.totals.expense + (counted || !s ? 0 : dayExpense),
  };
}

// ——— форматирование (только вид числа, без игровых расчётов) ———

/** Число без лишних знаков: до двух знаков после запятой. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

export function fmtMoney(view: View, n: number): string {
  return `${fmtNum(n)} ${view.money.short}`;
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmtNum(n)}` : fmtNum(n);
}

export function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
