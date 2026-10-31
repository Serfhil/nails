// Контроллер интерфейса: держит игру и состояние интерфейса, превращает нажатия в команды,
// сохраняет после каждой успешной команды. Без DOM: DOM подключает main.ts.

import type { ActionView, Command, Game, GameApi, Pack, Result, View } from "./contract.ts";
import {
  directCommand,
  initialUi,
  marketCommand,
  onceActions,
  overlayOf,
  pickingCommand,
  replaceCommand,
  startPicking,
  goodsForNewObligations,
  goodsToKeep,
  summaryTotals,
  type UiState,
} from "./model.ts";
import { renderApp } from "./render.ts";
import type { PackEntry } from "./packs.ts";
import { read, remove, saveKey, uiKey, write, type StorageLike } from "./storage.ts";
import { S } from "./strings.ts";

/** Нажатие или изменение элемента с data-act. */
export interface UiEvent {
  act: string;
  data?: Record<string, string | undefined>;
  value?: string;
  checked?: boolean;
}

export interface AppOptions {
  api: GameApi;
  pack: Pack;
  storage: StorageLike | null;
  /** Только для выбора зерна новой игры. */
  random: () => number;
  /** Список паков сборки для окна «Настройки» (вкладывает ui/build.ts); нет — в окне только текущий пак. */
  packs?: PackEntry[];
  /** Вызывается после изменения экрана с готовым HTML. */
  onRender?: (html: string) => void;
}

export interface App {
  readonly game: Game;
  readonly view: View;
  readonly ui: UiState;
  /** Обработать событие интерфейса. true — экран нужно перерисовать. */
  handle(ev: UiEvent): boolean;
  /** Отправить команду движку (с сохранением). */
  perform(cmd: Command): Result;
  html(): string;
}

function newSeed(random: () => number): number {
  return Math.floor(random() * 2147483647) >>> 0;
}

