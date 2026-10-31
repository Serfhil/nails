// Оборудование мастерской (core.md 3.7, 4.6): линейки и уровни, четыре случая установки, замена.

import type { Engine } from "./engine.ts";
import type { ActionDef, ItemDef } from "./types.ts";
import type { ItemState, Ref } from "./state.ts";
import { refId, refKind } from "./state.ts";
import { finalValue } from "./vars.ts";
import { destroyItem, equipmentOf } from "./workforce.ts";

export type Placement =
  /** поставить нельзя: 0 мест или та же линейка не ниже */
  | { kind: "blocked" }
  /** прямой апгрейд: встаёт на место той же линейки ниже уровнем */
  | { kind: "upgrade"; old: ItemState }
  /** свободное место */
  | { kind: "free" }
  /** все места заняты другими линейками — нужна замена */
  | { kind: "replace"; options: ItemState[] };

function lineOf(d: ItemDef | undefined): string {
  return d?.line ?? d?.id ?? "";
}

export function slotsOf(e: Engine, wsId: string): number {
  return Math.max(0, Math.floor(finalValue(e, `ws:${wsId}`, "equipment_slots") + 1e-9));
}

/** Куда встанет оборудование типа `type` в мастерской `wsId`. */
export function placement(e: Engine, wsId: string, type: string): Placement {
  const d = e.idx.items.get(type);
  const slots = slotsOf(e, wsId);
  if (!d || !e.ws(wsId) || slots <= 0) return { kind: "blocked" };
  const eq = equipmentOf(e, wsId);
  const line = lineOf(d);
  const grade = d.grade ?? 1;
  const same = eq.filter((it) => lineOf(e.idx.items.get(it.type)) === line);
  if (same.some((it) => (e.idx.items.get(it.type)?.grade ?? 1) >= grade)) return { kind: "blocked" };
  if (same.length) {
    const old = [...same].sort((a, b) => (e.idx.items.get(a.type)?.grade ?? 1) - (e.idx.items.get(b.type)?.grade ?? 1))[0];
    return { kind: "upgrade", old };
  }
  if (eq.length < slots) return { kind: "free" };
  return { kind: "replace", options: eq };
}

/**
 * Поставить оборудование. `replaceId` — выбранный игроком экземпляр для случая 4.
 * Возвращает экземпляр или null (не выдано — запись в ошибки выполнения).
 */
export function installEquipment(e: Engine, wsId: string, type: string, replaceId: string | null | undefined): ItemState | null {
  const pl = placement(e, wsId, type);
  if (pl.kind === "blocked") { e.error(`оборудование ${type} не выдано: нет места или та же линейка не ниже`); return null; }
  if (pl.kind === "upgrade") destroyItem(e, pl.old);
  if (pl.kind === "replace") {
    const old = pl.options.find((it) => it.id === replaceId);
    if (!old) { e.error(`оборудование ${type} не выдано: все места заняты, замена не выбрана`); return null; }
    destroyItem(e, old);
  }
  const d = e.idx.items.get(type)!;
  const vars: Record<string, number> = {};
  for (const v of e.idx.varsByOwner.item ?? []) vars[v.id] = v.start;
  for (const [k, x] of Object.entries(d.vars ?? {})) if (typeof x === "number") vars[k] = x;
  const it: ItemState = { id: e.newId("it"), type, vars, loc: { kind: "workshop", ws: wsId } };
  e.s.items.push(it);
  e.touch();
  return it;
}

/** Первое оборудование, которое действие ставит в мастерскую исполнителя (или null). */
export function actionEquipment(e: Engine, a: ActionDef): string | null {
  for (const eff of a.effects ?? []) {
    if (eff.type !== "give_item") continue;
    if ((eff.target ?? "hero") !== "workshop") continue;
    if (e.idx.items.get(eff.item)?.kind === "equipment") return eff.item;
  }
  return null;
}

/** Размещение оборудования действия для исполнителя `actor`; null — действие оборудование не ставит. */
export function actionPlacement(e: Engine, a: ActionDef, actor: Ref | null): { ws: string | null; type: string; pl: Placement } | null {
  const type = actionEquipment(e, a);
  if (!type) return null;
  const ws = e.workshopOf(actor ?? e.heroRef);
  if (!ws || refKind(ws) !== "workshop") return { ws: null, type, pl: { kind: "blocked" } };
  return { ws: refId(ws), type, pl: placement(e, refId(ws), type) };
}

/** Текст предупреждения и варианты замены для вида (случай 4). */
export function replaceInfo(e: Engine, type: string, options: ItemState[]): { warning: string; options: { item: string; name: string }[] } {
  const name = (t: string) => e.idx.items.get(t)?.name ?? t;
  return {
    warning: e.text("replace_warning", { item: name(type), old: options.map((o) => name(o.type)).join(", ") }),
    options: options.map((o) => ({ item: o.id, name: name(o.type) })),
  };
}
