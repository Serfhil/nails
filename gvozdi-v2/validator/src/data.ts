// Контексты данных событий, предложений, обязательств и модификаторов (core.md 3.11, 3.13):
// какие имена `$data` и подстановки `{имя}` могут прийти (possible) и приходят всегда (sure).
import type { PackIndex } from "./index-pack.ts";
import { arr, isObj } from "./util.ts";

/** Данные сигналов (core.md 3.9): гарантированные и возможные дополнительно. */
const SIGNAL_DATA: Record<string, { sure: string[]; maybe?: string[] }> = {
  game_start: { sure: [] },
  night: { sure: [] },
  morning: { sure: [] },
  action_done: { sure: ["action", "actor"], maybe: ["partner"] },
  batch_defect: { sure: ["action", "actor"] },
  idle_no_cost: { sure: ["action", "actor"] },
  ladder_step: { sure: ["var", "owner", "step", "level", "dir"] },
  modifier_expired: { sure: ["template", "owner", "data"] },
  became_visible: { sure: ["kind", "id", "owner"] },
  incapacitated: { sure: ["owner", "permanent"] },
  hired: { sure: ["character"] },
  market_trip: { sure: ["sold", "spent"] },
  obligation_done: { sure: ["obligation", "data"] },
  obligation_failed: { sure: ["obligation", "data"] },
  obligation_declined: { sure: ["obligation", "data"] },
  offer_expired: { sure: ["offer", "data"] },
};

/** Участник события доступен в данных сигнала под этими именами. */
interface Src {
  from?: string;
  keys: string[];
  maybe?: string[];
  participant?: boolean;
}

const keysOf = (v: unknown): string[] => (isObj(v) ? Object.keys(v) : []);

export class DataContexts {
  private sources = new Map<string, Src[]>();
  private own = new Map<string, string[]>();
  private defaults = new Map<string, string[]>();
  private ownParticipant = new Set<string>();
  possible = new Map<string, Set<string>>();
  sure = new Map<string, Set<string>>();
  participant = new Map<string, boolean>();

  constructor(private ix: PackIndex) {
    this.build();
    this.solve();
  }

  private src(ctx: string, s: Src): void {
    const l = this.sources.get(ctx) ?? [];
    l.push(s);
    this.sources.set(ctx, l);
  }

  private build(): void {
    const ix = this.ix;
    // данные модификаторов (для modifier_expired) и обязательств/предложений (для obligation_*, offer_expired)
    const modData = new Set<string>();
    const offerData = new Set<string>();
    const obData = new Set<string>();
    for (const m of ix.mods.values()) keysOf(m.data_defaults).forEach((k) => modData.add(k));
    for (const s of ix.effects) {
      if (s.type === "add_modifier") keysOf(s.e.data).forEach((k) => modData.add(k));
      if (s.type === "show_offer") keysOf(s.e.data).forEach((k) => offerData.add(k));
    }
    for (const o of ix.offers.values()) {
      keysOf(o.data).forEach((k) => offerData.add(k));
      keysOf(o.data_defaults).forEach((k) => offerData.add(k));
    }
    for (const r of ix.obligations.values()) keysOf(r.ob.data).forEach((k) => obData.add(k));
    const extraFor = (signal: string): string[] => {
      if (signal === "modifier_expired") return [...modData];
      if (signal.startsWith("obligation_")) return [...obData, ...offerData];
      if (signal === "offer_expired") return [...offerData];
      return [];
    };

    for (const [id, ev] of ix.events) {
      const ctx = `event:${id}`;
      this.defaults.set(ctx, keysOf(ev.data_defaults));
      if (ev.participant != null) this.ownParticipant.add(ctx);
      if (isObj(ev.trigger)) {
        const sig = ev.trigger.signal;
        if (typeof sig === "string" && SIGNAL_DATA[sig])
          this.src(ctx, { keys: SIGNAL_DATA[sig].sure, maybe: [...(SIGNAL_DATA[sig].maybe ?? []), ...extraFor(sig)] });
        else this.src(ctx, { keys: [] });
      }
    }
    for (const [id, of] of ix.offers) {
      const ctx = `offer:${id}`;
      this.own.set(ctx, keysOf(of.data));
      this.defaults.set(ctx, keysOf(of.data_defaults));
    }
    for (const [obId, r] of ix.obligations) {
      void obId;
      const ctx = `ob:${r.offer}#${r.option}`;
      this.own.set(ctx, keysOf(r.ob.data));
      this.defaults.set(ctx, keysOf(ix.offers.get(r.offer)?.data_defaults));
      this.src(ctx, { from: `offer:${r.offer}`, keys: [] });
    }
    for (const [id, m] of ix.mods) this.defaults.set(`modifier:${id}`, keysOf(m.data_defaults));

    // структурные источники модификаторов (без данных)
    const structural = (list: unknown) => {
      for (const t of arr(list)) if (typeof t === "string") this.src(`modifier:${t}`, { keys: [] });
    };
    for (const c of ix.chars.values()) structural(c.modifiers);
    for (const w of ix.workshops.values()) structural(w.modifiers);
    for (const it of ix.items.values()) structural(it.modifiers);
    for (const v of ix.vars.values()) for (const st of arr(v.ladder)) if (isObj(st)) structural(st.modifiers);

    for (const s of ix.effects) {
      const from = s.scope.dataKey;
      if (s.type === "run_event" && typeof s.e.event === "string")
        this.src(`event:${s.e.event}`, { from, keys: keysOf(s.e.data), participant: s.e.participant != null });
      else if (s.type === "show_offer" && typeof s.e.offer === "string")
        this.src(`offer:${s.e.offer}`, { from, keys: keysOf(s.e.data) });
      else if (s.type === "add_modifier" && typeof s.e.template === "string")
        this.src(`modifier:${s.e.template}`, { keys: keysOf(s.e.data) });
    }
  }

