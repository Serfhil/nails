// API движка (core.md 5.1): createGame, loadGame, Game.perform/view/debugView/save.

import { Engine } from "./engine.ts";
import { indexPack } from "./pack.ts";
import { seedRng } from "./rng.ts";
import type { State } from "./state.ts";
import { SAVE_VERSION, WORLD, charRef, wsRef } from "./state.ts";
import type { Command, DebugView, ErrorCode, Game, Pack, Result, View } from "./types.ts";
import { checkVisibility, drain, emit, resetQueue, settle } from "./events.ts";
import { checkOnce, assignError, runOnce, tradeAllowed, hourStep } from "./actions.ts";
import { sleep, workUntilStop } from "./time.ts";
import { buildDebugView, buildView } from "./view.ts";
import { checkChoose, chooseOption, checkDeliver, deliver, decline } from "./offers.ts";
import { finalValue, isIncap } from "./vars.ts";
import { buyItem, buyRaw, goodVisible, itemPrice, rawCost, rawGoods, salePlan, sellAll, shopOpen } from "./market.ts";
import { createChar, moveToInventory } from "./workforce.ts";

const SAVE_FORMAT = "gvozdi-engine-save";

function emptyState(pack: Pack, seed: number): State {
  const world: Record<string, number> = {};
  return {
    save_version: SAVE_VERSION,
    pack_id: pack.pack.id,
    pack_version: pack.pack.version,
    day: 1,
    hour: pack.pack.settings.day_start,
    rng: seedRng(seed),
    seq: 0,
    world,
    chars: [],
    workshops: [],
    items: [],
    mods: [],
    stock: {},
    sellFlags: {},
    seenGoods: [],
    pool: [],
    nowQueue: [],
    board: [],
    obligations: [],
    eventCounts: {},
    eventLastDay: {},
    condPrev: {},
    visPrev: {},
    ladderPrev: {},
    incapPrev: {},
    opened: {},
    fired: {},
    endings: [],
    summary: null,
    notifications: [],
    ledger: [],
    moneyMorning: 0,
    yesterday: { income: 0, expense: 0 },
    ending: null,
    errors: [],
  };
}

class Err extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, text: string) {
    super(text);
    this.code = code;
  }
}

class GameImpl implements Game {
  e: Engine;
  constructor(e: Engine) {
    this.e = e;
  }

  view(): View {
    const e = this.e;
    e.quiet = true;
    try {
      return buildView(e);
    } finally {
      e.quiet = false;
    }
  }

  debugView(): DebugView {
    const e = this.e;
    e.quiet = true;
    try {
      return buildDebugView(e);
    } finally {
      e.quiet = false;
    }
  }

  save(): string {
    return JSON.stringify({ format: SAVE_FORMAT, save_version: SAVE_VERSION, pack_id: this.e.s.pack_id, pack_version: this.e.s.pack_version, state: this.e.s });
  }

  perform(cmd: Command): Result {
    const e = this.e;
    const snapshot = JSON.stringify(e.s);
    e.lines = [];
    e.stopReq = null;
    e.idleSignaled.clear();
    e.busy.clear();
    e.onceTags.clear();
    resetQueue(e);
    let stop: Result["stop"];
    try {
      stop = this.exec(cmd) ?? undefined;
      settle(e);
    } catch (err) {
      // откат: ошибочная команда не меняет состояние
      e.s = JSON.parse(snapshot);
      e.touch();
      resetQueue(e);
      e.busy.clear();
      e.onceTags.clear();
      const code: ErrorCode = err instanceof Err ? err.code : "invalid";
      if (!(err instanceof Err)) e.error(`внутренняя ошибка команды ${cmd?.type}: ${(err as Error)?.message}`);
      const text = err instanceof Err ? err.message : e.text("reason_invalid");
      // ошибка движка записывается, но состояние игры то же
      return { ok: false, error: { code, text }, events: [], view: this.view() };
    }
    const res: Result = { ok: true, events: e.lines.slice(), view: this.view() };
    if (stop) res.stop = stop;
    return res;
  }

  private fail(code: ErrorCode, text: string): never {
    throw new Err(code, text);
  }

