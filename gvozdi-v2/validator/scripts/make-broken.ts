// Генератор сломанных паков: fixtures/broken/_base (корректный минимальный пак, 0 проблем)
// и по папке на каждый код: fixtures/broken/<код>_<кратко>/ — ровно одна поломка.
// Запуск: npx tsx validator/scripts/make-broken.ts
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Json = any;

export function basePack(): Record<string, Json> {
  return {
    pack: {
      id: "base", name: "Базовый пак", version: "0.1.0",
      names: {
        money: "Монеты", money_short: "мон.", stress: "Усталость", slots: { hand: "В руке" },
        roles: { hero: "Мастер", worker: "Подручный", family: "Семья", pet: "Питомец" },
      },
      settings: {
        day_start: 6, day_end: 18, market_hours: 2, trade_hours: 2,
        trader_raw_target: { ore: 5 }, trade_open_when: null, shop: ["good_hammer"],
        pools: { daily: { chance: 0.5 } }, max_event_chain: 32,
      },
      start: { event: "start_default", hero: "hero" },
    },
    variables: [
      { id: "speed", name: "Скорость", owner: "character", start: 1, min: 0 },
      { id: "defect", name: "Брак", owner: "character", start: 0, min: 0, max: 1, good: "down" },
      { id: "learn_speed", name: "Обучаемость", owner: "character", start: 1, min: 0 },
      { id: "sell_price", name: "Цена продажи", owner: "character", start: 1, min: 0 },
      { id: "buy_price", name: "Цена покупки", owner: "character", start: 1, min: 0, good: "down" },
      { id: "commission", name: "Доля торговца", owner: "character", start: 0.1, min: 0, max: 1, good: "down" },
      { id: "wage", name: "Жалованье", owner: "character", start: 0, min: 0, format: "money", good: "down" },
      { id: "hire_cost", name: "Цена найма", owner: "character", start: 0, min: 0, format: "money" },
      { id: "household_expense", name: "Расход дома", owner: "world", start: 1, min: 0, format: "money", good: "down" },
      { id: "world_sell_price", name: "Спрос", owner: "world", start: 1, min: 0 },
      { id: "world_buy_price", name: "Цены рынка", owner: "world", start: 1, min: 0, good: "down" },
      { id: "max_workers", name: "Мест", owner: "workshop", start: 0, min: 0 },
      { id: "equipment_slots", name: "Слотов", owner: "workshop", start: 0, min: 0 },
      { id: "upkeep", name: "Содержание", owner: "workshop", start: 0, min: 0, format: "money", good: "down" },
      {
        id: "craft_xp", name: "Ремесло", owner: "character", start: 0, min: 0,
        ladder: [
          { at: 0, id: "novice", name: "Новичок", modifiers: [] },
          { at: 10, id: "adept", name: "Умелец", modifiers: ["skilled"] },
        ],
      },
      {
        id: "polish_xp", name: "Полировка", owner: "character", start: 0, min: 0,
        visible: { type: "var", subject: "self", var: "craft_xp", field: "level", op: ">=", value: 1 },
      },
    ],
    modifiers: [
      { id: "skilled", name: "Умелец", text: "Руки помнят", var: "speed", op: "pct", value: 10, duration: { kind: "source" } },
      { id: "hammer_bonus", name: "Хороший молот", text: "Бьёт ровно", var: "speed", op: "pct", value: 10, duration: { kind: "source" } },
      { id: "has_anvil", name: "Есть наковальня", flag: true, duration: { kind: "source" }, visible: false },
      {
        id: "rested", name: "Отдохнул", text: "Усталость копится медленнее", var: "stress", applies_to: "change",
        direction: "gain", op: "pct", value: -20, duration: { kind: "days", n: 1 },
      },
    ],
    goods: [
      { id: "ore", name: "Руда", unit: "ед.", price: 1, buy: true, sell_default: false },
      { id: "widget", name: "Изделие", unit: "шт.", price: 3, buy: false, sell_default: true },
    ],
    items: [
      { id: "good_hammer", name: "Молот", kind: "tool", slot: "hand", price: 10, modifiers: ["hammer_bonus"] },
      { id: "anvil", name: "Наковальня", kind: "equipment", line: "anvil", grade: 1, price: 20, modifiers: ["has_anvil"] },
    ],
    workshops: [
      { id: "shed", name: "Сарай", vars: { max_workers: 1, equipment_slots: 1, upkeep: 0 }, modifiers: [] },
      { id: "hall", name: "Мастерская", vars: { max_workers: 2, equipment_slots: 2, upkeep: 1 }, modifiers: [] },
    ],
    characters: [
      { id: "hero", name: "Мастер", role: "hero", works: true, slots: ["hand"] },
      { id: "helper", name: "Подручный", role: "worker", works: true, hire_pool: true, vars: { hire_cost: 5 }, slots: ["hand"] },
    ],
    actions: [
      {
        id: "make_widget", name: "Делать изделие", mode: "both", hours: 1, speed_scaled: true,
        roles: { actor: { who: "hero_or_worker" } },
        cost: [{ good: "ore", qty: 1 }], outputs: [{ good: "widget", qty: 1 }],
        per_hour: [
          { target: "actor", var: "craft_xp", add: 1, scale_by: "learn_speed" },
          { target: "actor", var: "stress", add: 2 },
        ],
        tags: ["craft"],
      },
      {
        id: "polish", name: "Полировать", mode: "once", hours: 1, roles: { actor: { who: "hero" } },
        open_when: { type: "has_modifier", subject: "workshop", template: "has_anvil" },
        cost: [{ good: "widget", qty: 1 }], outputs: [{ good: "widget", qty: 1 }],
        per_hour: [{ target: "actor", var: "polish_xp", add: 1 }],
      },
      {
        id: "rest", name: "Отдыхать", mode: "once", hours: 2, roles: { actor: { who: "hero" } },
        per_hour: [{ target: "actor", var: "stress", add: -5 }],
        effects: [{ type: "add_modifier", template: "rested", target: "actor" }],
      },
      {
        id: "hire", name: "Нанять", mode: "once", hours: 1,
        roles: { actor: { who: "hero" }, candidate: { who: "pool" } },
        cost: [{ var: "money", from: "candidate", qty_from: "hire_cost" }],
        effects: [{ type: "hire", target: "candidate" }],
      },
      {
        id: "buy_anvil", name: "Купить наковальню", mode: "once", hours: 1, roles: { actor: { who: "hero" } },
        enabled_when: { not: { type: "has_item", subject: "workshop", item: "anvil" }, text: "Уже есть" },
        cost: [{ var: "money", qty: 20 }],
        effects: [{ type: "give_item", item: "anvil", target: "workshop" }],
      },
      {
        id: "upgrade", name: "Перестроить", mode: "once", hours: 4, roles: { actor: { who: "hero" } },
        open_when: { type: "workshop_type", subject: "workshop", workshop: "shed" },
        cost: [{ var: "money", qty: 50 }],
        effects: [{ type: "replace_workshop", target: "workshop", workshop: "hall" }],
      },
    ],
    events: [
      {
        id: "start_default", trigger: { signal: "game_start" },
        effects: [
          { type: "var", target: "world", var: "money", add: 30 },
          { type: "goods", good: "ore", qty: 5 },
          { type: "add_workshop", workshop: "shed" },
          { type: "give_item", item: "good_hammer", target: "hero" },
        ],
      },
      {
        id: "order_board", trigger: { signal: "morning", pool: "daily", conditions: [] }, weight: 1,
        repeat: { max: null, cooldown_days: 2 },
        effects: [{ type: "show_offer", offer: "order" }],
      },
      {
        id: "win", trigger: { conditions: [{ type: "var", subject: "hero", var: "craft_xp", field: "level", op: ">=", value: 1 }] },
        repeat: { max: 1 },
        effects: [{ type: "show_offer", offer: "victory" }],
      },
      {
        id: "burnout", trigger: { conditions: [{ type: "var", subject: "hero", var: "stress", op: ">=", value: 100 }] },
        repeat: { max: 1 },
        effects: [{ type: "end_game", title: "Надорвался", text: "Работа без отдыха свалила мастера.", tag: "fail" }],
      },
    ],
    offers: [
      {
        id: "order", delivery: "board", board_days: 1, title: "Заказ", text: "Нужно {qty} изделий.",
        data: { qty: 3, reward: 10 },
        options: [
          {
            id: "take", label: "Взять",
            obligation: {
              id: "order_ob", title: "Заказ на {qty}",
              requires: [{ good: "widget", qty: { $data: "qty" } }], deadline_days: 2,
              on_done: [{ type: "var", target: "world", var: "money", add: { $data: "reward" } }],
              on_fail: [], on_decline: [],
            },
          },
          { id: "skip", label: "Не брать" },
        ],
      },
      {
        id: "victory", delivery: "now", title: "Признание", text: "Вас зовут в город.",
        options: [
          { id: "stay", label: "Остаться" },
          { id: "go", label: "Уехать", effects: [{ type: "end_game", title: "В городе", text: "Новая жизнь.", tag: "goal" }] },
        ],
      },
    ],
    texts: {
      reason_no_time: "До заката не успеть", reason_cost: "Не хватает: {name} ({have}/{need})",
      reason_incapacitated: "{name} не может работать", reason_night: "Ночь",
      log_batch_done: "{worker}: {item} ×{qty}", log_batch_defect: "{worker} испортил {item}",
      log_sold: "{who} продал {item} ×{qty} за {money}", log_bought: "{who} купил {item} ×{qty} за {money}",
      log_hired: "Нанят {name}", log_expenses: "Расходы: {total}", log_delivered: "Сдано: {obligation}",
      log_declined: "Отказ: {obligation}", log_failed: "Провал: {obligation}", stop_sunset: "Закат",
      stop_offer: "Нужно решить", summary_title: "Итог дня", source_sale: "Продажа ({name})",
      source_purchase: "Покупка ({name})", source_wage: "Жалованье ({name})", source_upkeep: "Содержание ({name})",
      source_household: "Дом", source_event: "Событие", source_offer: "Предложение", source_obligation: "Заказ",
      source_action: "Действие",
      assign_idle: "Без дела", assign_trade: "Торговать", reason_invalid: "Неверная команда",
      reason_not_available: "Недоступно", reason_offer_pending: "Сначала ответьте", reason_game_over: "Игра окончена",
      reason_workers_full: "Нет места для {name}", reason_trade_not_allowed: "{name} не торгует",
      reason_busy_slot: "Слот занят", stop_game_over: "Конец игры", popup_title: "Новость", popup_ok: "Понятно",
      replace_warning: "{item} заменит: {old}",
    },
  };
}