  private allCtx(): string[] {
    const s = new Set<string>([...this.sources.keys(), ...this.own.keys(), ...this.defaults.keys()]);
    return [...s];
  }

  private solve(): void {
    const ctxs = this.allCtx();
    // possible и participant — наименьшая неподвижная точка (объединение)
    for (const c of ctxs) {
      this.possible.set(c, new Set(this.own.get(c) ?? []));
      this.participant.set(c, this.ownParticipant.has(c));
    }
    let changed = true;
    for (let g = 0; changed && g < 200; g++) {
      changed = false;
      for (const c of ctxs) {
        const p = this.possible.get(c)!;
        const before = p.size;
        let part = this.participant.get(c)!;
        for (const s of this.sources.get(c) ?? []) {
          s.keys.forEach((k) => p.add(k));
          s.maybe?.forEach((k) => p.add(k));
          if (s.from) this.possible.get(s.from)?.forEach((k) => p.add(k));
          if (s.participant || (s.from && this.participant.get(s.from))) part = true;
        }
        if (p.size !== before || part !== this.participant.get(c)) changed = true;
        this.participant.set(c, part);
      }
    }
    // sure — наибольшая неподвижная точка (пересечение по источникам)
    const TOP = null;
    const cur = new Map<string, Set<string> | null>();
    for (const c of ctxs) cur.set(c, (this.sources.get(c) ?? []).length ? TOP : new Set(this.own.get(c) ?? []));
    changed = true;
    for (let g = 0; changed && g < 200; g++) {
      changed = false;
      for (const c of ctxs) {
        const srcs = this.sources.get(c) ?? [];
        if (!srcs.length) continue;
        let acc: Set<string> | null = TOP;
        for (const s of srcs) {
          const from = s.from ? cur.get(s.from) ?? new Set<string>() : new Set<string>();
          if (from === TOP) continue; // источник пока «всё» — не сужает
          const set = new Set<string>([...s.keys, ...from]);
          const prevAcc: Set<string> | null = acc;
          acc = prevAcc === null ? set : new Set([...prevAcc].filter((k: string) => set.has(k)));
        }
        if (acc === TOP) continue;
        for (const k of this.own.get(c) ?? []) acc.add(k);
        const prev = cur.get(c);
        if (prev === TOP || prev === undefined || prev.size !== acc.size) {
          cur.set(c, acc);
          changed = true;
        }
      }
    }
    for (const c of ctxs) {
      const v = cur.get(c);
      // остался TOP только у контекстов, замкнутых в цикл без внешних источников: считаем, что гарантий нет
      this.sure.set(c, v ?? new Set(this.own.get(c) ?? []));
    }
  }

  defaultsOf(ctx: string): string[] {
    return this.defaults.get(ctx) ?? [];
  }

  /** «ok» — имя приходит всегда или есть data_defaults; «partial» — не все источники; «none» — никто не даёт */
  status(ctx: string, name: string): "ok" | "partial" | "none" {
    if (this.defaultsOf(ctx).includes(name)) return "ok";
    if (this.sure.get(ctx)?.has(name)) return "ok";
    if (this.possible.get(ctx)?.has(name)) return "partial";
    return "none";
  }

  hasParticipant(ctx: string): boolean {
    return this.participant.get(ctx) === true;
  }
}
