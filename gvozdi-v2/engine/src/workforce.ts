// Персонажи, найм, мастерские и предметы (core.md 3.7, 4.6–4.8).

import type { Engine } from "./engine.ts";
import type { CharKind, CharState, ItemLoc, ItemState, Ref, WorkshopState } from "./state.ts";
import { WORLD, charRef, itemRef, refId, refKind, wsRef } from "./state.ts";
import { addModifier, removeModsOfOwner } from "./modifiers.ts";
import { finalValue } from "./vars.ts";
import { emit } from "./events.ts";
import { installEquipment } from "./equipment.ts";

export function charRole(e: Engine, c: CharState): string {
  if (c.kind === "hero") return "hero";
  if (c.kind === "worker") return "worker";
  if (c.kind === "family") return "family";
  return e.idx.chars.get(c.tpl)?.role ?? "other";
}

export function workers(e: Engine): CharState[] {
  return e.s.chars.filter((c) => c.kind === "worker");
}

export function workerCount(e: Engine): number {
  return workers(e).length;
}

export function membersAmong(e: Engine, among: string): CharState[] {
  if (among === "workers") return workers(e);
  if (among === "family") return e.s.chars.filter((c) => c.kind === "family");
  return e.s.chars.slice();
}

export function capacity(e: Engine): number {
  let n = 0;
  for (const w of e.s.workshops) n += finalValue(e, wsRef(w.id), "max_workers");
  return Math.floor(n + 1e-9);
}

export function worksFlag(e: Engine, c: CharState): boolean {
  const def = e.idx.chars.get(c.tpl);
  if (c.kind === "family") return def?.works === true;
  return def?.works !== false;
}

function initVars(e: Engine, owner: "character" | "workshop" | "item", over: Record<string, number> | undefined): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const v of e.idx.varsByOwner[owner] ?? []) vars[v.id] = v.start;
  for (const [k, x] of Object.entries(over ?? {})) if (typeof x === "number") vars[k] = x;
  return vars;
}

/** Ввести персонажа в игру из шаблона. */
export function createChar(e: Engine, tplId: string, kind: CharKind): CharState | null {
  const def = e.idx.chars.get(tplId);
  if (!def) { e.error(`нет шаблона персонажа ${tplId}`); return null; }
  const ex = e.char(tplId);
  if (ex) return ex;
  const slots: Record<string, string | null> = {};
  for (const sl of def.slots ?? []) slots[sl] = null;
  const c: CharState = {
    id: tplId, tpl: tplId, kind, vars: initVars(e, "character", def.vars), workshop: null,
    slots, slotOrder: [...(def.slots ?? [])], assignment: { kind: "idle" }, progress: 0, batch: false, tradeProgress: 0,
  };
  e.s.chars.push(c);
  e.s.pool = e.s.pool.filter((p) => p !== tplId);
  e.touch();
  for (const mid of def.modifiers ?? []) addModifier(e, mid, charRef(c.id));
  return c;
}

export function kindFromTemplate(e: Engine, tplId: string, as?: string): CharKind {
  if (as === "worker" || as === "family") return as;
  const role = e.idx.chars.get(tplId)?.role;
  if (role === "worker") return "worker";
  if (role === "family") return "family";
  return "other";
}

/** Найм (эффект hire). */
export function hire(e: Engine, tplId: string): boolean {
  if (e.char(tplId)) return false;
  if (!e.s.pool.includes(tplId)) { e.error(`найм ${tplId}: персонажа нет в пуле`); return false; }
  if (workerCount(e) >= capacity(e)) { e.error(`найм ${tplId}: нет мест`); return false; }
  const c = createChar(e, tplId, "worker");
  if (!c) return false;
  if (e.s.workshops.length === 1) c.workshop = e.s.workshops[0].id;
  e.pushLine(e.text("log_hired", { name: e.nameOf(charRef(c.id)) }), "good");
  emit(e, "hired", { character: c.id });
  return true;
}

export function addToPool(e: Engine, tplId: string): void {
  if (!e.idx.chars.has(tplId)) { e.error(`нет шаблона персонажа ${tplId}`); return; }
  if (e.char(tplId) || e.s.pool.includes(tplId)) return;
  e.s.pool.push(tplId);
  e.touch();
}

export function addCharacter(e: Engine, tplId: string, as?: string): void {
  const kind = kindFromTemplate(e, tplId, as);
  const c = createChar(e, tplId, kind);
  if (c && kind === "worker" && e.s.workshops.length === 1) c.workshop = e.s.workshops[0].id;
}

export function addWorkshop(e: Engine, type: string): WorkshopState | null {
  const def = e.idx.workshops.get(type);
  if (!def) { e.error(`нет типа мастерской ${type}`); return null; }
  const w: WorkshopState = { id: e.newId("ws"), type, vars: initVars(e, "workshop", def.vars) };
  e.s.workshops.push(w);
  if (e.s.workshops.length === 1) {
    for (const c of workers(e)) if (!c.workshop) c.workshop = w.id;
  }
  e.touch();
  return w;
}

export function equipmentOf(e: Engine, wsId: string): ItemState[] {
  return e.s.items.filter((i) => i.loc.kind === "workshop" && i.loc.ws === wsId);
}

export function freeEquipSlots(e: Engine, wsId: string): number {
  return Math.floor(finalValue(e, wsRef(wsId), "equipment_slots") + 1e-9) - equipmentOf(e, wsId).length;
}