  private exec(cmd: Command): Result["stop"] | null {
    const e = this.e;
    if (!cmd || typeof cmd !== "object") this.fail("invalid", e.text("reason_invalid"));
    if (e.s.ending) this.fail("game_over", e.text("reason_game_over"));
    if (e.s.nowQueue.length) {
      if (cmd.type !== "choose_option" || cmd.offer !== e.s.nowQueue[0].id) this.fail("offer_pending", e.text("reason_offer_pending"));
    }
    const hero = e.heroRef;
    const heroIncap = () => isIncap(e, hero);
    switch (cmd.type) {
      case "work_until_stop": {
        if (e.isNight) this.fail("no_time", e.text("reason_night"));
        return workUntilStop(e);
      }
      case "sleep": {
        sleep(e);
        return null;
      }
      case "do_action": {
        const a = e.idx.actions.get(cmd.action);
        if (heroIncap() && (cmd.actor === e.heroId || cmd.partner === e.heroId)) {
          this.fail("incapacitated", e.text("reason_incapacitated", { name: e.nameOf(hero) }));
        }
        const err = checkOnce(e, a, cmd.actor, cmd.partner ?? null, cmd.candidate ?? null, cmd.replace ?? null);
        if (err) this.fail(err.code, err.text);
        runOnce(e, a!, cmd.actor, cmd.partner ?? null, cmd.candidate ?? null, cmd.replace ?? null);
        return null;
      }
      case "set_assignment": {
        const c = e.char(cmd.character);
        if (!c || !cmd.assignment) this.fail("invalid", e.text("reason_invalid"));
        const as = cmd.assignment;
        if (as.kind === "action") {
          const err = assignError(e, c, e.idx.actions.get(as.action));
          if (err) this.fail(err.code, err.text);
        } else if (as.kind === "trade") {
          if (!tradeAllowed(e, c)) this.fail("not_available", e.text("reason_trade_not_allowed", { name: e.nameOf(charRef(c.id)) }));
        } else if (as.kind !== "idle") this.fail("invalid", e.text("reason_invalid"));
        const same = JSON.stringify(c.assignment) === JSON.stringify(as.kind === "action" ? { kind: "action", action: as.action } : { kind: as.kind });
        if (!same) {
          c.assignment = as.kind === "action" ? { kind: "action", action: as.action } : { kind: as.kind };
          c.progress = 0;
          c.batch = false;
          c.tradeProgress = 0;
          e.touch();
        }
        return null;
      }
      case "market_trip":
        return this.marketTrip(cmd.buy_raw ?? {}, cmd.buy_items ?? []);
      case "set_sell_flag": {
        if (!e.idx.goods.has(cmd.good) || !goodVisible(e, cmd.good) || typeof cmd.on !== "boolean") this.fail("invalid", e.text("reason_invalid"));
        e.s.sellFlags[cmd.good] = cmd.on;
        e.touch();
        return null;
      }
      case "choose_option": {
        const err = checkChoose(e, cmd.offer, cmd.option);
        if (err) this.fail(err.code, err.text);
        chooseOption(e, cmd.offer, cmd.option);
        return null;
      }
      case "deliver": {
        const err = checkDeliver(e, cmd.obligation);
        if (err) this.fail(err.code, err.text);
        deliver(e, cmd.obligation);
        return null;
      }
      case "decline": {
        const ob = e.s.obligations.find((o) => o.id === cmd.obligation && o.state === "active");
        if (!ob) this.fail("invalid", e.text("reason_invalid"));
        decline(e, cmd.obligation);
        return null;
      }
      case "equip":
        this.equip(cmd.character, cmd.item);
        return null;
      case "unequip":
        this.unequip(cmd.character, cmd.item);
        return null;
      case "assign_workshop": {
        const c = e.char(cmd.character);
        const w = e.ws(cmd.workshop);
        if (!c || !w || c.kind !== "worker") this.fail("invalid", e.text("reason_invalid"));
        if (c.workshop !== w.id) {
          const here = e.s.chars.filter((x) => x.kind === "worker" && x.workshop === w.id).length;
          if (here >= Math.floor(finalValue(e, wsRef(w.id), "max_workers") + 1e-9)) {
            this.fail("requirement_unmet", e.text("reason_workers_full", { name: e.nameOf(charRef(c.id)) }));
          }
          c.workshop = w.id;
          c.batch = false;
          c.progress = 0;
          e.touch();
        }
        return null;
      }
      default:
        this.fail("invalid", e.text("reason_invalid"));
    }
  }

