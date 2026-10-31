// Копия контракта интерфейса (core.md 5, версия 2.1) — то, на что опирается интерфейс.
// Дословно по core.md 5.1–5.3. Интерфейс не читает внутренности движка.

export type Pack = Record<string, unknown> & { pack: { id: string } & Record<string, unknown> };

export interface Game {
  view(): View;
  debugView(): unknown;
  perform(cmd: Command): Result;
  save(): string;
}

export interface GameApi {
  createGame(pack: Pack, seed: number): Game;
  loadGame(pack: Pack, save: string): Game;
}

export type Assignment = { kind: "idle" } | { kind: "action"; action: string } | { kind: "trade" };

export type Command =
  | { type: "work_until_stop" }
  | { type: "sleep" }
  | { type: "do_action"; action: string; actor: string; partner?: string; candidate?: string; replace?: string }
  | { type: "set_assignment"; character: string; assignment: Assignment }
  | { type: "market_trip"; buy_raw: Record<string, number>; buy_items: string[] }
  | { type: "set_sell_flag"; good: string; on: boolean }
  | { type: "choose_option"; offer: string; option: string }
  | { type: "deliver"; obligation: string }
  | { type: "decline"; obligation: string }
  | { type: "equip"; character: string; item: string }
  | { type: "unequip"; character: string; item: string }
  | { type: "assign_workshop"; character: string; workshop: string };

export type ErrorCode =
  | "not_available"
  | "requirement_unmet"
  | "no_time"
  | "insufficient"
  | "incapacitated"
  | "offer_pending"
  | "game_over"
  | "invalid";

export interface Result {
  ok: boolean;
  error?: { code: ErrorCode; text: string };
  events: Line[];
  stop?: { reason: string; text: string };
  view: View;
}

export type LineKind = "info" | "good" | "warn" | "danger" | "seal";
export interface Line {
  text: string;
  kind: LineKind;
}

export interface MoneyLine {
  source: string;
  label: string;
  amount: number;
}

export interface SummaryView {
  title: string;
  money_morning: number;
  delta: number;
  income: MoneyLine[];
  expense: MoneyLine[];
  morning: Line[];
}

export interface RawView {
  id: string;
  name: string;
  unit_price: number;
}
export interface ShopView {
  item_type: string;
  name: string;
  price: number;
  enabled: boolean;
  disabled_reason: string | null;
}
export interface MarketView {
  enabled: boolean;
  disabled_reason: string | null;
  hours: number;
  raw: RawView[];
  shop: ShopView[];
}

export interface InventoryItemView {
  item: string;
  type: string;
  name: string;
  effects: EffectView[];
}

export interface View {
  meta: {
    day: number; hour: number; day_start: number; day_end: number; is_night: boolean; game_title: string;
    pack_id: string; pack_version: string; pack_description: string | null;
  };
  money: { name: string; short: string; value: number };
  stress: null | { name: string; value: number; max: number | null; step: string | null; warning: boolean };
  notifications: Line[];
  summary: null | SummaryView;
  pending_offer: null | OfferView;
  actions: ActionView[];
  categories: CategoryView[];
  characters: CharacterView[];
  hire_pool: CandidateView[];
  workshops: WorkshopView[];
  storage: { goods: StockLine[]; total_value: number };
  inventory: InventoryItemView[];
  market: MarketView;
  board: OfferView[];
  obligations: ObligationView[];
  effects: EffectView[];
  ending: null | { title: string; text: string; tag: "goal" | "fail" | null };
}

export interface CategoryView {
  id: string;
  name: string;
  view: "list" | "select";
}

export interface ActionView {
  id: string;
  label: string;
  description: string | null;
  category: string | null;
  hours: number;
  mode: "once" | "assignable" | "both";
  enabled: boolean;
  reason: string | null;
  cost: CostLine[];
  roles: { actor: string[]; partner: string[] | null; candidate: string[] | null };
  replace: null | { warning: string; options: { item: string; name: string }[] };
}

export interface VarView {
  id: string;
  name: string;
  value: number;
  display: string;
  format: string;
  level: number | null;
  step: string | null;
}

export interface AssignableView {
  assignment: object;
  label: string;
  enabled: boolean;
  reason: string | null;
}

export interface CharacterView {
  id: string;
  name: string;
  role: string;
  role_name: string | null;
  works: boolean;
  blurb: string | null;
  status: "ok" | "incapacitated";
  incapacitated_permanent: boolean;
  workshop: string | null;
  vars: VarView[];
  slots: { slot: string; slot_name: string; item: string | null; name: string | null }[];
  equippable: string[];
  assignment: { kind: "idle" | "action" | "trade"; label: string };
  assignable: AssignableView[];
  effects: EffectView[];
}

export interface EffectView {
  id: string;
  name: string;
  text: string;
  numbers: string | null;
  days_left: number | null;
  negative: boolean;
}

export interface CandidateView {
  id: string;
  name: string;
  role_name: string | null;
  blurb: string | null;
  vars: VarView[];
  effects: EffectView[];
}

export interface WorkshopView {
  id: string;
  type: string;
  name: string;
  vars: VarView[];
  equipment: { item: string; name: string }[];
  workers: string[];
  effects: EffectView[];
}

export interface StockLine {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unit_value: number;
  sell_flag: boolean;
}

export interface CostLine {
  name: string;
  need: number;
  have: number;
}

export interface OfferOptionView {
  id: string;
  label: string;
  enabled: boolean;
  reason: string | null;
  cost: CostLine[];
}

export interface OfferView {
  id: string;
  title: string;
  text: string;
  days_left: number | null;
  options: OfferOptionView[];
}

export interface ObligationView {
  id: string;
  title: string;
  days_left: number | null;
  requires: CostLine[];
  can_deliver: boolean;
}
