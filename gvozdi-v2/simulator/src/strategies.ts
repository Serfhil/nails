// Стратегии (simulator.md §3). Решения — только по обычному виду View.
// Исключения, описанные в docs/simulator/README.md:
//  - шаблон предложения по id экземпляра (ctx.offerTemplate) — чтобы применять offer_choices из подсказок;
//  - optimizer пользуется статическим разбором пака (PackFacts): какие варианты ведут к концовкам,
//    какие переменные стоят в условиях провальных концовок. Состояние движка не читается.
import type { ActionView, Assignment, CharacterView, Command, View } from "../../engine/src/index.ts";
import type { Hints, PackFacts } from "./hints.ts";
import { Rng } from "./rng.ts";

export const STRATEGIES = ["idle", "routine", "solo", "delegator", "random", "optimizer"] as const;
export type StrategyName = (typeof STRATEGIES)[number];

export interface Ctx {
  hints: Hints;
  facts: PackFacts;
  offerTemplate(id: string): string | null;
}

export interface Strategy {
  next(v: View): Command;
  /** после выполнения команды: ok и вид после неё */
  after(cmd: Command, ok: boolean, before: View, after: View): void;
}

// ---------- числа по умолчанию (описаны в docs/simulator/README.md) ----------
export const DEFAULTS = {
  restMaxPerDay: 4, // не больше стольких отдыхов за день на персонажа
  restProjectShare: 0.9, // герой отдыхает утром, если стресс + вчерашний прирост ≥ 90% максимума
  restStressShare: 0.6, // отдых, когда stress персонажа ≥ 60% максимума (если максимум задан)
  failVarShare: 0.7, // optimizer отдыхает, когда переменная дошла до 70% порога провала
  moneyReserve: 20, // optimizer/delegator не тратят ниже этого запаса (плюс порог провала по деньгам)
  maxHiresDelegator: 3,
  maxHiresOptimizer: 2,
  saleTrust: 0.8, // доля оценки выручки (unit_value), на которую закупаем сырьё
  randomZeroTimeStreak: 5, // random: после стольких команд без времени — принудительно «работать»
  randomSleepWeight: 0.05,
};

const heroOf = (v: View): CharacterView | undefined => v.characters.find((c) => c.role === "hero");
const moneyCost = (v: View, a: { cost: { name: string; need: number }[] }): number =>
  a.cost.filter((c) => c.name === v.money.name).reduce((s, c) => s + c.need, 0);

function pickOption(v: View, offerId: string, options: View["board"][number]["options"], ctx: Ctx, mode: "first" | "goal", rng?: Rng): string | null {
  const en = options.filter((o) => o.enabled);
  if (!en.length) return null;
  if (rng) return rng.pick(en).id;
  const tpl = ctx.offerTemplate(offerId);
  const ends = tpl ? ctx.facts.optionEnding.get(tpl) : undefined;
  if (mode === "goal" && ends) {
    const goal = en.find((o) => ends.get(o.id) === "goal");
    if (goal) return goal.id;
  }
  const hinted = tpl ? ctx.hints.offer_choices[tpl] : undefined;
  if (hinted && en.some((o) => o.id === hinted)) return hinted;
  if (mode === "goal" && ends) {
    const safe = en.find((o) => ends.get(o.id) !== "fail");
    if (safe) return safe.id;
  }
  return en[0].id;
}

// ---------- idle ----------
class Idle implements Strategy {
  constructor(private ctx: Ctx) {}
  next(v: View): Command {
    if (v.pending_offer) {
      const opt = pickOption(v, v.pending_offer.id, v.pending_offer.options, this.ctx, "first");
      if (opt) return { type: "choose_option", offer: v.pending_offer.id, option: opt };
    }
    return { type: "sleep" };
  }
  after(): void {}
}