function createItem(e: Engine, type: string, loc: ItemLoc): ItemState | null {
  const def = e.idx.items.get(type);
  if (!def) { e.error(`нет типа предмета ${type}`); return null; }
  const it: ItemState = { id: e.newId("it"), type, vars: initVars(e, "item", def.vars), loc };
  e.s.items.push(it);
  e.touch();
  return it;
}

/**
 * Выдать экземпляр предмета (эффект give_item, покупка).
 * Оборудование ставится в мастерскую цели (у персонажа — его мастерская) по правилам core.md 3.7
 * и никогда не попадает в инвентарь; инструмент — в инвентарь героя или в свободный слот персонажа.
 */
export function giveItem(e: Engine, type: string, target: Ref | null, replaceId?: string | null): ItemState | null {
  const def = e.idx.items.get(type);
  if (!def) { e.error(`нет типа предмета ${type}`); return null; }
  if (def.kind === "equipment") {
    const ws = target && refKind(target) === "workshop" ? target : e.workshopOf(target ?? e.heroRef);
    if (!ws || !e.ws(refId(ws))) { e.error(`оборудование ${type} не выдано: нет мастерской`); return null; }
    return installEquipment(e, refId(ws), type, replaceId);
  }
  if (target && refKind(target) === "character" && target !== e.heroRef) {
    const c = e.charOf(target);
    if (c && def.slot && def.slot in c.slots && !c.slots[def.slot]) {
      const it = createItem(e, type, { kind: "char", char: c.id, slot: def.slot });
      if (it) c.slots[def.slot] = it.id;
      return it;
    }
  }
  return createItem(e, type, { kind: "inventory" });
}

export function destroyItem(e: Engine, it: ItemState): void {
  if (it.loc.kind === "char") {
    const c = e.char(it.loc.char);
    if (c && c.slots[it.loc.slot] === it.id) c.slots[it.loc.slot] = null;
  }
  e.s.items = e.s.items.filter((x) => x !== it);
  removeModsOfOwner(e, itemRef(it.id));
  e.touch();
}

export function moveToInventory(e: Engine, it: ItemState): void {
  if (it.loc.kind === "char") {
    const c = e.char(it.loc.char);
    if (c && c.slots[it.loc.slot] === it.id) c.slots[it.loc.slot] = null;
  }
  it.loc = { kind: "inventory" };
  e.touch();
}

export function removeCharacter(e: Engine, c: CharState): void {
  for (const it of e.s.items) if (it.loc.kind === "char" && it.loc.char === c.id) it.loc = { kind: "inventory" };
  e.s.chars = e.s.chars.filter((x) => x !== c);
  removeModsOfOwner(e, charRef(c.id));
  e.touch();
}

export function removeWorkshop(e: Engine, wsId: string): void {
  for (const it of equipmentOf(e, wsId)) destroyItem(e, it);
  e.s.workshops = e.s.workshops.filter((w) => w.id !== wsId);
  for (const c of e.s.chars) if (c.workshop === wsId) c.workshop = e.s.workshops.length === 1 ? e.s.workshops[0].id : null;
  removeModsOfOwner(e, wsRef(wsId));
  e.touch();
}

export interface Transfer {
  equipment?: boolean;
  workers?: boolean;
  modifiers?: boolean;
  overflow?: "destroy" | "inventory";
}

/** Апгрейд заменой (core.md 3.7). */
export function replaceWorkshop(e: Engine, oldId: string, newType: string, transfer: Transfer | null | undefined): WorkshopState | null {
  const old = e.ws(oldId);
  const def = e.idx.workshops.get(newType);
  if (!old || !def) { e.error(`replace_workshop: нет мастерской ${oldId} или типа ${newType}`); return null; }
  const t: Required<Transfer> = {
    equipment: transfer?.equipment ?? true,
    workers: transfer?.workers ?? true,
    modifiers: transfer?.modifiers ?? true,
    overflow: transfer?.overflow ?? "destroy",
  };
  const nw: WorkshopState = { id: e.newId("ws"), type: newType, vars: initVars(e, "workshop", def.vars) };
  const pos = e.s.workshops.indexOf(old);
  e.s.workshops.splice(pos + 1, 0, nw);
  e.touch();
  // модификаторы, наложенные эффектами
  for (const m of e.s.mods) if (m.owner === wsRef(oldId)) {
    if (t.modifiers) m.owner = wsRef(nw.id);
  }
  e.s.mods = e.s.mods.filter((m) => m.owner !== wsRef(oldId));
  // работники
  for (const c of e.s.chars) if (c.workshop === oldId) c.workshop = t.workers ? nw.id : null;
  // оборудование
  const eq = equipmentOf(e, oldId);
  e.s.workshops = e.s.workshops.filter((w) => w.id !== oldId);
  e.touch();
  for (const it of eq) {
    if (t.equipment && freeEquipSlots(e, nw.id) > 0) { it.loc = { kind: "workshop", ws: nw.id }; e.touch(); continue; }
    if (t.overflow === "inventory") { it.loc = { kind: "inventory" }; e.touch(); }
    else destroyItem(e, it);
  }
  // переменные старой мастерской (кроме заданных шаблоном) не переносятся
  return nw;
}

export function itemsOfChar(e: Engine, c: CharState): ItemState[] {
  return e.s.items.filter((i) => i.loc.kind === "char" && i.loc.char === c.id);
}

export function inventory(e: Engine): ItemState[] {
  return e.s.items.filter((i) => i.loc.kind === "inventory");
}

export { WORLD };
