// Модификаторы (core.md 3.2, 4.4): сбор действующих на сущность, наложение, снятие, истечение.

import type { Engine } from "./engine.ts";
import { fmtNum, norm } from "./engine.ts";
import type { CondNode, Duration, EffectView, ModifierDef } from "./types.ts";
import type { ModState, Ref } from "./state.ts";
import { WORLD, charRef, itemRef, refKind, wsRef } from "./state.ts";
import { evalCond } from "./conditions.ts";
import { finalValue, ladderStepIndex, resolveSubject } from "./vars.ts";

/** Действующий модификатор (хранимый или от источника). */
export interface ActiveMod {
  uid: string;
  def: ModifierDef;
  owner: Ref;
  stored: ModState | null;
  /** источник для модификаторов `source`: "item:<id>", "ws:<id>", "ladder:<ref>:<var>:<step>" */
  source: string | null;
  data: Record<string, any>;
}

function targetOf(def: ModifierDef, sourceOwner: Ref, e: Engine): Ref {
  const t = def.target ?? "owner";
  if (t === "hero") return e.heroRef;
  if (t === "world") return WORLD;
  return sourceOwner;
}

/** Модификаторы от предметов, мастерских и хранимые — не зависят от значений переменных. */
function staticMap(e: Engine): Map<Ref, ActiveMod[]> {
  const key = "static_mods";
  const c = e.cache.get(key);
  if (c) return c;
  const m = new Map<Ref, ActiveMod[]>();
  const push = (ref: Ref, am: ActiveMod) => {
    if (!m.has(ref)) m.set(ref, []);
    m.get(ref)!.push(am);
  };
  for (const st of e.s.mods) {
    const def = e.idx.mods.get(st.tpl);
    if (!def) continue;
    let owner = st.owner;
    // модификатор на экземпляре предмета с переменной не предметного владельца действует на держателя
    if (refKind(owner) === "item" && def.var) {
      const vdef = e.idx.vars.get(def.var);
      if (vdef && vdef.owner !== "item") {
        const it = e.item(owner.slice(5));
        if (it && it.loc.kind === "char" && vdef.owner === "character") owner = charRef(it.loc.char);
        else if (it && it.loc.kind === "workshop" && vdef.owner === "workshop") owner = wsRef(it.loc.ws);
        else if (vdef.owner === "world") owner = WORLD;
      }
    }
    push(owner, { uid: `m${st.uid}`, def, owner, stored: st, source: null, data: { ...(def.data_defaults ?? {}), ...st.data } });
  }
  for (const it of e.s.items) {
    const idef = e.idx.items.get(it.type);
    if (!idef) continue;
    let holder: Ref | null = null;
    if (it.loc.kind === "char") holder = charRef(it.loc.char);
    else if (it.loc.kind === "workshop") holder = wsRef(it.loc.ws);
    if (!holder) continue; // в инвентаре предмет не действует
    for (const mid of idef.modifiers ?? []) {
      const def = e.idx.mods.get(mid);
      if (!def) continue;
      const owner = targetOf(def, holder, e);
      push(owner, { uid: `src:${itemRef(it.id)}:${mid}`, def, owner, stored: null, source: itemRef(it.id), data: { ...(def.data_defaults ?? {}) } });
    }
  }
  for (const w of e.s.workshops) {
    const wdef = e.idx.workshops.get(w.type);
    for (const mid of wdef?.modifiers ?? []) {
      const def = e.idx.mods.get(mid);
      if (!def) continue;
      const owner = targetOf(def, wsRef(w.id), e);
      push(owner, { uid: `src:${wsRef(w.id)}:${mid}`, def, owner, stored: null, source: wsRef(w.id), data: { ...(def.data_defaults ?? {}) } });
    }
  }
  e.cache.set(key, m);
  return m;
}

/** Все сущности игры (для обхода лестниц). */
export function allRefs(e: Engine): Ref[] {
  return [
    WORLD,
    ...e.s.chars.map((c) => charRef(c.id)),
    ...e.s.workshops.map((w) => wsRef(w.id)),
    ...e.s.items.map((i) => itemRef(i.id)),
  ];
}

export function ownerTypeOf(ref: Ref): "world" | "character" | "workshop" | "item" {
  return refKind(ref);
}

