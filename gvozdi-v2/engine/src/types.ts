// Типы контракта (core.md 4 и 5). Пак описывается данными; здесь — только формы.

// ---------- Пак (core.md 4) ----------

export type DataRef = { $data: string };
export type Num = number | DataRef;

export type CondNode =
  | null
  | boolean
  | { all: CondNode[]; text?: string }
  | { any: CondNode[]; text?: string }
  | { not: CondNode; text?: string }
  | ({ type: string; text?: string } & Record<string, any>);

export interface PackMeta {
  id: string;
  name: string;
  version: string;
  /** необязательное описание пака для игрока (core.md 4.2); null или отсутствие — валидно */
  description?: string | null;
  names?: {
    money?: string;
    money_short?: string;
    stress?: string;
    /** название слота персонажа для игрока (core.md 4.2) */
    slots?: Record<string, string>;
    /** подписи ролей: hero, worker, family, pet */
    roles?: Record<string, string>;
  };
  settings: {
    day_start: number;
    day_end: number;
    market_hours?: number;
    trade_hours?: number;
    trader_raw_target?: Record<string, number>;
    trade_open_when?: CondNode;
    shop?: string[];
    pools?: Record<string, { chance: number }>;
    max_event_chain?: number;
  };
  start: { event: string; hero: string };
}

export interface LadderStep {
  at: number;
  id: string;
  name: string;
  modifiers?: string[];
}

export interface VariableDef {
  id: string;
  name: string;
  owner: "character" | "workshop" | "item" | "world";
  start: number;
  min: number;
  max?: number | null;
  format?: "number" | "pct" | "money";
  floor_pct?: number | null;
  good?: "up" | "down";
  ladder?: LadderStep[];
  visible?: CondNode;
}

export type Duration =
  | { kind: "days"; n: Num }
  | { kind: "forever" }
  | { kind: "while"; condition: CondNode }
  | { kind: "source" };

export interface ModifierDef {
  id: string;
  name: string;
  text?: string;
  var?: string;
  target?: "owner" | "hero" | "world";
  applies_to?: "value" | "change";
  direction?: "gain" | "loss" | "any";
  op?: "add" | "pct" | "mult";
  value?: Num;
  value_from?: { var: string; subject?: string; baseline?: number; per_point?: number };
  action_tags?: string[];
  duration?: Duration;
  flag?: boolean;
  incapacitates?: boolean;
  may_be_permanent?: boolean;
  stack?: boolean;
  on_expire?: EffectDef[];
  visible?: CondNode;
  show_numbers?: boolean;
  tags?: string[];
  data_defaults?: Record<string, any>;
}

export interface GoodDef {
  id: string;
  name: string;
  unit?: string;
  price: number;
  buy?: boolean;
  sell_default?: boolean;
  visible?: CondNode;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "tool" | "equipment";
  slot?: string;
  /** линейка оборудования (core.md 4.6) */
  line?: string;
  /** уровень внутри линейки, целое ≥ 1 */
  grade?: number;
  price?: number;
  modifiers?: string[];
  vars?: Record<string, number>;
  open_when?: CondNode;
  description?: string;
  visible?: CondNode;
}

export interface WorkshopDef {
  id: string;
  name: string;
  vars?: Record<string, number>;
  modifiers?: string[];
  visible?: CondNode;
}

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  /** подпись персонажа вместо names.roles */
  role_name?: string | null;
  works?: boolean;
  hire_pool?: boolean;
  vars?: Record<string, number>;
  slots?: string[];
  modifiers?: string[];
  blurb?: string | null;
  visible?: CondNode;
}

export type CostLineDef =
  | { var: string; qty: Num; from?: undefined }
  | { good: string; qty: Num }
  | { var: string; from: string; qty_from: string };

export interface RoleDef {
  who: "hero" | "worker" | "hero_or_worker" | "any" | "pool";
  where?: CondNode;
}

export interface ActionDef {
  id: string;
  name: string;
  mode: "once" | "assignable" | "both";
  hours: number;
  speed_scaled?: boolean;
  roles: { actor: RoleDef; partner?: RoleDef | null; candidate?: RoleDef | null };
  open_when?: CondNode;
  enabled_when?: CondNode;
  disabled_text?: string | null;
  cost?: CostLineDef[];
  outputs?: { good: string; qty: Num }[];
  per_hour?: { target: string; var: string; add: Num; scale_by?: string }[];
  effects?: EffectDef[];
  tags?: string[];
  text?: string | null;
  description?: string | null;
  category?: string | null;
  visible?: CondNode;
}

export interface CategoryDef {
  id: string;
  name: string;
  view?: "list" | "select";
}

export interface EventDef {
  id: string;
  trigger?: { signal?: string; pool?: string; conditions?: CondNode[] } | null;
  weight?: number;
  participant?: { pick?: "random"; among?: "workers" | "characters" | "family"; where?: CondNode; from?: "signal" } | null;
  repeat?: { max?: number | null; cooldown_days?: number | null } | null;
  stops_time?: boolean;
  tags?: string[];
  effects?: EffectDef[];
  data_defaults?: Record<string, any>;
}

export interface ObligationDef {
  id: string;
  title: string;
  requires: CostLineDef[];
  deadline_days?: Num | null;
  on_done?: EffectDef[];
  on_fail?: EffectDef[];
  on_decline?: EffectDef[];
  data?: Record<string, any>;
}

