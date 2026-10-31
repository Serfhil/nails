// Индекс пака: быстрый доступ по id и умолчания зарезервированных переменных (core.md 4.3).

import type {
  ActionDef, CategoryDef, CharacterDef, EventDef, GoodDef, ItemDef, ModifierDef, OfferDef, Pack, VariableDef, WorkshopDef,
} from "./types.ts";

export interface PackIndex {
  raw: Pack;
  vars: Map<string, VariableDef>;
  varsByOwner: Record<string, VariableDef[]>;
  laddered: Record<string, VariableDef[]>;
  mods: Map<string, ModifierDef>;
  goods: Map<string, GoodDef>;
  items: Map<string, ItemDef>;
  workshops: Map<string, WorkshopDef>;
  chars: Map<string, CharacterDef>;
  actions: Map<string, ActionDef>;
  /** категории действий в порядке файла (может быть пусто) */
  categories: CategoryDef[];
  events: Map<string, EventDef>;
  offers: Map<string, OfferDef>;
  /** события по сигналу в порядке пака */
  bySignal: Map<string, EventDef[]>;
  /** события по условию (trigger без signal, с непустыми conditions) */
  condEvents: EventDef[];
  texts: Record<string, string>;
  maxChain: number;
}

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list ?? []) if (x && typeof x.id === "string" && !m.has(x.id)) m.set(x.id, x);
  return m;
}

export function indexPack(pack: Pack): PackIndex {
  const variables: VariableDef[] = [...(pack.variables ?? [])];
  // Умолчания money и stress, если пак их не объявил (core.md 4.3).
  if (!variables.some((v) => v.id === "money")) {
    variables.unshift({ id: "money", name: pack.pack?.names?.money ?? "money", owner: "world", start: 0, min: 0, format: "money" });
  }
  if (!variables.some((v) => v.id === "stress")) {
    variables.unshift({
      id: "stress", name: pack.pack?.names?.stress ?? "stress", owner: "character", start: 0, min: 0, max: 100,
      good: "down", visible: { type: "self_is_hero" },
    });
  }
  const vars = byId(variables.map((v) => (v.ladder ? { ...v, ladder: [...v.ladder].sort((a, b) => a.at - b.at) } : v)));
  const varsByOwner: Record<string, VariableDef[]> = { character: [], workshop: [], item: [], world: [] };
  const laddered: Record<string, VariableDef[]> = { character: [], workshop: [], item: [], world: [] };
  for (const v of vars.values()) {
    (varsByOwner[v.owner] ??= []).push(v);
    if (v.ladder && v.ladder.length) (laddered[v.owner] ??= []).push(v);
  }
  const events = byId(pack.events);
  const bySignal = new Map<string, EventDef[]>();
  const condEvents: EventDef[] = [];
  for (const ev of events.values()) {
    const t = ev.trigger;
    if (!t) continue;
    if (t.signal) {
      if (!bySignal.has(t.signal)) bySignal.set(t.signal, []);
      bySignal.get(t.signal)!.push(ev);
    } else if (t.conditions && t.conditions.length) {
      condEvents.push(ev);
    }
  }
  return {
    raw: pack,
    vars,
    varsByOwner,
    laddered,
    mods: byId(pack.modifiers),
    goods: byId(pack.goods),
    items: byId(pack.items),
    workshops: byId(pack.workshops),
    chars: byId(pack.characters),
    actions: byId(pack.actions),
    categories: [...byId(pack.categories).values()],
    events,
    offers: byId(pack.offers),
    bySignal,
    condEvents,
    texts: pack.texts ?? {},
    maxChain: pack.pack?.settings?.max_event_chain ?? 32,
  };
}
