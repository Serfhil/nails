// Сериализуемое состояние игры (core.md 7). Всё, что здесь, попадает в save().

import type { Assignment, CondNode, CostLineDef, Line, SummaryView } from "./types.ts";
import type { RngState } from "./rng.ts";

export const SAVE_VERSION = 1;

/** Ссылка на сущность: "world", "char:<id>", "ws:<id>", "item:<id>". */
export type Ref = string;

export const WORLD: Ref = "world";
export const charRef = (id: string): Ref => `char:${id}`;
export const wsRef = (id: string): Ref => `ws:${id}`;
export const itemRef = (id: string): Ref => `item:${id}`;

export function refKind(ref: Ref): "world" | "character" | "workshop" | "item" {
  if (ref === WORLD) return "world";
  if (ref.startsWith("char:")) return "character";
  if (ref.startsWith("ws:")) return "workshop";
  return "item";
}
export function refId(ref: Ref): string {
  if (ref === WORLD) return "world";
  return ref.slice(ref.indexOf(":") + 1);
}

export type CharKind = "hero" | "worker" | "family" | "other";

export interface CharState {
  id: string;
  tpl: string;
  kind: CharKind;
  vars: Record<string, number>;
  workshop: string | null;
  slots: Record<string, string | null>;
  slotOrder: string[];
  assignment: Assignment;
  /** доля текущей партии (0..1) */
  progress: number;
  /** партия начата (расход списан) */
  batch: boolean;
  /** рабочих часов торговли с прошлой сделки */
  tradeProgress: number;
}

export interface WorkshopState {
  id: string;
  type: string;
  vars: Record<string, number>;
}

export type ItemLoc =
  | { kind: "inventory" }
  | { kind: "char"; char: string; slot: string }
  | { kind: "workshop"; ws: string };

export interface ItemState {
  id: string;
  type: string;
  vars: Record<string, number>;
  loc: ItemLoc;
}

export interface ModState {
  uid: number;
  tpl: string;
  owner: Ref;
  kind: "days" | "forever" | "while";
  days: number | null;
  cond: CondNode;
  data: Record<string, any>;
}

export interface OfferState {
  id: string;
  /** null — окно эффекта notify с popup */
  tpl: string | null;
  delivery: "now" | "board";
  participant: Ref | null;
  data: Record<string, any>;
  days_left: number | null;
  popup?: { text: string };
}

export interface ObligationState {
  id: string;
  tpl: string;
  offer: string;
  option: string;
  title: string;
  requires: CostLineDef[];
  deadline: number | null;
  created_day: number;
  state: "active" | "done" | "failed" | "declined";
  data: Record<string, any>;
  participant: Ref | null;
}

export interface LedgerEntry {
  source: string;
  amount: number;
}

export interface State {
  save_version: number;
  pack_id: string;
  pack_version: string;
  day: number;
  hour: number;
  rng: RngState;
  seq: number;
  world: Record<string, number>;
  chars: CharState[];
  workshops: WorkshopState[];
  items: ItemState[];
  mods: ModState[];
  stock: Record<string, number>;
  sellFlags: Record<string, boolean>;
  seenGoods: string[];
  pool: string[];
  nowQueue: OfferState[];
  board: OfferState[];
  obligations: ObligationState[];
  eventCounts: Record<string, number>;
  eventLastDay: Record<string, number>;
  condPrev: Record<string, boolean>;
  visPrev: Record<string, boolean>;
  ladderPrev: Record<string, number>;
  incapPrev: Record<string, boolean>;
  opened: Record<string, number>;
  fired: Record<string, number>;
  endings: { title: string; tag: string | null; day: number }[];
  summary: SummaryView | null;
  notifications: Line[];
  ledger: LedgerEntry[];
  moneyMorning: number;
  yesterday: { income: number; expense: number };
  ending: null | { title: string; text: string; tag: "goal" | "fail" | null };
  errors: string[];
}
