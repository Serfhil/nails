// Сигналы и события (core.md 3.9, 3.11): очередь, пулы, повторяемость, участник, события по условию,
// а также слежение за переходами (лестницы, недееспособность, видимость).

import type { Engine } from "./engine.ts";
import type { EventDef } from "./types.ts";
import type { Ref } from "./state.ts";
import { charRef, refId } from "./state.ts";
import { evalAll, evalCond } from "./conditions.ts";
import { applyEffects } from "./effects.ts";
import { allRefs, purgeWhile } from "./modifiers.ts";
import { isIncap, isIncapPermanent, ladderStepIndex, type Ctx } from "./vars.ts";
import { membersAmong } from "./workforce.ts";
import { actionOpen } from "./actions.ts";

export type Job =
  | { kind: "signal"; signal: string; data: Record<string, any>; depth: number }
  | { kind: "event"; id: string; data: Record<string, any>; participant: Ref | null; depth: number };

const queues = new WeakMap<Engine, { q: Job[]; depth: number }>();

function Q(e: Engine) {
  let x = queues.get(e);
  if (!x) { x = { q: [], depth: 0 }; queues.set(e, x); }
  return x;
}

export function emit(e: Engine, signal: string, data: Record<string, any> = {}): void {
  const q = Q(e);
  q.q.push({ kind: "signal", signal, data, depth: q.depth + 1 });
}

export function queueEvent(e: Engine, id: string, data: Record<string, any>, participant: Ref | null): void {
  const q = Q(e);
  q.q.push({ kind: "event", id, data, participant, depth: q.depth + 1 });
}

export function queueEmpty(e: Engine): boolean {
  return Q(e).q.length === 0;
}

function repeatOk(e: Engine, ev: EventDef): boolean {
  const r = ev.repeat;
  if (!r) return true;
  const n = e.s.eventCounts[ev.id] ?? 0;
  if (typeof r.max === "number" && n >= r.max) return false;
  if (typeof r.cooldown_days === "number" && r.cooldown_days > 0) {
    const last = e.s.eventLastDay[ev.id];
    if (last !== undefined && e.s.day - last < r.cooldown_days) return false;
  }
  return true;
}

/** Участник события. undefined — подходящего нет (событие не срабатывает). */
function pickParticipant(e: Engine, ev: EventDef, data: Record<string, any>, given: Ref | null): Ref | null | undefined {
  if (given) return given;
  const p = ev.participant;
  if (!p) return null;
  if (p.from === "signal") {
    for (const k of ["owner", "actor", "character"]) {
      const id = data[k];
      if (typeof id === "string" && e.char(id)) {
        const ref = charRef(id);
        if (evalCond(e, p.where ?? null, { self: ref, participant: ref, data })) return ref;
        return undefined;
      }
    }
    return undefined;
  }
  if (p.pick === "random" || p.among) {
    const cands = membersAmong(e, p.among ?? "characters")
      .map((c) => charRef(c.id))
      .filter((ref) => evalCond(e, p.where ?? null, { self: ref, participant: ref, data }));
    if (!cands.length) return undefined;
    return cands[Math.floor(e.rand() * cands.length)];
  }
  return null;
}

function eventCtx(ev: EventDef, data: Record<string, any>, participant: Ref | null): Ctx {
  return {
    data: { ...(ev.data_defaults ?? {}), ...data },
    participant,
    self: participant,
    event: ev.id,
    source: `event:${ev.id}`,
  };
}

function fire(e: Engine, ev: EventDef, data: Record<string, any>, participant: Ref | null): void {
  e.s.eventCounts[ev.id] = (e.s.eventCounts[ev.id] ?? 0) + 1;
  e.s.eventLastDay[ev.id] = e.s.day;
  if (e.s.fired[ev.id] === undefined) e.s.fired[ev.id] = e.s.day;
  const ctx = eventCtx(ev, data, participant);
  if (ev.stops_time && !e.stopReq) {
    const n = (ev.effects ?? []).find((x) => x.type === "notify");
    e.stopReq = { reason: "event", text: n ? e.fill(String(n.text ?? ""), textVars(e, ctx)) : ev.id };
  }
  applyEffects(e, ev.effects ?? [], ctx);
}