export interface OptionDef {
  id: string;
  label: string;
  open_when?: CondNode;
  enabled_when?: CondNode;
  disabled_text?: string | null;
  cost?: CostLineDef[];
  effects?: EffectDef[];
  obligation?: ObligationDef | null;
}

export interface OfferDef {
  id: string;
  delivery: "now" | "board";
  board_days?: number;
  title: string;
  text: string;
  data?: Record<string, any>;
  options: OptionDef[];
  visible?: CondNode;
  data_defaults?: Record<string, any>;
}

export type EffectDef = { type: string } & Record<string, any>;

export interface Pack {
  pack: PackMeta;
  variables: VariableDef[];
  modifiers: ModifierDef[];
  goods: GoodDef[];
  items: ItemDef[];
  workshops: WorkshopDef[];
  characters: CharacterDef[];
  actions: ActionDef[];
  categories?: CategoryDef[];
  events: EventDef[];
  offers: OfferDef[];
  texts: Record<string, string>;
  strategy_hints?: unknown;
}

// ---------- Интерфейс (core.md 5) ----------

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

export type LineKind = "info" | "good" | "warn" | "danger" | "seal";
export interface Line {
  text: string;
  kind: LineKind;
}

export interface Result {
  ok: boolean;
  error?: { code: ErrorCode; text: string };
  events: Line[];
  stop?: { reason: string; text: string };
  view: View;
}

export interface CostLine {
  name: string;
  need: number;
  have: number;
}

export interface EffectView {
  id: string;
  name: string;
  text: string;
  numbers: string | null;
  days_left: number | null;
  negative: boolean;
}

export interface VarView {
  id: string;
  name: string;
  value: number;
  /** готовая строка по format (core.md 4.3) */
  display: string;
  format: string;
  level: number | null;
  step: string | null;
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
  assignable: { assignment: object; label: string; enabled: boolean; reason: string | null }[];
  effects: EffectView[];
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

export interface OfferView {
  id: string;
  title: string;
  text: string;
  days_left: number | null;
  options: { id: string; label: string; enabled: boolean; reason: string | null; cost: CostLine[] }[];
}

export interface ObligationView {
  id: string;
  title: string;
  days_left: number | null;
  requires: CostLine[];
  can_deliver: boolean;
}

export interface MoneyLineView {
  source: string;
  label: string;
  amount: number;
}

export interface SummaryView {
  title: string;
  money_morning: number;
  delta: number;
  income: MoneyLineView[];
  expense: MoneyLineView[];
  morning: Line[];
}

export interface CategoryView { id: string; name: string; view: "list" | "select" }

export interface View {
  meta: {
    day: number; hour: number; day_start: number; day_end: number; is_night: boolean;
    /** pack.json name */
    game_title: string;
    pack_id: string;
    pack_version: string;
    pack_description: string | null;
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
  inventory: { item: string; type: string; name: string; effects: EffectView[] }[];
  market: {
    enabled: boolean;
    disabled_reason: string | null;
    hours: number;
    raw: { id: string; name: string; unit_price: number }[];
    shop: { item_type: string; name: string; price: number; enabled: boolean; disabled_reason: string | null }[];
  };
  board: OfferView[];
  obligations: ObligationView[];
  effects: EffectView[];
  ending: null | { title: string; text: string; tag: "goal" | "fail" | null };
}

// ---------- Отладочный вид (core.md 6) ----------

export interface CondTrace {
  node: string;
  result: boolean;
  text?: string;
  children?: CondTrace[];
}

export interface DebugModifier {
  uid: string;
  template: string;
  owner: string;
  stored: boolean;
  source: string | null;
  days_left: number | null;
  duration: string;
  data: Record<string, unknown>;
  visible: boolean;
}

export interface DebugEntity {
  ref: string;
  id: string;
  kind: "world" | "character" | "workshop" | "item";
  type: string | null;
  vars: { id: string; raw: number; value: number; level: number | null; step: string | null }[];
  modifiers: DebugModifier[];
  extra: Record<string, unknown>;
}

export interface DebugView {
  time: { day: number; hour: number };
  ending: View["ending"];
  entities: DebugEntity[];
  hire_pool: string[];
  stock: Record<string, { qty: number; sell_flag: boolean }>;
  calc: Record<string, number | null>;
  actions: {
    id: string;
    open: boolean;
    open_trace: CondTrace | null;
    enabled_trace: CondTrace | null;
    available: boolean;
    reason: string | null;
  }[];
  offers: { id: string; template: string; delivery: string; participant: string | null; data: Record<string, unknown>; days_left: number | null;
    options: { id: string; open: boolean; open_trace: CondTrace | null; enabled_trace: CondTrace | null; enabled: boolean; reason: string | null }[] }[];
  obligations: { id: string; template: string; state: string; created_day: number; deadline_day: number | null; data: Record<string, unknown> }[];
  event_counts: Record<string, number>;
  event_last_day: Record<string, number>;
  opened: Record<string, number>;
  fired: Record<string, number>;
  endings_fired: { title: string; tag: string | null; day: number }[];
  errors: string[];
  rng_state: number[];
}

export interface Game {
  view(): View;
  debugView(): DebugView;
  perform(cmd: Command): Result;
  save(): string;
}
