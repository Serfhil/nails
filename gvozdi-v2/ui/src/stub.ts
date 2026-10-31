// Заглушка вида: фейковый Game по контракту core.md 5 для разработки и тестов интерфейса без движка.
// Все тексты здесь — выдуманные тестовые данные заглушки, не тексты пака и не код рендера.

import type { Command, Game, GameApi, Line, Result, View } from "./contract.ts";

/** Пустой вид: все панели должны исчезнуть. */
export function emptyView(): View {
  return {
    meta: { day: 1, hour: 8, day_start: 8, day_end: 20, is_night: false, game_title: "Заглушка",
      pack_id: "stubpack", pack_version: "0.0.1", pack_description: "Описание заглушки." },
    money: { name: "Деньги", short: "д.", value: 0 },
    stress: null,
    notifications: [],
    summary: null,
    pending_offer: null,
    actions: [],
    categories: [],
    characters: [],
    hire_pool: [],
    workshops: [],
    storage: { goods: [], total_value: 0 },
    inventory: [],
    market: { enabled: false, disabled_reason: null, hours: 2, raw: [], shop: [] },
    board: [],
    obligations: [],
    effects: [],
    ending: null,
  };
}

/** Насыщенный вид: все панели заполнены. */
export function fullView(): View {
  const vv = (id: string, name: string, value: number, display: string, format = "number", level: number | null = null, step: string | null = null) => ({
    id,
    name,
    value,
    display,
    format,
    level,
    step,
  });
  const act = (
    id: string,
    label: string,
    hours: number,
    mode: "once" | "assignable" | "both",
    roles: { actor: string[]; partner: string[] | null; candidate: string[] | null },
    extra: Partial<View["actions"][number]> = {},
  ): View["actions"][number] => ({ id, label, description: null, category: null, hours, mode, enabled: true, reason: null, cost: [], roles, replace: null, ...extra });
  return {
    meta: { day: 2, hour: 10, day_start: 8, day_end: 20, is_night: false, game_title: "Заглушка",
      pack_id: "stubpack", pack_version: "0.0.1", pack_description: "Описание заглушки." },
    money: { name: "Деньги", short: "д.", value: 42 },
    stress: { name: "Напряжение", value: 30, max: 100, step: "Ровно", warning: false },
    notifications: [
      { text: "утро: первая строка", kind: "info" },
      { text: "печать: вторая строка", kind: "seal" },
    ],
    summary: null,
    pending_offer: null,
    categories: [],
    actions: [
      act("a_once", "Сделать штуку", 2, "once", { actor: ["c_hero"], partner: null, candidate: null }, {
        cost: [{ name: "Сырьё", need: 1, have: 5 }],
        description: "Описание <штуки> & пояснение.",
      }),
      act("a_teach", "Научить", 3, "both", { actor: ["c_hero"], partner: ["c_help"], candidate: null }),
      act("a_hire", "Нанять", 1, "once", { actor: ["c_hero"], partner: null, candidate: ["c_cand1", "c_cand2"] }),
      act("a_off", "Недоступное", 4, "once", { actor: ["c_hero"], partner: null, candidate: null }, {
        enabled: false,
        reason: "Нужно больше сырья",
        cost: [{ name: "Сырьё", need: 9, have: 5 }],
      }),
      act("a_assign", "Работа по поручению", 1, "assignable", { actor: ["c_help"], partner: null, candidate: null }),
      act("a_equip", "Поставить станок", 2, "once", { actor: ["c_hero"], partner: null, candidate: null }, {
        replace: {
          warning: "Места нет: что-то придётся убрать.",
          options: [
            { item: "i_eq", name: "Станок" },
            { item: "i_eq2", name: "Верстак" },
          ],
        },
      }),
    ],
    characters: [
      {
        id: "c_hero",
        name: "Герой заглушки",
        role: "hero",
        role_name: "Хозяин заглушки",
        works: true,
        blurb: null,
        status: "ok",
        incapacitated_permanent: false,
        workshop: "w_one",
        vars: [vv("v_skill", "Умение", 12, "12", "number", 1, "Ученик"), vv("v_pct", "Доля", 0.15, "15%", "pct")],
        slots: [{ slot: "s1", slot_name: "Рука", item: "i_1", name: "Инструмент" }],
        equippable: [],
        assignment: { kind: "idle", label: "Ничего" },
        assignable: [
          { assignment: { kind: "idle" }, label: "Ничего", enabled: true, reason: null },
          { assignment: { kind: "action", action: "a_assign" }, label: "Работа по поручению", enabled: true, reason: null },
        ],
        effects: [],
      },
      {
        id: "c_help",
        name: "Помощник",
        role: "worker",
        role_name: "Подручный",
        works: true,
        blurb: "Тихий.",
        status: "ok",
        incapacitated_permanent: false,
        workshop: "w_one",
        vars: [vv("v_wage", "Плата", 3, "3 д.", "money")],
        slots: [{ slot: "s1", slot_name: "Рука", item: null, name: null }],
        equippable: ["i_2"],
        assignment: { kind: "action", label: "Работа по поручению" },
        assignable: [
          { assignment: { kind: "idle" }, label: "Ничего", enabled: true, reason: null },
          { assignment: { kind: "action", action: "a_assign" }, label: "Работа по поручению", enabled: true, reason: null },
          { assignment: { kind: "trade" }, label: "Торговать", enabled: false, reason: "Не умеет торговать" },
        ],
        effects: [{ id: "e_tired", name: "Усталость", text: "Работает медленнее", numbers: "−10%", days_left: 2, negative: true }],
      },
      {
        id: "c_cat",
        name: "Кот",
        role: "pet",
        role_name: null,
        works: false,
        blurb: null,
        status: "incapacitated",
        incapacitated_permanent: false,
        workshop: null,
        vars: [],
        slots: [],
        equippable: [],
        assignment: { kind: "idle", label: "Ничего" },
        assignable: [],
        effects: [],
      },
    ],
    hire_pool: [
      { id: "c_cand1", name: "Кандидат Один", role_name: "Подручный", blurb: "Быстрый.", vars: [vv("v_wage", "Плата", 2, "2 д.", "money")], effects: [] },
      { id: "c_cand2", name: "Кандидат Два", role_name: null, blurb: null, vars: [], effects: [] },
    ],
    workshops: [
      {
        id: "w_one",
        type: "wt_one",
        name: "Первая мастерская",
        vars: [vv("v_cap", "Мест", 2, "2")],
        equipment: [
          { item: "i_eq", name: "Станок" },
          { item: "i_eq2", name: "Верстак" },
        ],
        workers: ["c_hero", "c_help"],
        effects: [],
      },
    ],
    storage: {
      goods: [
        { id: "g_raw", name: "Сырьё", unit: "шт.", qty: 5, unit_value: 1, sell_flag: false },
        { id: "g_prod", name: "Изделие", unit: "шт.", qty: 3, unit_value: 4, sell_flag: true },
      ],
      total_value: 17,
    },
    inventory: [
      { item: "i_2", type: "t_tool", name: "Запасной инструмент", effects: [] },
      { item: "i_3", type: "t_odd", name: "Чужая вещь", effects: [] },
    ],
    market: {
      enabled: true,
      disabled_reason: null,
      hours: 2,
      raw: [{ id: "g_raw", name: "Сырьё", unit_price: 1 }],
      shop: [
        { item_type: "t_tool", name: "Инструмент", price: 10, enabled: true, disabled_reason: null },
        { item_type: "t_big", name: "Дорогой инструмент", price: 99, enabled: false, disabled_reason: "Не хватает денег" },
      ],
    },
    board: [
      {
        id: "o_board",
        title: "Объявление",
        text: "Нужна работа.",
        days_left: 1,
        options: [
          { id: "take", label: "Взять", enabled: true, reason: null, cost: [] },
          { id: "skip", label: "Не брать", enabled: true, reason: null, cost: [] },
        ],
      },
    ],
    obligations: [
      {
        id: "ob_1",
        title: "Заказ",
        days_left: 3,
        requires: [{ name: "Изделие", need: 2, have: 3 }],
        can_deliver: true,
      },
    ],
    effects: [{ id: "e_world", name: "Ярмарка", text: "Цены выше", numbers: null, days_left: null, negative: false }],
    ending: null,
  };
}