/** Переменные для подстановки в тексты: имена участников и данные. */
export function textVars(e: Engine, ctx: Ctx): Record<string, unknown> {
  const v: Record<string, unknown> = { ...(ctx.data ?? {}) };
  for (const k of ["participant", "actor", "partner", "candidate"] as const) {
    const r = ctx[k];
    if (r) v[k] = e.nameOf(r);
  }
  return v;
}

function processSignal(e: Engine, signal: string, data: Record<string, any>): void {
  const list = e.idx.bySignal.get(signal) ?? [];
  const pools = new Map<string, EventDef[]>();
  for (const ev of list) {
    if (e.s.ending) return;
    const pool = ev.trigger?.pool;
    if (pool) {
      if (!pools.has(pool)) pools.set(pool, []);
      pools.get(pool)!.push(ev);
      continue;
    }
    if (!repeatOk(e, ev)) continue;
    const part = pickParticipant(e, ev, data, null);
    if (part === undefined) continue;
    if (!evalAll(e, ev.trigger?.conditions, eventCtx(ev, data, part))) continue;
    fire(e, ev, data, part);
  }
  for (const [pool, evs] of pools) {
    if (e.s.ending) return;
    const chance = e.settings.pools?.[pool]?.chance ?? 1;
    if (!(e.rand() < chance)) continue;
    const eligible: { ev: EventDef; part: Ref | null; w: number }[] = [];
    for (const ev of evs) {
      if (!repeatOk(e, ev)) continue;
      const part = pickParticipant(e, ev, data, null);
      if (part === undefined) continue;
      if (!evalAll(e, ev.trigger?.conditions, eventCtx(ev, data, part))) continue;
      const w = typeof ev.weight === "number" ? ev.weight : 1;
      if (w > 0) eligible.push({ ev, part, w });
    }
    if (!eligible.length) continue;
    const total = eligible.reduce((s, x) => s + x.w, 0);
    let r = e.rand() * total;
    let chosen = eligible[eligible.length - 1];
    for (const x of eligible) { if (r < x.w) { chosen = x; break; } r -= x.w; }
    fire(e, chosen.ev, data, chosen.part);
  }
}

function processEvent(e: Engine, id: string, data: Record<string, any>, participant: Ref | null): void {
  const ev = e.idx.events.get(id);
  if (!ev) { e.error(`run_event: нет события ${id}`); return; }
  if (!repeatOk(e, ev)) return;
  const part = pickParticipant(e, ev, data, participant);
  if (part === undefined) return;
  fire(e, ev, data, part);
}

/** Обработать очередь сигналов и событий. */
export function drain(e: Engine): void {
  const q = Q(e);
  const saved = q.depth;
  let guard = 0;
  while (q.q.length) {
    const job = q.q.shift()!;
    if (e.s.ending) { q.q.length = 0; break; }
    if (job.depth > e.idx.maxChain) {
      e.error(`переполнение цепочки событий (глубина ${job.depth} > ${e.idx.maxChain}): ${job.kind === "signal" ? `сигнал ${job.signal}` : `событие ${job.id}`}`);
      continue;
    }
    if (++guard > 100000) { e.error("слишком много событий за одну проверку"); q.q.length = 0; break; }
    q.depth = job.depth;
    try {
      if (job.kind === "signal") processSignal(e, job.signal, job.data);
      else processEvent(e, job.id, job.data, job.participant);
    } finally {
      q.depth = saved;
    }
  }
}

// ---------- переходы ----------

function checkLadders(e: Engine): void {
  for (const ref of allRefs(e)) {
    const type = ref === "world" ? "world" : ref.startsWith("char:") ? "character" : ref.startsWith("ws:") ? "workshop" : "item";
    for (const v of e.idx.laddered[type] ?? []) {
      const key = `${ref}|${v.id}`;
      const lvl = ladderStepIndex(e, ref, v.id);
      if (lvl === null) continue;
      const prev = e.s.ladderPrev[key];
      e.s.ladderPrev[key] = lvl;
      if (prev === undefined || prev === lvl) continue;
      const steps = v.ladder!;
      if (lvl > prev) {
        for (let l = prev + 1; l <= lvl; l++) emit(e, "ladder_step", { var: v.id, owner: refId(ref), step: steps[l].id, level: l, dir: "up" });
      } else {
        for (let l = prev - 1; l >= lvl; l--) emit(e, "ladder_step", { var: v.id, owner: refId(ref), step: steps[l].id, level: l, dir: "down" });
      }
    }
  }
  // забыть ключи исчезнувших сущностей
  for (const k of Object.keys(e.s.ladderPrev)) {
    const ref = k.slice(0, k.indexOf("|"));
    if (!e.exists(ref)) delete e.s.ladderPrev[k];
  }
}