/** Модификаторы ступеней лестниц, действующие на ref. */
function ladderMods(e: Engine, ref: Ref): ActiveMod[] {
  const out: ActiveMod[] = [];
  const addFrom = (src: Ref, crossOnly: boolean) => {
    for (const v of e.idx.laddered[ownerTypeOf(src)] ?? []) {
      // быстрая отсечка: есть ли вообще у лестницы модификаторы, нацеленные куда нужно
      const steps = v.ladder!;
      let relevant = false;
      for (const st of steps) for (const mid of st.modifiers ?? []) {
        const def = e.idx.mods.get(mid);
        if (!def) continue;
        const t = targetOf(def, src, e);
        if (t === ref && (!crossOnly || (def.target && def.target !== "owner"))) relevant = true;
      }
      if (!relevant) continue;
      const si = ladderStepIndex(e, src, v.id);
      if (si === null) continue;
      const step = steps[si];
      for (const mid of step.modifiers ?? []) {
        const def = e.idx.mods.get(mid);
        if (!def) continue;
        if (targetOf(def, src, e) !== ref) continue;
        out.push({ uid: `src:ladder:${src}:${v.id}:${step.id}:${mid}`, def, owner: ref, stored: null, source: `ladder:${src}:${v.id}:${step.id}`, data: { ...(def.data_defaults ?? {}) } });
      }
    }
  };
  addFrom(ref, false);
  // лестницы других сущностей с целью hero/world
  if (ref === WORLD || ref === e.heroRef) {
    for (const src of allRefs(e)) if (src !== ref) addFrom(src, true);
  }
  return out;
}

/** Все модификаторы, действующие на сущность. */
export function activeMods(e: Engine, ref: Ref): ActiveMod[] {
  const key = `mods|${ref}`;
  const c = e.cache.get(key);
  if (c) return c;
  if (e.computing.has(key)) {
    // защита от цикла: без модификаторов лестниц
    return staticMap(e).get(ref) ?? [];
  }
  e.computing.add(key);
  try {
    const list = [...(staticMap(e).get(ref) ?? []), ...ladderMods(e, ref)];
    e.cache.set(key, list);
    return list;
  } finally {
    e.computing.delete(key);
  }
}

/** Величина модификатора (с учётом value_from и $data). */
export function modMagnitude(e: Engine, m: ActiveMod): number {
  const def = m.def;
  if (def.value_from) {
    const vf = def.value_from;
    const subj = resolveSubject(e, vf.subject ?? "self", { self: m.owner });
    if (!subj) return 0;
    const v = finalValue(e, subj, vf.var);
    return norm((v - (vf.baseline ?? 0)) * (vf.per_point ?? 1));
  }
  const val = def.value as any;
  if (val && typeof val === "object" && "$data" in val) {
    const x = m.data[val.$data];
    if (typeof x === "number") return x;
    e.error(`модификатор ${def.id}: нет данных ${val.$data}`);
    return 0;
  }
  return typeof val === "number" ? val : 0;
}

export function tagsMatch(def: ModifierDef, tags: string[]): boolean {
  if (!def.action_tags || def.action_tags.length === 0) return true;
  return def.action_tags.some((t) => tags.includes(t));
}

/** Наложить модификатор эффектом. */
export function addModifier(
  e: Engine, tplId: string, owner: Ref, opts: { duration?: Duration | null; data?: Record<string, any> } = {},
): void {
  const def = e.idx.mods.get(tplId);
  if (!def) { e.error(`нет шаблона модификатора ${tplId}`); return; }
  if (!e.exists(owner)) return;
  const dur: Duration = (opts.duration ?? def.duration ?? { kind: "forever" }) as Duration;
  let kind: ModState["kind"] = "forever";
  let days: number | null = null;
  let cond: CondNode = null;
  if (dur.kind === "days") {
    kind = "days";
    days = typeof dur.n === "number" ? dur.n : Number(opts.data?.[(dur.n as any).$data] ?? 1);
  } else if (dur.kind === "while") {
    kind = "while";
    cond = dur.condition;
  } else {
    kind = "forever"; // forever и source при наложении эффектом живут бессрочно
  }
  const data = { ...(opts.data ?? {}) };
  if (!def.stack) {
    const ex = e.s.mods.find((m) => m.tpl === tplId && m.owner === owner);
    if (ex) {
      if (ex.kind === "days" && kind === "days") ex.days = Math.max(ex.days ?? 0, days ?? 0);
      else if (kind === "forever") { ex.kind = "forever"; ex.days = null; }
      Object.assign(ex.data, data);
      e.touch();
      return;
    }
  }
  e.s.seq++;
  e.s.mods.push({ uid: e.s.seq, tpl: tplId, owner, kind, days, cond, data });
  e.touch();
}