  private marketTrip(buyRawReq: Record<string, number>, buyItems: string[]): Result["stop"] | null {
    const e = this.e;
    const hero = e.heroRef;
    if (e.isNight) this.fail("no_time", e.text("reason_night"));
    if (isIncap(e, hero)) this.fail("incapacitated", e.text("reason_incapacitated", { name: e.nameOf(hero) }));
    const hours = e.settings.market_hours ?? 1;
    if (e.s.hour + hours > e.settings.day_end) this.fail("no_time", e.text("reason_no_time"));
    if (typeof buyRawReq !== "object" || !Array.isArray(buyItems)) this.fail("invalid", e.text("reason_invalid"));
    const raws = rawGoods(e);
    let total = 0;
    const plan: [string, number][] = [];
    for (const [g, q] of Object.entries(buyRawReq)) {
      if (!raws.includes(g) || typeof q !== "number" || !Number.isFinite(q) || q < 0 || Math.floor(q) !== q) this.fail("invalid", e.text("reason_invalid"));
      if (q > 0) { plan.push([g, q]); total += rawCost(e, g, q, hero); }
    }
    const shop = shopOpen(e);
    for (const it of buyItems) {
      if (!shop.includes(it)) this.fail("invalid", e.text("reason_invalid"));
      total += itemPrice(e, it, hero);
    }
    const proceeds = salePlan(e, hero).reduce((s, p) => s + p.money, 0);
    const have = finalValue(e, WORLD, "money") + proceeds;
    if (have < total - 1e-9) {
      this.fail("insufficient", e.text("reason_cost", { name: e.idx.raw.pack.names?.money ?? e.idx.vars.get("money")?.name ?? "", need: total, have }));
    }
    const sold = sellAll(e, hero, 0);
    let spent = 0;
    for (const [g, q] of plan) spent += buyRaw(e, g, q, hero);
    for (const it of buyItems) spent += buyItem(e, it, hero);
    e.busy.add(e.heroId);
    try {
      for (let h = 0; h < hours; h++) {
        hourStep(e, null);
        if (e.s.ending) break;
      }
    } finally {
      e.busy.delete(e.heroId);
    }
    emit(e, "market_trip", { sold, spent });
    return null;
  }

  private equip(charId: string, itemId: string): void {
    const e = this.e;
    const it = e.item(itemId);
    if (!it) this.fail("invalid", e.text("reason_invalid"));
    const def = e.idx.items.get(it.type)!;
    const c = e.char(charId);
    if (!c || def.kind !== "tool" || !def.slot || !(def.slot in c.slots) || it.loc.kind !== "inventory") this.fail("invalid", e.text("reason_invalid"));
    const prev = c.slots[def.slot];
    if (prev) { const p = e.item(prev); if (p) moveToInventory(e, p); }
    c.slots[def.slot] = it.id;
    it.loc = { kind: "char", char: c.id, slot: def.slot };
    e.touch();
  }

  private unequip(charId: string, itemId: string): void {
    const e = this.e;
    const it = e.item(itemId);
    if (!it) this.fail("invalid", e.text("reason_invalid"));
    if (it.loc.kind !== "char" || it.loc.char !== charId) this.fail("invalid", e.text("reason_invalid"));
    moveToInventory(e, it);
  }
}

export function createGame(pack: Pack, seed: number): Game {
  const idx = indexPack(pack);
  const s = emptyState(pack, seed);
  const e = new Engine(idx, s);
  for (const v of idx.varsByOwner.world ?? []) s.world[v.id] = v.start;
  for (const g of idx.goods.values()) s.sellFlags[g.id] = !!g.sell_default;
  createChar(e, pack.pack.start.hero, "hero");
  for (const c of idx.chars.values()) if (c.hire_pool && c.id !== pack.pack.start.hero) s.pool.push(c.id);
  emit(e, "game_start", {});
  drain(e);
  checkVisibility(e, true);
  settle(e);
  s.moneyMorning = finalValue(e, WORLD, "money");
  s.ledger = [];
  e.lines = [];
  e.touch();
  return new GameImpl(e);
}

export function loadGame(pack: Pack, save: string): Game {
  let obj: any;
  try {
    obj = JSON.parse(save);
  } catch {
    throw new Error("Сохранение повреждено: это не JSON.");
  }
  if (!obj || obj.format !== SAVE_FORMAT || !obj.state) throw new Error("Это не сохранение этой игры.");
  if (obj.save_version !== SAVE_VERSION) throw new Error(`Сохранение несовместимо: версия ${obj.save_version}, нужна ${SAVE_VERSION}.`);
  if (obj.pack_id !== pack.pack.id) throw new Error(`Сохранение от другого пака: «${obj.pack_id}».`);
  if (obj.pack_version !== pack.pack.version) throw new Error(`Сохранение от другой версии пака: ${obj.pack_version}, сейчас ${pack.pack.version}.`);
  const idx = indexPack(pack);
  const e = new Engine(idx, obj.state as State);
  return new GameImpl(e);
}