function checkIncap(e: Engine): void {
  for (const c of e.s.chars) {
    const ref = charRef(c.id);
    const now = isIncap(e, ref);
    const prev = e.s.incapPrev[c.id] ?? false;
    e.s.incapPrev[c.id] = now;
    if (now && !prev) emit(e, "incapacitated", { owner: c.id, permanent: isIncapPermanent(e, ref) });
  }
  for (const id of Object.keys(e.s.incapPrev)) if (!e.char(id)) delete e.s.incapPrev[id];
}

/** Ключи видимого игроку с условной видимостью: kind, id, owner. */
export function visibleKeys(e: Engine): Map<string, { kind: string; id: string; owner: string | null }> {
  const out = new Map<string, { kind: string; id: string; owner: string | null }>();
  for (const a of e.idx.actions.values()) {
    if (a.open_when === undefined || a.open_when === null) continue;
    if (actionOpen(e, a)) out.set(`action:${a.id}`, { kind: "action", id: a.id, owner: null });
  }
  for (const ref of allRefs(e)) {
    const type = ref === "world" ? "world" : ref.startsWith("char:") ? "character" : ref.startsWith("ws:") ? "workshop" : "item";
    for (const v of e.idx.varsByOwner[type] ?? []) {
      if (v.visible === undefined || v.visible === null) continue;
      if (evalCond(e, v.visible, { self: ref })) out.set(`var:${ref}:${v.id}`, { kind: "variable", id: v.id, owner: refId(ref) });
    }
  }
  for (const g of e.idx.goods.values()) {
    if (g.visible === undefined || g.visible === null) continue;
    if (evalCond(e, g.visible, { self: e.heroRef })) out.set(`good:${g.id}`, { kind: "good", id: g.id, owner: null });
  }
  for (const id of [...e.s.chars.map((c) => c.id), ...e.s.pool]) {
    const d = e.idx.chars.get(e.char(id)?.tpl ?? id);
    if (!d || d.visible === undefined || d.visible === null) continue;
    if (evalCond(e, d.visible, { self: charRef(id) })) out.set(`char:${id}`, { kind: "character", id, owner: null });
  }
  for (const it of e.settings.shop ?? []) {
    const d = e.idx.items.get(it);
    if (!d || d.open_when === undefined || d.open_when === null) continue;
    if (evalCond(e, d.open_when, { self: e.heroRef, actor: e.heroRef })) out.set(`item:${it}`, { kind: "item", id: it, owner: null });
  }
  return out;
}

export function checkVisibility(e: Engine, silent = false): void {
  const now = visibleKeys(e);
  for (const [key, info] of now) {
    if (!e.s.visPrev[key]) {
      if (e.s.opened[key] === undefined) e.s.opened[key] = e.s.day;
      if (!silent) emit(e, "became_visible", { kind: info.kind, id: info.id, owner: info.owner });
    }
  }
  const next: Record<string, boolean> = {};
  for (const key of now.keys()) next[key] = true;
  e.s.visPrev = next;
}

function checkCondEvents(e: Engine): void {
  for (const ev of e.idx.condEvents) {
    const now = evalAll(e, ev.trigger?.conditions, { data: { ...(ev.data_defaults ?? {}) }, event: ev.id });
    const prev = e.s.condPrev[ev.id] ?? false;
    e.s.condPrev[ev.id] = now;
    if (now && !prev && repeatOk(e, ev)) queueEvent(e, ev.id, {}, null);
  }
}

/** Проверки после часа, команды и утром: переходы, события по условию, очередь — до затишья. */
export function settle(e: Engine): void {
  for (let i = 0; i < 64; i++) {
    drain(e);
    if (e.s.ending) return;
    purgeWhile(e);
    checkLadders(e);
    checkIncap(e);
    checkVisibility(e);
    checkCondEvents(e);
    if (queueEmpty(e)) return;
  }
  drain(e);
}

export function resetQueue(e: Engine): void {
  const q = Q(e);
  q.q.length = 0;
  q.depth = 0;
}