// ---------- общий «бот» для routine / solo / delegator / optimizer ----------
interface BotFlags {
  orders: boolean;
  rest: boolean;
  hire: number; // максимум наймов
  teach: boolean;
  delegate: boolean;
  invest: boolean;
  goal: boolean;
}

class Bot implements Strategy {
  private day = -1;
  private done = new Set<string>();
  private restsToday = new Map<string, number>();
  private restAction: string | null;
  private notRest = new Set<string>();
  private hires = 0;
  private dayGain = 0;
  private blocked = new Set<string>();
  private workStart: number | null = null;
  private invested = new Set<string>();
  private reserve = 0;
  private failRest: { var: string; at: number }[] = [];

  constructor(private ctx: Ctx, private f: BotFlags) {
    this.restAction = ctx.hints.rest_action;
    if (f.invest || f.goal) {
      this.reserve = DEFAULTS.moneyReserve;
      for (const c of ctx.facts.failConds) {
        if (c.var === "money" && (c.op === "<=" || c.op === "<")) this.reserve = Math.max(this.reserve, c.value + DEFAULTS.moneyReserve);
        else if ((c.op === ">=" || c.op === ">") && c.value > 0) this.failRest.push({ var: c.var, at: c.value * DEFAULTS.failVarShare });
      }
    } else if (f.hire) this.reserve = DEFAULTS.moneyReserve;
  }

  private once(key: string): boolean {
    if (this.done.has(key)) return false;
    this.done.add(key);
    return true;
  }

  /** Оценка производственного действия: место в action_ladder, иначе сумма расхода (дороже вход — дороже выход), при равенстве — позже в списке. */
  private score(v: View, a: ActionView): number {
    const lad = this.ctx.hints.action_ladder.indexOf(a.id);
    const base = lad >= 0 ? 1e6 + lad * 1e3 : a.cost.reduce((s, c) => s + c.need, 0);
    return base + v.actions.indexOf(a) / 1e3;
  }

  /** Сырьё можно докупить: все недостающие строки расхода — сырьё рынка. */
  private buyable(v: View, a: ActionView): boolean {
    return a.cost.every((c) => c.have >= c.need || v.market.raw.some((r) => r.name === c.name));
  }

  private bestFor(v: View, ch: CharacterView): ActionView | null {
    const all: { a: ActionView; enabled: boolean }[] = [];
    for (const as of ch.assignable) {
      const asg = as.assignment as { kind: string; action?: string };
      if (asg.kind !== "action" || !asg.action) continue;
      const a = v.actions.find((x) => x.id === asg.action);
      if (a && as.enabled && !this.blocked.has(a.id) && !this.ctx.facts.failActions.has(a.id)) all.push({ a, enabled: as.enabled });
    }
    all.sort((x, y) => this.score(v, y.a) - this.score(v, x.a));
    // годится: расход есть на складе или докупается на рынке
    const usable = all.filter((x) => this.buyable(v, x.a)).map((x) => x.a);
    for (const { a } of all) {
      if (usable.includes(a)) return a;
      // полуфабрикат (CI-027): недостающий товар делает другое доступное действие — работаем им
      const missing = a.cost.filter((c) => c.have < c.need && !v.market.raw.some((r) => r.name === c.name));
      for (const c of missing) {
        const makers = this.ctx.facts.producers.get(c.name) ?? [];
        const feeder = usable.find((u) => makers.includes(u.id));
        if (feeder) return feeder;
      }
    }
    return null;
  }