const find = (list: Json[], id: string) => list.find((x) => x.id === id);

/** Поломки: «<код>_<кратко>» (имя папки) → мутация базы. Мутация может вернуть строки «сырого» содержимого файлов. */
export const BROKEN: Record<string, (p: Json) => Record<string, string> | void> = {
  V001_json_syntax: () => ({ "goods.json": '[ { "id": "ore", "name": "Руда", "price": 1, "buy": true }, ]' }),
  V001_equipment_no_line: (p) => void delete find(p.items, "anvil").line,
  V001_equipment_no_grade: (p) => void delete find(p.items, "anvil").grade,
  V001_action_description_type: (p) => void (find(p.actions, "rest").description = 42),
  V001_pack_empty_version: (p) => void (p.pack.version = ""),
  V001_pack_description_type: (p) => void (p.pack.description = 42),
  V002_duplicate_id: (p) => void p.goods.push({ id: "widget", name: "Изделие-2", price: 4 }),
  V003_unknown_ref: (p) => void (find(p.actions, "rest").per_hour[0].var = "stres"),
  V003_slot_no_name: (p) => void delete p.pack.names.slots.hand,
  V003_equipment_in_shop: (p) => void p.pack.settings.shop.push("anvil"),
  V004_reserved_missing: (p) => void (p.variables = p.variables.filter((v: Json) => v.id !== "commission")),
  V005_modifier_no_op: (p) => void delete find(p.modifiers, "skilled").op,
  V006_text_missing_key: (p) => void delete p.texts.reason_night,
  V006_no_replace_warning: (p) => void delete p.texts.replace_warning,
  V007_ladder_first_at: (p) => void (find(p.variables, "craft_xp").ladder[0].at = 1),
  V008_event_cycle: (p) => {
    p.events.push(
      { id: "ping", trigger: { signal: "night" }, effects: [{ type: "run_event", event: "pong" }] },
      { id: "pong", effects: [{ type: "run_event", event: "ping" }] },
    );
  },
  V009_permanent_negative: (p) => {
    p.modifiers.push({ id: "scar", name: "Шрам", text: "Ноет", var: "speed", op: "pct", value: -10, duration: { kind: "forever" } });
    find(p.actions, "rest").effects.push({ type: "add_modifier", template: "scar", target: "actor" });
  },
  V010_unreachable_good: (p) => void p.goods.push({ id: "gold", name: "Золото", price: 50, buy: false }),
  V011_board_days_zero: (p) => void (find(p.offers, "order").board_days = 0),
  V012_end_game_no_tag: (p) => void delete find(p.events, "burnout").effects[0].tag,
  V013_hours_zero: (p) => void (find(p.actions, "make_widget").hours = 0),
  V014_start_not_game_start: (p) => void (find(p.events, "start_default").trigger = { signal: "morning" }),
  W001_floor_pct: (p) => {
    p.variables.push({ id: "health", name: "Здоровье", owner: "character", start: 100, min: 0, max: 100, floor_pct: 50 });
    p.modifiers.push({ id: "sick", name: "Хворь", text: "Ломит", var: "health", op: "pct", value: -60, duration: { kind: "days", n: 2 } });
    find(p.actions, "rest").effects.push({ type: "add_modifier", template: "sick", target: "actor" });
  },
  W002_unused_modifier: (p) => void p.modifiers.push({ id: "forgotten", name: "Забытый", flag: true, duration: { kind: "forever" } }),
  V001_category_view: (p) => void (p.categories = [{ id: "craft", name: "Работа", view: "grid" }], find(p.actions, "make_widget").category = "craft"),
  V001_category_no_name: (p) => void (p.categories = [{ id: "craft" }], find(p.actions, "make_widget").category = "craft"),
  V002_duplicate_category: (p) => {
    p.categories = [{ id: "craft", name: "Работа" }, { id: "craft", name: "Ещё работа", view: "select" }];
    find(p.actions, "make_widget").category = "craft";
  },
  V003_unknown_category: (p) => {
    p.categories = [{ id: "craft", name: "Работа", view: "select" }];
    find(p.actions, "rest").category = "craft";
    find(p.actions, "make_widget").category = "craf";
  },
  V003_category_no_file: (p) => void (find(p.actions, "make_widget").category = "craft"),
  W002_empty_category: (p) => void (p.categories = [{ id: "craft", name: "Работа" }]),
  W003_no_foreshadow: (p) => {
    p.variables.push({ id: "fatigue", name: "Изнурение", owner: "character", start: 0, min: 0, visible: false });
    find(p.actions, "make_widget").per_hour.push({ target: "actor", var: "fatigue", add: 1 });
    find(p.events, "burnout").trigger.conditions[0] = { type: "var", subject: "hero", var: "fatigue", op: ">=", value: 50 };
  },
  W004_data_partial: (p) => {
    p.events.push({ id: "tip", effects: [{ type: "var", target: "world", var: "money", add: { $data: "amount" } }] });
    find(p.events, "start_default").effects.push({ type: "run_event", event: "tip", data: { amount: 5 } });
    find(p.events, "order_board").effects.push({ type: "run_event", event: "tip" });
  },
  W005_stops_time_no_repeat: (p) => void p.events.push({
    id: "alarm", trigger: { signal: "action_done" }, stops_time: true, effects: [{ type: "notify", text: "Готово!" }],
  }),
  W006_condition_no_repeat: (p) => void p.events.push({
    id: "rich", trigger: { conditions: [{ type: "calc", name: "wealth", op: ">", value: 100 }] },
    effects: [{ type: "notify", text: "Соседи завидуют." }],
  }),
  W007_idle_assignment: (p) => void p.actions.push({
    id: "loiter", name: "Слоняться", mode: "assignable", hours: 1, roles: { actor: { who: "worker" } },
  }),
  W008_cost_hours_threshold: (p) => void p.events.push({
    id: "low_ore", trigger: { conditions: [{ type: "calc", name: "cost_hours", op: "<", value: 1 }] },
    repeat: { cooldown_days: 1 }, effects: [{ type: "notify", text: "Руда кончается." }],
  }),
  W009_no_goal: (p) => void (find(p.offers, "victory").options[1].effects[0].tag = "fail"),
  W010_unknown_field: (p) => void (find(p.goods, "widget").colour = "red"),
};

export function writePack(dir: string, pack: Record<string, Json>, raw: Record<string, string> = {}): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(pack)) writeFileSync(join(dir, `${k}.json`), JSON.stringify(v, null, 2) + "\n");
  for (const [f, text] of Object.entries(raw)) writeFileSync(join(dir, f), text + "\n");
}

function main(): void {
  const root = join(import.meta.dirname, "..", "..", "fixtures", "broken");
  if (existsSync(root))
    for (const d of readdirSync(root)) if (/^(_base|[VW]\d{3}_)/.test(d)) rmSync(join(root, d), { recursive: true, force: true });
  writePack(join(root, "_base"), basePack());
  for (const [name, mutate] of Object.entries(BROKEN)) {
    const p = basePack();
    const raw = mutate(p) ?? {};
    writePack(join(root, name), p, raw);
  }
  console.log(`Готово: _base и ${Object.keys(BROKEN).length} сломанных паков в ${root}`);
}

if (process.argv[1] && /make-broken\.ts$/.test(process.argv[1])) main();