/** Снять модификаторы по шаблону или тегу. Возвращает число снятых. */
export function removeModifiers(e: Engine, owner: Ref, sel: { template?: string; tag?: string }, count?: number): number {
  let removed = 0;
  const keep = [];
  for (const m of e.s.mods) {
    const def = e.idx.mods.get(m.tpl);
    const match = m.owner === owner && (
      (sel.template && m.tpl === sel.template) || (sel.tag && (def?.tags ?? []).includes(sel.tag))
    );
    if (match && (count === undefined || removed < count)) { removed++; continue; }
    keep.push(m);
  }
  if (removed) { e.s.mods = keep; e.touch(); }
  return removed;
}

export function removeModsOfOwner(e: Engine, owner: Ref): void {
  const before = e.s.mods.length;
  e.s.mods = e.s.mods.filter((m) => m.owner !== owner);
  if (e.s.mods.length !== before) e.touch();
}

/** Снять модификаторы `while`, чьё условие стало ложным. */
export function purgeWhile(e: Engine): void {
  const dead = e.s.mods.filter((m) => m.kind === "while" && !evalCond(e, m.cond, { self: m.owner, data: m.data }));
  if (dead.length) {
    e.s.mods = e.s.mods.filter((m) => !dead.includes(m));
    e.touch();
  }
}

/** Видимость модификатора для игрока. */
export function modVisible(e: Engine, m: ActiveMod): boolean {
  const v = m.def.visible;
  if (v === undefined || v === null) return true;
  return evalCond(e, v, { self: m.owner, data: m.data });
}

/** Делает ли модификатор величину больше. */
function increases(e: Engine, m: ActiveMod): boolean | null {
  const def = m.def;
  if (def.flag || !def.var) return null;
  const mag = modMagnitude(e, m);
  const op = def.op ?? "add";
  let up: boolean;
  if (op === "add") up = mag > 0;
  else if (op === "pct") up = mag > 0;
  else up = mag > 1;
  if (op === "add" && mag === 0) return null;
  if (op === "pct" && mag === 0) return null;
  if (op === "mult" && mag === 1) return null;
  if ((def.applies_to ?? "value") === "change" && def.direction === "loss" && op !== "add") up = !up;
  return up;
}

export function isNegative(e: Engine, m: ActiveMod): boolean {
  if (m.def.incapacitates) return true;
  const inc = increases(e, m);
  if (inc === null) return false;
  const good = e.idx.vars.get(m.def.var!)?.good ?? "up";
  return good === "up" ? !inc : inc;
}

function signed(n: number): string {
  const s = fmtNum(Math.abs(n));
  return n < 0 ? `−${s}` : `+${s}`;
}

/** Строка чисел для EffectView (без слов движка: имя переменной из пака + знаки). */
export function modNumbers(e: Engine, m: ActiveMod): string | null {
  const def = m.def;
  if (def.show_numbers === false) return null;
  if (def.flag || !def.var) return null;
  const vname = e.idx.vars.get(def.var)?.name ?? def.var;
  const mag = modMagnitude(e, m);
  const op = def.op ?? "add";
  let num: string;
  if (op === "add") num = signed(mag);
  else if (op === "pct") num = `${signed(mag)}%`;
  else num = `×${fmtNum(mag)}`;
  if ((def.applies_to ?? "value") === "change") {
    const arrow = def.direction === "gain" ? "▲" : def.direction === "loss" ? "▼" : "▲▼";
    return `${vname} ${arrow} ${num}`;
  }
  return `${vname} ${num}`;
}

export function effectView(e: Engine, m: ActiveMod): EffectView {
  const text = m.def.text ? e.fill(m.def.text, m.data) : "";
  return {
    id: m.uid,
    name: m.def.name,
    text,
    numbers: modNumbers(e, m),
    days_left: m.stored && m.stored.kind === "days" ? m.stored.days : null,
    negative: isNegative(e, m),
  };
}

export function visibleEffects(e: Engine, ref: Ref): EffectView[] {
  return activeMods(e, ref).filter((m) => modVisible(e, m)).map((m) => effectView(e, m));
}

export function countMods(e: Engine, ref: Ref, sel: { template?: string; tag?: string }): number {
  let n = 0;
  for (const m of activeMods(e, ref)) {
    if (sel.template && m.def.id === sel.template) n++;
    else if (sel.tag && (m.def.tags ?? []).includes(sel.tag)) n++;
  }
  return n;
}

export { ladderStepIndex };