  private stressHigh(v: View, hero: CharacterView): boolean {
    const st = hero.vars.find((x) => x.id === "stress");
    const max = v.stress?.max;
    if (st && max && st.value >= max * DEFAULTS.restStressShare) return true;
    if (hero.role !== "hero") return false;
    // прогноз: вчерашний прирост усталости за рабочий день не должен довести до края
    if (v.stress && v.stress.max && v.stress.value > 0 && v.stress.value + this.dayGain >= v.stress.max * DEFAULTS.restProjectShare) return true;
    const rw = this.ctx.hints.rest_when;
    if (rw) {
      const x = hero.vars.find((x) => x.id === rw.var);
      const val = x ? x.value : rw.var === "stress" && v.stress ? v.stress.value : null;
      if (val !== null && val > rw.above) return true;
    } else if (v.stress?.warning) return true;
    for (const fr of this.failRest) {
      const x = hero.vars.find((y) => y.id === fr.var);
      const val = x ? x.value : fr.var === "stress" && v.stress ? v.stress.value : null;
      if (val !== null && val >= fr.at) return true;
    }
    return false;
  }

  private restCandidate(v: View, hero: CharacterView): ActionView | null {
    const ok = (a: ActionView) => a.enabled && a.mode !== "assignable" && a.roles.actor.includes(hero.id) && !a.roles.candidate && !a.roles.partner;
    if (this.restAction) {
      const a = v.actions.find((x) => x.id === this.restAction);
      return a && ok(a) ? a : null;
    }
    return v.actions.find((a) => ok(a) && a.mode === "once" && a.cost.length === 0 && !this.notRest.has(a.id) && !this.ctx.facts.failActions.has(a.id)) ?? null;
  }