/** Окно выбора «сейчас» для заглушки. */
export function sampleOffer(): NonNullable<View["pending_offer"]> {
  return {
    id: "o_now",
    title: "Гость",
    text: "Кто-то стучит.",
    days_left: null,
    options: [
      { id: "yes", label: "Открыть", enabled: true, reason: null, cost: [] },
      { id: "pay", label: "Заплатить", enabled: false, reason: "Мало денег", cost: [{ name: "Деньги", need: 100, have: 42 }] },
    ],
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Фейковая игра: правдоподобно отвечает на все команды контракта. */
export class StubGame implements Game {
  v: View;
  log: Command[] = [];
  constructor(v: View = fullView()) {
    this.v = clone(v);
  }
  view(): View {
    return clone(this.v);
  }
  debugView(): unknown {
    return { stub: true };
  }
  save(): string {
    return JSON.stringify({ stub: 1, v: this.v });
  }
  private fail(code: NonNullable<Result["error"]>["code"], text: string): Result {
    return { ok: false, error: { code, text }, events: [], view: this.view() };
  }
  private ok(events: Line[] = [], stop?: Result["stop"]): Result {
    return { ok: true, events, stop, view: this.view() };
  }
  perform(cmd: Command): Result {
    this.log.push(cmd);
    const v = this.v;
    if (v.ending) return this.fail("game_over", "Игра окончена");
    if (v.pending_offer && cmd.type !== "choose_option") return this.fail("offer_pending", "Сначала ответьте");
    switch (cmd.type) {
      case "work_until_stop": {
        if (v.meta.is_night) return this.fail("no_time", "Ночь");
        v.meta.hour = Math.min(v.meta.day_end, v.meta.hour + 3);
        if (v.meta.hour >= v.meta.day_end) {
          v.meta.is_night = true;
          return this.ok([{ text: "Работали", kind: "info" }], { reason: "sunset", text: "Закат" });
        }
        v.pending_offer = sampleOffer();
        return this.ok([{ text: "Работали", kind: "info" }], { reason: "offer", text: "Стучат в дверь" });
      }
      case "sleep":
        v.meta.day += 1;
        v.meta.hour = v.meta.day_start;
        v.meta.is_night = false;
        v.notifications = [];
        v.summary = {
          title: "Итог дня",
          money_morning: v.money.value - 3,
          delta: -3,
          income: [],
          expense: [{ source: "household", label: "Хозяйство", amount: 3 }],
          morning: [{ text: "Новое утро", kind: "good" }],
        };
        v.money.value -= 3;
        return this.ok([{ text: "Спали", kind: "info" }]);
      case "choose_option": {
        if (v.pending_offer && v.pending_offer.id === cmd.offer) {
          const opt = v.pending_offer.options.find((o) => o.id === cmd.option);
          if (!opt || !opt.enabled) return this.fail("requirement_unmet", "Нельзя");
          v.pending_offer = null;
          return this.ok([{ text: `Выбрано: ${opt.label}`, kind: "good" }]);
        }
        const b = v.board.find((o) => o.id === cmd.offer);
        if (!b) return this.fail("invalid", "Нет такого");
        v.board = v.board.filter((o) => o.id !== cmd.offer);
        return this.ok([{ text: "Объявление снято", kind: "info" }]);
      }
      case "deliver": {
        const ob = v.obligations.find((o) => o.id === cmd.obligation);
        if (!ob || !ob.can_deliver) return this.fail("insufficient", "Не хватает");
        v.obligations = v.obligations.filter((o) => o.id !== cmd.obligation);
        return this.ok([{ text: "Сдано", kind: "seal" }]);
      }
      case "decline":
        if (!v.obligations.some((o) => o.id === cmd.obligation)) return this.fail("invalid", "Нет такого");
        v.obligations = v.obligations.filter((o) => o.id !== cmd.obligation);
        return this.ok([{ text: "Отказ", kind: "warn" }]);
      case "set_sell_flag": {
        const g = v.storage.goods.find((x) => x.id === cmd.good);
        if (!g) return this.fail("invalid", "Нет товара");
        g.sell_flag = cmd.on;
        return this.ok();
      }
      case "set_assignment": {
        const c = v.characters.find((x) => x.id === cmd.character);
        const a = c?.assignable.find((x) => JSON.stringify(x.assignment) === JSON.stringify(cmd.assignment));
        if (!c || !a || !a.enabled) return this.fail("not_available", "Нельзя поручить");
        c.assignment = { kind: cmd.assignment.kind, label: a.label };
        return this.ok();
      }
      case "do_action": {
        const a = v.actions.find((x) => x.id === cmd.action);
        if (!a || !a.enabled) return this.fail("not_available", "Недоступно");
        if (!a.roles.actor.includes(cmd.actor)) return this.fail("invalid", "Не тот исполнитель");
        if (a.roles.partner && !(cmd.partner && a.roles.partner.includes(cmd.partner))) return this.fail("invalid", "Нужен партнёр");
        if (a.roles.candidate && !(cmd.candidate && a.roles.candidate.includes(cmd.candidate))) return this.fail("invalid", "Нужен кандидат");
        if (a.replace) {
          if (!cmd.replace || !a.replace.options.some((o) => o.item === cmd.replace)) return this.fail("invalid", "Выберите замену");
          for (const w of v.workshops) w.equipment = w.equipment.filter((e) => e.item !== cmd.replace);
          a.replace = null;
        }
        if (cmd.candidate) v.hire_pool = v.hire_pool.filter((c) => c.id !== cmd.candidate);
        v.meta.hour += a.hours;
        return this.ok([{ text: `Сделано: ${a.label}`, kind: "good" }]);
      }
      case "market_trip":
        if (!v.market.enabled) return this.fail("not_available", "Рынок закрыт");
        v.meta.hour += v.market.hours;
        return this.ok([{ text: `Рынок: ${JSON.stringify(cmd.buy_raw)} ${cmd.buy_items.join(",")}`, kind: "info" }]);
      case "equip": {
        const c = v.characters.find((x) => x.id === cmd.character);
        const it = v.inventory.find((x) => x.item === cmd.item);
        const slot = c?.slots.find((s) => s.item === null);
        if (!c || !it || !slot || !c.equippable.includes(it.item)) return this.fail("invalid", "Некуда");
        slot.item = it.item;
        slot.name = it.name;
        v.inventory = v.inventory.filter((x) => x.item !== cmd.item);
        return this.ok();
      }
      case "unequip": {
        const c = v.characters.find((x) => x.id === cmd.character);
        const slot = c?.slots.find((s) => s.item === cmd.item);
        if (!c || !slot) return this.fail("invalid", "Нечего снять");
        v.inventory.push({ item: slot.item!, type: "t", name: slot.name ?? "", effects: [] });
        slot.item = null;
        slot.name = null;
        return this.ok();
      }
      case "assign_workshop": {
        const c = v.characters.find((x) => x.id === cmd.character);
        if (!c || !v.workshops.some((w) => w.id === cmd.workshop)) return this.fail("invalid", "Нет такого");
        c.workshop = cmd.workshop;
        return this.ok();
      }
    }
    return this.fail("invalid", "Неизвестная команда");
  }
}

/** API заглушки в форме createGame/loadGame. */
export function stubApi(make: () => View = fullView): GameApi & { created: StubGame[] } {
  const created: StubGame[] = [];
  return {
    created,
    createGame: () => {
      const g = new StubGame(make());
      created.push(g);
      return g;
    },
    loadGame: (_pack, save) => {
      const parsed = JSON.parse(save) as { stub?: number; v?: View };
      if (parsed.stub !== 1 || !parsed.v) throw new Error("несовместимое сохранение");
      const g = new StubGame(parsed.v);
      created.push(g);
      return g;
    },
  };
}
