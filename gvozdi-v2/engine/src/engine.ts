// Ядро состояния: пак, состояние, кэши, буфер строк команды, общие помощники.

import type { PackIndex } from "./pack.ts";
import type { CharState, ItemState, Ref, State, WorkshopState } from "./state.ts";
import { WORLD, charRef, refId, refKind } from "./state.ts";
import type { Line, LineKind } from "./types.ts";
import { rngNext } from "./rng.ts";

export interface StopRequest {
  reason: string;
  text: string;
}

export class Engine {
  idx: PackIndex;
  s: State;

  // --- переходное (не сохраняется) ---
  /** строки текущей команды (Result.events) */
  lines: Line[] = [];
  /** запрос остановки work_until_stop от события с stops_time */
  stopReq: StopRequest | null = null;
  /** персонажи, занятые разовым действием в текущий час */
  busy = new Set<string>();
  /** теги разового действия, которое сейчас выполняет персонаж */
  onceTags = new Map<Ref, string[]>();
  /** персонажи, уже давшие сигнал idle_no_cost в этой команде */
  idleSignaled = new Set<string>();
  /** строки, собранные за утро (для summary.morning) */
  morningLines: Line[] | null = null;

  // --- кэши, сбрасываются при любой мутации ---
  version = 0;
  cache = new Map<string, any>();
  computing = new Set<string>();

  constructor(idx: PackIndex, s: State) {
    this.idx = idx;
    this.s = s;
  }

  touch(): void {
    this.version++;
    if (this.cache.size) this.cache.clear();
  }

  rand(): number {
    return rngNext(this.s.rng);
  }

  newId(prefix: string): string {
    this.s.seq++;
    return `${prefix}${this.s.seq}`;
  }

  /** не записывать ошибки (при сборке вида, чтобы вид не менял состояние) */
  quiet = false;

  error(msg: string): void {
    if (this.quiet) return;
    const m = `день ${this.s.day} ${this.s.hour}:00 — ${msg}`;
    if (this.s.errors.length < 500) this.s.errors.push(m);
  }

  // --- тексты ---
  fill(template: string, vars: Record<string, unknown>): string {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (all, name: string) => {
      if (name in vars && vars[name] !== undefined && vars[name] !== null) return fmtValue(vars[name]);
      this.error(`нет данных для подстановки {${name}} в тексте «${template}»`);
      return all;
    });
  }

  text(key: string, vars: Record<string, unknown> = {}): string {
    const t = this.idx.texts[key];
    if (typeof t !== "string") return key;
    return this.fill(t, vars);
  }

  pushLine(text: string, kind: LineKind = "info"): Line {
    const l = { text, kind };
    this.lines.push(l);
    return l;
  }

  notify(text: string, kind: LineKind = "info"): void {
    const l = this.pushLine(text, kind);
    this.s.notifications.push(l);
    if (this.morningLines) this.morningLines.push(l);
  }

  // --- сущности ---
  get heroId(): string {
    return this.s.chars.find((c) => c.kind === "hero")?.id ?? this.idx.raw.pack.start.hero;
  }
  get heroRef(): Ref {
    return charRef(this.heroId);
  }
  char(id: string): CharState | undefined {
    return this.s.chars.find((c) => c.id === id);
  }
  charOf(ref: Ref | null | undefined): CharState | undefined {
    if (!ref || refKind(ref) !== "character") return undefined;
    return this.char(refId(ref));
  }
  ws(id: string): WorkshopState | undefined {
    return this.s.workshops.find((w) => w.id === id);
  }
  item(id: string): ItemState | undefined {
    return this.s.items.find((i) => i.id === id);
  }
  exists(ref: Ref): boolean {
    const k = refKind(ref);
    if (k === "world") return true;
    if (k === "character") return !!this.char(refId(ref)) || this.s.pool.includes(refId(ref));
    if (k === "workshop") return !!this.ws(refId(ref));
    return !!this.item(refId(ref));
  }
  /** тип сущности (шаблон) */
  typeOf(ref: Ref): string | null {
    const k = refKind(ref);
    if (k === "character") return this.charOf(ref)?.tpl ?? null;
    if (k === "workshop") return this.ws(refId(ref))?.type ?? null;
    if (k === "item") return this.item(refId(ref))?.type ?? null;
    return null;
  }
  nameOf(ref: Ref | null | undefined): string {
    if (!ref) return "";
    const k = refKind(ref);
    if (k === "character") {
      const c = this.charOf(ref);
      return this.idx.chars.get(c?.tpl ?? refId(ref))?.name ?? refId(ref);
    }
    if (k === "workshop") return this.idx.workshops.get(this.ws(refId(ref))?.type ?? "")?.name ?? refId(ref);
    if (k === "item") return this.idx.items.get(this.item(refId(ref))?.type ?? "")?.name ?? refId(ref);
    return this.idx.raw.pack.name;
  }
  /** мастерская сущности: своя приписка; у героя и неприписанных — первая мастерская */
  workshopOf(ref: Ref | null | undefined): Ref | null {
    if (!ref) ref = this.heroRef;
    const k = refKind(ref);
    if (k === "workshop") return this.exists(ref) ? ref : null;
    if (k === "item") {
      const it = this.item(refId(ref));
      if (!it) return null;
      if (it.loc.kind === "workshop") return `ws:${it.loc.ws}`;
      if (it.loc.kind === "char") return this.workshopOf(charRef(it.loc.char));
      return this.workshopOf(this.heroRef);
    }
    if (k === "character") {
      const c = this.charOf(ref);
      if (c?.workshop && this.ws(c.workshop)) return `ws:${c.workshop}`;
    }
    const first = this.s.workshops[0];
    return first ? `ws:${first.id}` : null;
  }
  get settings() {
    return this.idx.raw.pack.settings;
  }
  get isNight(): boolean {
    return this.s.hour >= this.settings.day_end;
  }
}

export const WORLD_REF = WORLD;

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function fmtValue(v: unknown): string {
  if (typeof v === "number") return fmtNum(v);
  return String(v);
}

export function cmp(a: any, op: string, b: any): boolean {
  switch (op) {
    case "==": return a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);
    case "!=": return !(a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9));
    case ">=": return a >= b - 1e-9;
    case ">": return a > b + 1e-9;
    case "<=": return a <= b + 1e-9;
    case "<": return a < b - 1e-9;
    default: return false;
  }
}

/**
 * Нормализация числа: убирает шум плавающей точки (74.00000000000003 → 74).
 * 9 знаков после запятой (для |x| ≥ 1e6 — 3), −0 → 0. Применяется к сырым и итоговым значениям,
 * изменениям, деньгам, ценам и ко всем числам вида — везде одинаково.
 */
export function norm(x: number): number {
  if (!Number.isFinite(x)) return x;
  const k = Math.abs(x) < 1e6 ? 1e9 : 1e3;
  const r = Math.round(x * k) / k;
  return Object.is(r, -0) ? 0 : r;
}