  next(v: View): Command {
    if (v.meta.day !== this.day) {
      this.day = v.meta.day;
      this.done.clear();
      this.restsToday.clear();
      this.blocked.clear();
    }
    const ctx = this.ctx;
    if (v.pending_offer) {
      const opt = pickOption(v, v.pending_offer.id, v.pending_offer.options, ctx, this.f.goal ? "goal" : "first");
      if (opt) return { type: "choose_option", offer: v.pending_offer.id, option: opt };
    }
    const ob = v.obligations.find((o) => o.can_deliver && !this.done.has("deliver:" + o.id));
    if (ob) {
      this.done.add("deliver:" + ob.id);
      return { type: "deliver", obligation: ob.id };
    }
    if (v.meta.is_night) return { type: "sleep" };
    const hero = heroOf(v);
    if (!hero) return { type: "work_until_stop" };
    const heroOk = hero.status === "ok";
    const rawIds = new Set(v.market.raw.map((r) => r.id));

    // галочки продажи: продаём всё, что не сырьё рынка и не идёт в расход открытых действий (полуфабрикаты)
    const inputs = new Set(v.actions.flatMap((a) => a.cost.map((c) => c.name)));
    for (const g of v.storage.goods) {
      const want = !rawIds.has(g.id) && !inputs.has(g.name);
      if (g.sell_flag !== want && this.once("flag:" + g.id)) return { type: "set_sell_flag", good: g.id, on: want };
    }

    // заказы с доски
    if (this.f.orders)
      for (const o of v.board) {
        if (!this.once("board:" + o.id)) continue;
        const opt = pickOption(v, o.id, o.options, ctx, this.f.goal ? "goal" : "first");
        if (opt) return { type: "choose_option", offer: o.id, option: opt };
      }

    // отдых: герой и работники (стресс — зарезервированная переменная stress)
    if (this.f.rest) {
      const tired = [hero, ...(this.f.delegate ? v.characters.filter((c) => c.role !== "hero" && c.works) : [])];
      for (const ch of tired) {
        if (ch.status !== "ok" || (this.restsToday.get(ch.id) ?? 0) >= DEFAULTS.restMaxPerDay || !this.stressHigh(v, ch)) continue;
        const r = this.restCandidate(v, ch);
        if (!r || (ch !== hero && !this.restAction)) continue;
        this.restsToday.set(ch.id, (this.restsToday.get(ch.id) ?? 0) + 1);
        return { type: "do_action", action: r.id, actor: ch.id };
      }
    }

    // найм
    if (this.f.hire && heroOk && this.hires < this.f.hire) {
      const hireActs = v.actions.filter((a) => a.enabled && a.roles.candidate && a.roles.candidate.length && a.mode !== "assignable");
      for (const a of hireActs) {
        if (v.money.value - moneyCost(v, a) < this.reserve) continue;
        const pool = a.roles.candidate!;
        const cand = ctx.hints.hire_order.find((c) => pool.includes(c)) ?? pool[0];
        if (!this.once("hire:" + a.id)) continue;
        return { type: "do_action", action: a.id, actor: a.roles.actor.includes(hero.id) ? hero.id : a.roles.actor[0] ?? hero.id, candidate: cand };
      }
    }

    // обучение: действия с партнёром
    if (this.f.teach && heroOk) {
      // обучение: исполнитель — не герой (ученик), партнёр — учитель; так «уволить» (герой + работник) сюда не попадает
      const t = v.actions.find(
        (a) => a.enabled && a.mode !== "assignable" && a.roles.partner?.length && a.roles.actor.some((x) => x !== hero.id) && !a.roles.candidate,
      );
      if (t && v.money.value - moneyCost(v, t) >= this.reserve && this.once("partner-action")) {
        const actor = t.roles.actor.find((x) => x !== hero.id)!;
        const partner = t.roles.partner!.find((x) => x !== actor) ?? t.roles.partner![0];
        return { type: "do_action", action: t.id, actor, partner };
      }
    }

    // поручения работникам и торговля
    if (this.f.delegate) {
      const workers = v.characters.filter((c) => c.role !== "hero" && c.works && c.status === "ok");
      const canTrade = (c: CharacterView) => c.assignable.find((x) => (x.assignment as { kind: string }).kind === "trade" && x.enabled);
      const hinted = workers.filter((c) => ctx.hints.traders.includes(c.id) && canTrade(c));
      const trader = hinted[0] ?? (workers.length >= 2 ? [...workers].reverse().find((c) => canTrade(c)) : undefined);
      for (const w of workers) {
        let target: { assignment: object; label: string } | undefined;
        if (w === trader) target = canTrade(w);
        else {
          const best = this.bestFor(v, w);
          if (best) target = w.assignable.find((x) => (x.assignment as { action?: string }).action === best.id);
        }
        if (target && w.assignment.label !== target.label && this.once("assign:" + w.id))
          return { type: "set_assignment", character: w.id, assignment: target.assignment as Assignment };
      }
    }

    // вложения: разовые действия, стоящие только денег
    if (this.f.invest && heroOk) {
      const inv = v.actions.filter(
        (a) =>
          a.enabled && a.mode === "once" && a.roles.actor.includes(hero.id) && !a.roles.candidate && !a.roles.partner &&
          a.cost.length > 0 && a.cost.every((c) => c.name === v.money.name) && !ctx.facts.failActions.has(a.id) && a.id !== this.restAction,
      );
      // buy_order — предметы (или действия); действие покупки получает место своего предмета
      const rank = (id: string): number => {
        const keys = [id, ...(ctx.facts.actionItems.get(id) ?? [])];
        const r = Math.min(...keys.map((k) => ctx.hints.buy_order.indexOf(k)).filter((i) => i >= 0));
        return Number.isFinite(r) ? r : -1;
      };
      inv.sort((a, b) => {
        const ia = rank(a.id), ib = rank(b.id);
        if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
        return moneyCost(v, a) - moneyCost(v, b);
      });
      for (const a of inv) {
        if (v.money.value - moneyCost(v, a) < this.reserve) continue;
        if (this.invested.has(a.id) || !this.once("invest:" + a.id)) continue;
        // замену оборудования делаем только по buy_order, иначе разовая покупка — один раз за забег
        if (a.replace && rank(a.id) < 0) continue;
        if (rank(a.id) < 0) this.invested.add(a.id);
        const cmd: Command = { type: "do_action", action: a.id, actor: hero.id };
        if (a.replace) cmd.replace = a.replace.options[0]?.item;
        return cmd;
      }
    }

    // работа героя
    const best = this.bestFor(v, hero);
    const producers = 1 + (this.f.delegate ? v.characters.filter((c) => c.role !== "hero" && c.works && c.assignment.kind === "action").length : 0);

    // рынок: утром — продать сделанное и купить сырьё на день (запас денег сырья не касается)
    if (heroOk && v.market.enabled && v.meta.hour + v.market.hours <= v.meta.day_end && this.once("market")) {
      const buy: Record<string, number> = {};
      const sale = v.storage.goods.filter((g) => g.sell_flag).reduce((s, g) => s + g.qty * g.unit_value, 0);
      // выручку считаем с запасом: цена продажи может быть ниже unit_value
      const budget = v.money.value + Math.floor(sale * DEFAULTS.saleTrust);
      if (best) {
        const hoursLeft = v.meta.day_end - v.meta.hour - v.market.hours;
        const lines = best.cost
          .map((c) => ({ c, raw: v.market.raw.find((r) => r.name === c.name) }))
          .filter((x): x is { c: (typeof best.cost)[number]; raw: View["market"]["raw"][number] } => !!x.raw);
        const perBatch = lines.reduce((s, x) => s + x.c.need * x.raw.unit_price, 0);
        let batches = Math.max(1, Math.floor(hoursLeft / Math.max(1, best.hours))) * producers;
        if (perBatch > 0) batches = Math.min(batches, Math.floor(Math.max(0, budget) / perBatch));
        for (const { c, raw } of lines) {
          const q = Math.max(0, c.need * batches - c.have);
          if (q > 0) buy[raw.id] = q;
        }
      }
      // лавка: предметы из buy_order (только стратегии с вложениями), по одному за забег
      const items: string[] = [];
      if (this.f.invest) {
        let left = budget - this.reserve - Object.keys(buy).reduce((s, id) => s + buy[id] * (v.market.raw.find((r) => r.id === id)?.unit_price ?? 0), 0);
        for (const it of ctx.hints.buy_order) {
          const sh = v.market.shop.find((x) => x.item_type === it);
          if (!sh || this.invested.has("item:" + it) || sh.price > left) continue;
          items.push(it);
          this.invested.add("item:" + it);
          left -= sh.price;
        }
      }
      if (sale > 0 || Object.keys(buy).length || items.length) return { type: "market_trip", buy_raw: buy, buy_items: items };
    }

    if (best && heroOk) {
      const t = hero.assignable.find((x) => (x.assignment as { action?: string }).action === best.id);
      if (t && hero.assignment.label !== t.label && this.once("assign:" + hero.id))
        return { type: "set_assignment", character: hero.id, assignment: t.assignment as Assignment };
    }
    return { type: "work_until_stop" };
  }