export function createApp(opts: AppOptions): App {
  const { api, pack, storage, random } = opts;
  const packs = opts.packs ?? [];
  const packId = String(pack.pack.id);
  const key = saveKey(packId);
  const ukey = uiKey(packId);

  let ui: UiState = initialUi();
  let game: Game;
  let view: View;

  /** Запоминаются только числа «поддерживать количество»; очищенное поле не сохраняется. */
  function persistedKeep(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, k] of Object.entries(ui.market.keep)) if (typeof k === "number") out[id] = k;
    return out;
  }

  function persistUi(): void {
    write(storage, ukey, JSON.stringify({ summaryClosedDay: ui.summaryClosedDay, keep: persistedKeep(), totals: ui.totals }));
  }

  function persistGame(): void {
    try {
      write(storage, key, game.save());
    } catch {
      /* сохранение не удалось — игра продолжается */
    }
  }

  function startNew(): void {
    game = api.createGame(pack, newSeed(random));
    view = game.view();
    persistGame();
  }

  // запуск: загрузить сохранение или начать заново
  const saved = read(storage, key);
  if (saved !== null) {
    try {
      game = api.loadGame(pack, saved);
      view = game.view();
      const u = read(storage, ukey);
      if (u) {
        const parsed = JSON.parse(u) as { summaryClosedDay?: unknown; keep?: unknown; totals?: { day?: unknown; income?: unknown; expense?: unknown } };
        if (typeof parsed.summaryClosedDay === "number") ui.summaryClosedDay = parsed.summaryClosedDay;
        const t = parsed.totals;
        if (t && typeof t.income === "number" && typeof t.expense === "number") {
          ui.totals = { day: typeof t.day === "number" ? t.day : null, income: t.income, expense: t.expense };
        }
        if (parsed.keep && typeof parsed.keep === "object") {
          for (const [id, k] of Object.entries(parsed.keep)) if (typeof k === "number" && k >= 0) ui.market.keep[id] = k;
        }
      }
    } catch {
      remove(storage, ukey);
      startNew();
      ui.message = { text: S.saveRejected, kind: "warn" };
    }
  } else {
    startNew();
  }
  if (!storage) ui.message = ui.message ?? { text: S.storageUnavailable, kind: "warn" };

  function perform(cmd: Command): Result {
    const r = game.perform(cmd);
    view = r.view ?? game.view();
    if (r.ok && view.summary && ui.totals.day !== view.meta.day) {
      // итог нового дня: прибавить к накопленному один раз
      const t = summaryTotals(view, ui);
      ui.totals = { day: view.meta.day, income: t.allIncome, expense: t.allExpense };
      persistUi();
    }
    if (r.ok) {
      ui.lastEvents = r.events ?? [];
      ui.lastStop = cmd.type === "work_until_stop" && r.stop ? r.stop.text : null;
      ui.message = null;
      persistGame();
    } else {
      ui.message = { text: r.error?.text ?? "", kind: "danger" };
    }
    return r;
  }

  /** Отправить do_action; если движок просит выбрать замену оборудования — сначала окно замены. */
  function send(a: ActionView, cmd: Extract<Command, { type: "do_action" }>): void {
    if (a.replace !== null) ui.replacing = { action: a.id, cmd };
    else perform(cmd);
  }

  function restart(): void {
    remove(storage, key);
    remove(storage, ukey);
    ui = initialUi();
    startNew();
  }

  function handle(ev: UiEvent): boolean {
    const d = ev.data ?? {};
    // вариант выпадающего списка несёт значение в data-value
    if (ev.value === undefined && d.value !== undefined) ev = { ...ev, value: d.value };
    const ov = overlayOf(view, ui);

    // выпадающий список закрывается любым другим нажатием
    const ddWas = ui.dd;
    if (ev.act !== "dd") ui.dd = null;
    if (ev.act === "dd-close") return ddWas !== null;

    // второе нажатие: сброс ожидания, если нажато что-то другое
    const confirmKey = ev.act === "restart" ? "restart" : ev.act === "decline" ? `decline:${d.id}` : null;
    const armed = ui.confirm;
    if (confirmKey !== armed) ui.confirm = null;

    // окна поверх игры пропускают только свои кнопки
    if (ov === "ending" && ev.act !== "restart") return armed !== ui.confirm;
    if (ov === "offer" && ev.act !== "choose") return armed !== ui.confirm;
    if (ov === "replace" && ev.act !== "replace-choose" && ev.act !== "replace-cancel") return armed !== ui.confirm;
    if (ov === "summary" && ev.act !== "summary-close" && ev.act !== "summary-details") return armed !== ui.confirm;
    if (ov === "settings" && ev.act !== "restart" && ev.act !== "settings-close") return armed !== ui.confirm;

    switch (ev.act) {
      case "settings-open":
        if (ov !== null) return false;
        ui.settings = true;
        return true;
      case "settings-close":
        if (!ui.settings) return armed !== ui.confirm;
        ui.settings = false;
        return true;
      case "restart":
        if (armed === "restart") {
          restart();
        } else {
          ui.confirm = "restart";
        }
        return true;
      case "work":
        perform({ type: "work_until_stop" });
        return true;
      case "sleep":
        ui.picking = null;
        perform({ type: "sleep" });
        return true;
      case "action": {
        const a = onceActions(view).find((x) => x.id === d.id);
        if (!a) return false;
        const cmd = directCommand(view, a);
        if (cmd) {
          ui.picking = null;
          send(a, cmd);
        } else {
          ui.picking = ui.picking?.action === a.id ? null : startPicking(view, a);
        }
        return true;
      }
      case "pick": {
        if (!ui.picking || !d.role) return false;
        const role = d.role as "actor" | "partner" | "candidate";
        if (role === "actor" || role === "partner" || role === "candidate") ui.picking[role] = ev.value || null;
        return true;
      }
      case "pick-go": {
        const p = ui.picking;
        if (!p) return false;
        const a = onceActions(view).find((x) => x.id === p.action);
        const cmd = a ? pickingCommand(a, p) : null;
        if (!cmd) return false;
        ui.picking = null;
        send(a!, cmd);
        return true;
      }
      case "replace-choose": {
        const rp = ui.replacing;
        if (!rp || !d.item) return false;
        const cmd = replaceCommand(view, rp, d.item);
        if (!cmd) return false;
        ui.replacing = null;
        perform(cmd);
        return true;
      }
      case "replace-cancel":
        ui.replacing = null;
        return true;
      case "pick-cancel":
        ui.picking = null;
        return true;
      case "choose":
        if (!d.offer || !d.option) return false;
        if (ov === "offer" && d.offer !== view.pending_offer?.id) return false;
      {
        // товары, нужные для принятого заказа, снимаем с продажи (расход варианта читаем до выбора: после него вариант пропадает из вида; требования нового заказа — после)
        const before = view;
        const keep = goodsToKeep(view, d.offer, d.option);
        const r = perform({ type: "choose_option", offer: d.offer, option: d.option });
        // и товары, которые требуются появившемуся после выбора заказу
        if (r.ok) for (const good of goodsForNewObligations(before, view)) if (!keep.includes(good)) keep.push(good);
        if (r.ok && keep.length) {
          for (const good of keep) game.perform({ type: "set_sell_flag", good, on: false });
          view = game.view();
          persistGame();
        }
        return true;
      }
      case "deliver":
        if (!d.id) return false;
        perform({ type: "deliver", obligation: d.id });
        return true;
      case "decline":
        if (!d.id) return false;
        if (armed === `decline:${d.id}`) {
          ui.confirm = null;
          perform({ type: "decline", obligation: d.id });
        } else {
          ui.confirm = `decline:${d.id}`;
        }
        return true;
      case "assign": {
        const c = view.characters.find((x) => x.id === d.char);
        const i = Number(ev.value);
        if (!c || ev.value === "" || ev.value === undefined || !Number.isInteger(i) || !c.assignable[i]) return false;
        perform({ type: "set_assignment", character: c.id, assignment: c.assignable[i].assignment as never });
        return true;
      }
      case "assign-ws":
        if (!d.char || !ev.value) return false;
        perform({ type: "assign_workshop", character: d.char, workshop: ev.value });
        return true;
      case "equip":
        if (!d.char || !ev.value) return false;
        perform({ type: "equip", character: d.char, item: ev.value });
        return true;
      case "unequip":
        if (!d.char || !d.item) return false;
        perform({ type: "unequip", character: d.char, item: d.item });
        return true;
      case "sell-flag":
        if (!d.id) return false;
        perform({ type: "set_sell_flag", good: d.id, on: !!ev.checked });
        return true;
      case "market-raw": {
        if (!d.id) return false;
        const n = Number((ev.value ?? "").replace(/\D/g, ""));
        if (Number.isFinite(n) && n > 0) ui.market.raw[d.id] = n;
        else delete ui.market.raw[d.id];
        return true; // dom.ts возвращает фокус полю после перерисовки
      }
      case "market-keep": {
        if (!d.id) return false;
        const digits = (ev.value ?? "").replace(/\D/g, "");
        ui.market.keep[d.id] = digits === "" ? null : Number(digits);
        persistUi();
        return true;
      }
      case "market-item": {
        if (!d.id) return false;
        const set = new Set(ui.market.items);
        if (ev.checked) set.add(d.id);
        else set.delete(d.id);
        ui.market.items = [...set];
        return true;
      }
      case "market-go": {
        const r = perform(marketCommand(view, ui));
        if (r.ok) ui.market = { raw: {}, keep: ui.market.keep, items: [] };
        return true;
      }
      case "dd":
        if (!d.key) return false;
        ui.dd = ddWas === d.key ? null : d.key;
        return true;
      case "fold": {
        if (!d.key) return false;
        ui.open = ui.open.includes(d.key) ? ui.open.filter((k) => k !== d.key) : [...ui.open, d.key];
        return true;
      }
      case "cat-fold": {
        if (!d.id) return false;
        ui.catOpen = ui.catOpen.includes(d.id) ? ui.catOpen.filter((k) => k !== d.id) : [...ui.catOpen, d.id];
        return true;
      }
      case "cat-pick": {
        const a = onceActions(view).find((x) => x.id === ev.value);
        if (!d.cat || !a || a.category !== d.cat || !a.enabled) return false;
        ui.catPick[d.cat] = a.id;
        ui.picking = null;
        return true;
      }
      case "ws-tab":
        if (!d.id) return false;
        ui.workshopTab = d.id;
        return true;
      case "summary-details":
        ui.showSummaryDetails = !ui.showSummaryDetails;
        return true;
      case "summary-close":
        ui.summaryClosedDay = view.meta.day;
        ui.showSummaryDetails = false;
        persistUi();
        return true;
      default:
        return false;
    }
  }

  const app: App = {
    get game() {
      return game;
    },
    get view() {
      return view;
    },
    get ui() {
      return ui;
    },
    handle(ev) {
      const changed = handle(ev);
      if (changed) opts.onRender?.(renderApp(view, ui, packs));
      return changed;
    },
    perform,
    html: () => renderApp(view, ui, packs),
  };
  return app;
}