  after(cmd: Command, ok: boolean, before: View, after: View): void {
    if (cmd.type === "work_until_stop" && before.stress && this.workStart === null) this.workStart = before.stress.value;
    // герой встал: его действие больше недоступно (кончился расход) — до утра выбираем другое, можно ещё раз на рынок
    if (cmd.type === "work_until_stop" && !after.meta.is_night) {
      const hero = heroOf(after);
      const label = hero?.assignment.kind === "action" ? hero.assignment.label : null;
      const a = label ? after.actions.find((x) => x.label === label) : undefined;
      if (hero && a && !a.enabled) {
        this.blocked.add(a.id);
        this.done.delete("assign:" + hero.id);
        this.done.delete("market");
      }
    }
    if (cmd.type === "sleep") {
      if (this.workStart !== null && before.stress) this.dayGain = Math.max(0, before.stress.value - this.workStart);
      this.workStart = null;
    }
    // самообучение отдыха: разовое действие без расхода, после которого стресс не упал, — не отдых
    if (cmd.type === "do_action" && !this.ctx.hints.rest_action && this.f.rest) {
      const s0 = before.stress?.value, s1 = after.stress?.value;
      if (ok && s0 !== undefined && s1 !== undefined) {
        if (s1 < s0) this.restAction = cmd.action;
        else if (!this.restAction) this.notRest.add(cmd.action);
      }
    }
    if (cmd.type === "do_action" && ok && cmd.candidate) this.hires++;
  }
}

// ---------- random ----------
class RandomStrategy implements Strategy {
  private streak = 0;
  constructor(private ctx: Ctx, private rng: Rng) {}
  next(v: View): Command {
    const r = this.rng;
    if (v.pending_offer) {
      const opt = pickOption(v, v.pending_offer.id, v.pending_offer.options, this.ctx, "first", r);
      if (opt) return { type: "choose_option", offer: v.pending_offer.id, option: opt };
    }
    const zero: Command[] = [];
    const timed: Command[] = [];
    for (const o of v.obligations) if (o.can_deliver) zero.push({ type: "deliver", obligation: o.id });
    for (const o of v.board) {
      const en = o.options.filter((x) => x.enabled);
      if (en.length) zero.push({ type: "choose_option", offer: o.id, option: r.pick(en).id });
    }
    for (const c of v.characters) {
      const en = c.assignable.filter((x) => x.enabled && x.label !== c.assignment.label);
      if (en.length) zero.push({ type: "set_assignment", character: c.id, assignment: r.pick(en).assignment as Assignment });
      for (const it of c.equippable) zero.push({ type: "equip", character: c.id, item: it });
    }
    for (const g of v.storage.goods) if (r.next() < 0.2) zero.push({ type: "set_sell_flag", good: g.id, on: !g.sell_flag });
    if (!v.meta.is_night) {
      for (const a of v.actions) {
        if (!a.enabled || a.mode === "assignable" || !a.roles.actor.length) continue;
        const cmd: Command = { type: "do_action", action: a.id, actor: r.pick(a.roles.actor) };
        if (a.roles.partner?.length) cmd.partner = r.pick(a.roles.partner);
        if (a.roles.candidate?.length) cmd.candidate = r.pick(a.roles.candidate);
        if (a.replace?.options.length) cmd.replace = r.pick(a.replace.options).item;
        timed.push(cmd);
      }
      if (v.market.enabled) {
        const buy: Record<string, number> = {};
        for (const raw of v.market.raw) if (r.next() < 0.7) buy[raw.id] = r.int(11);
        timed.push({ type: "market_trip", buy_raw: buy, buy_items: [] });
      }
    }
    if (this.streak < DEFAULTS.randomZeroTimeStreak && zero.length && r.next() < 0.3) {
      this.streak++;
      return r.pick(zero);
    }
    this.streak = 0;
    if (v.meta.is_night) return { type: "sleep" };
    if (r.next() < DEFAULTS.randomSleepWeight) return { type: "sleep" };
    if (timed.length && r.next() < 0.5) return r.pick(timed);
    return { type: "work_until_stop" };
  }
  after(): void {}
}

export function makeStrategy(name: StrategyName, ctx: Ctx, seed: number): Strategy {
  const off: BotFlags = { orders: false, rest: false, hire: 0, teach: false, delegate: false, invest: false, goal: false };
  switch (name) {
    case "idle":
      return new Idle(ctx);
    case "routine":
      return new Bot(ctx, off);
    case "solo":
      return new Bot(ctx, { ...off, orders: true, rest: true });
    case "delegator":
      return new Bot(ctx, { ...off, orders: true, rest: true, hire: DEFAULTS.maxHiresDelegator, teach: true, delegate: true });
    case "optimizer":
      return new Bot(ctx, { orders: true, rest: true, hire: DEFAULTS.maxHiresOptimizer, teach: true, delegate: true, invest: true, goal: true });
    case "random":
      return new RandomStrategy(ctx, new Rng(seed));
  }
}
