// Схема файлов пака по разделу 4 core.md: V001 (типы, обязательные поля, допустимые значения),
// W010 (неизвестное поле) и сбор ссылок для V003.
import type { Ref, RefKind } from "./types.ts";
import { CMP_OPS, Problems, didYouMean, isObj, joinPath, recId } from "./util.ts";

export class Walker {
  file = "";
  id = "";
  constructor(public p: Problems, public refs: Ref[]) {}
  v001(path: string, msg: string): void {
    this.p.err("V001", this.file, this.id, path, msg);
  }
  w010(path: string, msg: string): void {
    this.p.warn("W010", this.file, this.id, path, msg);
  }
  ref(kind: RefKind, value: string, path: string, extra?: string): void {
    this.refs.push({ kind, value, file: this.file, id: this.id, path, extra });
  }
}

export type Checker = (w: Walker, v: unknown, path: string) => void;

// ---------- константы контракта ----------
export const OWNERS = ["character", "workshop", "item", "world"];
export const SUBJECTS = ["hero", "self", "actor", "partner", "candidate", "participant", "world", "workshop"];
export const TARGETS = [...SUBJECTS, "all_workers"];
export const SIGNALS = [
  "game_start", "night", "morning", "action_done", "batch_defect", "idle_no_cost", "ladder_step",
  "modifier_expired", "became_visible", "incapacitated", "hired", "market_trip",
  "obligation_done", "obligation_failed", "obligation_declined", "offer_expired",
];
export const CALCS = ["wealth", "stock_value", "cost_hours", "income_yesterday", "expense_yesterday"];
export const ROLES = ["hero", "worker", "family", "pet"];
export const WHO = ["hero", "worker", "hero_or_worker", "any", "pool"];
export const AMONG = ["workers", "characters", "family"];
export const ID_RE = /^[a-z][a-z0-9_]*$/;

const show = (v: unknown): string => {
  if (v === undefined) return "ничего";
  const s = JSON.stringify(v);
  return s.length > 40 ? s.slice(0, 37) + "…" : s;
};

// ---------- комбинаторы ----------
export const Any: Checker = () => {};

export const S: Checker = (w, v, p) => {
  if (typeof v !== "string") w.v001(p, `ожидалась строка, получено ${show(v)}.`);
};

/** Непустая строка: пробелы не считаются содержимым. */
export const NonEmptyS: Checker = (w, v, p) => {
  if (typeof v !== "string") w.v001(p, `ожидалась непустая строка, получено ${show(v)}.`);
  else if (!v.trim()) w.v001(p, `строка не может быть пустой.`);
};

export const B: Checker = (w, v, p) => {
  if (typeof v !== "boolean") w.v001(p, `ожидалось true или false, получено ${show(v)}.`);
};

const DATA_REF: Checker = (w, v, p) => {
  if (!isObj(v) || Object.keys(v).length !== 1 || typeof v.$data !== "string" || !v.$data)
    w.v001(p, `ссылка на данные пишется как {"$data": "имя"}, получено ${show(v)}.`);
};

interface NumOpts { int?: boolean; data?: boolean; min?: number; max?: number }
export function N(o: NumOpts = {}): Checker {
  return (w, v, p) => {
    if (o.data && isObj(v) && "$data" in v) return DATA_REF(w, v, p);
    if (typeof v !== "number" || !Number.isFinite(v)) {
      w.v001(p, `ожидалось число${o.data ? ' или {"$data": "имя"}' : ""}, получено ${show(v)}.`);
      return;
    }
    if (o.int && !Number.isInteger(v)) w.v001(p, `ожидалось целое число, получено ${v}.`);
    if (o.min !== undefined && v < o.min) w.v001(p, `значение ${v} меньше допустимого ${o.min}.`);
    if (o.max !== undefined && v > o.max) w.v001(p, `значение ${v} больше допустимого ${o.max}.`);
  };
}
const Nd = N({ data: true });
const NdInt = N({ data: true, int: true });

export function E(values: readonly string[]): Checker {
  return (w, v, p) => {
    if (typeof v !== "string" || !values.includes(v))
      w.v001(p, `недопустимое значение ${show(v)}; допустимо: ${values.join(", ")}.` +
        (typeof v === "string" ? didYouMean(v, values) : ""));
  };
}

export function A(item: Checker): Checker {
  return (w, v, p) => {
    if (!Array.isArray(v)) {
      w.v001(p, `ожидался массив, получено ${show(v)}.`);
      return;
    }
    v.forEach((x, i) => item(w, x, joinPath(p, i)));
  };
}

/** Объект с известными полями. null в необязательном поле = «не задано». */
export function O(
  fields: Record<string, Checker>,
  req: string[] = [],
  extra?: (w: Walker, v: Record<string, any>, p: string) => void,
): Checker {
  return (w, v, p) => {
    if (!isObj(v)) {
      w.v001(p, `ожидался объект, получено ${show(v)}.`);
      return;
    }
    for (const r of req) {
      if (v[r] === undefined) w.v001(joinPath(p, r), `нет обязательного поля «${r}».`);
      else if (v[r] === null) w.v001(joinPath(p, r), `обязательное поле «${r}» не может быть null.`);
    }
    for (const k of Object.keys(v)) {
      const c = fields[k];
      if (!c) {
        w.w010(joinPath(p, k), `неизвестное поле «${k}» — оно будет проигнорировано.` +
          didYouMean(k, Object.keys(fields)));
        continue;
      }
      if (v[k] === null || v[k] === undefined) continue;
      c(w, v[k], joinPath(p, k));
    }
    extra?.(w, v, p);
  };
}

/** Объект-словарь: произвольные ключи (возможно, ссылки) и значения одного вида. */
export function M(value: Checker, keyKind?: RefKind, keyExtra?: string): Checker {
  return (w, v, p) => {
    if (!isObj(v)) {
      w.v001(p, `ожидался объект, получено ${show(v)}.`);
      return;
    }
    for (const k of Object.keys(v)) {
      if (keyKind) w.ref(keyKind, k, joinPath(p, k), keyExtra);
      value(w, v[k], joinPath(p, k));
    }
  };
}

export function R(kind: RefKind, extra?: string): Checker {
  return (w, v, p) => {
    if (typeof v !== "string" || !v) {
      w.v001(p, `ожидался id (строка), получено ${show(v)}.`);
      return;
    }
    w.ref(kind, v, p, extra);
  };
}

export const Id: Checker = (w, v, p) => {
  if (typeof v !== "string") return w.v001(p, `id должен быть строкой, получено ${show(v)}.`);
  if (!ID_RE.test(v)) w.v001(p, `id «${v}» должен быть латиницей snake_case (a-z, 0-9, _; начинается с буквы).`);
};

const Snake: Checker = (w, v, p) => {
  if (typeof v !== "string" || !ID_RE.test(v)) w.v001(p, `ожидалась строка латиницей snake_case, получено ${show(v)}.`);
};

function subjectLike(allowed: string[], what: string): Checker {
  return (w, v, p) => {
    if (typeof v !== "string") return w.v001(p, `${what}: ожидалась строка, получено ${show(v)}.`);
    if (v.startsWith("char:")) {
      const id = v.slice(5);
      if (!id) w.v001(p, `${what} «char:» без id персонажа.`);
      else w.ref("character", id, p);
      return;
    }
    if (!allowed.includes(v))
      w.v001(p, `${what} «${v}» недопустим; допустимо: ${allowed.join(", ")}, char:<id>.` + didYouMean(v, allowed));
  };
}
export const Subj = subjectLike(SUBJECTS, "субъект");
export const Targ = subjectLike(TARGETS, "цель");

const DataVal: Checker = (w, v, p) => {
  if (isObj(v) && "$data" in v) return DATA_REF(w, v, p);
  if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean")
    w.v001(p, `значение данных — только число, строка или id, получено ${show(v)}.`);
};
export const DataObj = M(DataVal);

const NumOrStr: Checker = (w, v, p) => {
  if (isObj(v) && "$data" in v) return DATA_REF(w, v, p);
  if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean")
    w.v001(p, `ожидалось число или строка, получено ${show(v)}.`);
};

const OP = E(CMP_OPS);

// ---------- условия (4.12) ----------
interface Spec { f: Record<string, Checker>; req: string[]; extra?: (w: Walker, v: Record<string, any>, p: string) => void }

const needOne = (a: string, b: string) => (w: Walker, v: Record<string, any>, p: string) => {
  const ha = v[a] != null;
  const hb = v[b] != null;
  if (ha === hb) w.v001(p, `нужно ровно одно из полей «${a}» или «${b}».`);
};

let CondRef: Checker = () => {};
const CondF: Checker = (w, v, p) => CondRef(w, v, p);

const LEAVES: Record<string, Spec> = {
  var: { f: { subject: Subj, var: R("variable"), op: OP, value: Nd, field: E(["value", "level"]) }, req: ["var", "op", "value"] },
  var_cmp: { f: { a: Subj, b: Subj, var: R("variable"), op: OP, field: E(["value", "level"]) }, req: ["a", "b", "var", "op"] },
  has_modifier: { f: { subject: Subj, template: R("modifier"), tag: R("modtag"), min_count: NdInt }, req: [], extra: needOne("template", "tag") },
  has_item: { f: { subject: Subj, item: R("item") }, req: ["item"] },
  stock: { f: { good: R("good"), op: OP, value: Nd }, req: ["good", "op", "value"] },
  day: { f: { op: OP, value: Nd }, req: ["op", "value"] },
  hour: { f: { op: OP, value: Nd }, req: ["op", "value"] },
  calc: { f: { name: E(CALCS), op: OP, value: Nd, action: R("action") }, req: ["name", "op", "value"] },
  role: { f: { subject: Subj, role: E(ROLES) }, req: ["role"] },
  self_is_hero: { f: { subject: Subj }, req: [] },
  hired: { f: { character: R("character") }, req: ["character"] },
  worker_count: { f: { op: OP, value: Nd }, req: ["op", "value"] },
  workshop_type: { f: { subject: Subj, workshop: R("workshop") }, req: ["workshop"] },
  incapacitated: { f: { subject: Subj, permanent: B }, req: [] },
  obligation: { f: { id: R("obligation"), state: E(["active", "done", "failed", "declined"]) }, req: ["id", "state"] },
  event_count: { f: { event: R("event"), op: OP, value: Nd }, req: ["event", "op", "value"] },
  some: { f: { among: E(AMONG), where: CondF }, req: ["among"] },
  data: { f: { name: S, op: OP, value: NumOrStr }, req: ["name", "op", "value"] },
};
const LEAF_CHECKERS: Record<string, Checker> = {};
for (const [t, s] of Object.entries(LEAVES))
  LEAF_CHECKERS[t] = O({ type: S, text: S, ...s.f }, ["type", ...s.req], s.extra);
const ALL_ANY = O({ all: A(CondF), any: A(CondF), text: S });
const NOT = O({ not: CondF, text: S }, ["not"]);

export const Cond: Checker = (w, v, p) => {
  if (typeof v === "boolean" || v === null) return;
  if (!isObj(v)) return w.v001(p, `условие должно быть объектом {all|any|not|type}, получено ${show(v)}.`);
  const keys = ["all", "any", "not", "type"].filter((k) => k in v);
  if (keys.length !== 1)
    return w.v001(p, `узел условия должен содержать ровно одно из: all, any, not, type (сейчас: ${keys.join(", ") || "ничего"}).`);
  if (keys[0] === "all" || keys[0] === "any") return ALL_ANY(w, v, p);
  if (keys[0] === "not") return NOT(w, v, p);
  const t = v.type;
  const c = typeof t === "string" ? LEAF_CHECKERS[t] : undefined;
  if (!c)
    return w.v001(joinPath(p, "type"), `неизвестный тип условия ${show(t)}.` +
      (typeof t === "string" ? didYouMean(t, Object.keys(LEAVES)) : ""));
  c(w, v, p);
};
CondRef = Cond;

// ---------- эффекты (4.13) ----------
export const Duration: Checker = (w, v, p) => {
  if (!isObj(v)) return w.v001(p, `срок — объект {"kind": …}, получено ${show(v)}.`);
  switch (v.kind) {
    case "days": return O({ kind: S, n: NdInt }, ["kind", "n"])(w, v, p);
    case "forever":
    case "source": return O({ kind: S }, ["kind"])(w, v, p);
    case "while": return O({ kind: S, condition: Cond }, ["kind", "condition"])(w, v, p);
    default:
      w.v001(joinPath(p, "kind"), `недопустимый срок ${show(v.kind)}; допустимо: days, forever, while, source.`);
  }
};

const HireTarget: Checker = (w, v, p) => {
  if (v === "candidate") return;
  if (typeof v === "string" && v.startsWith("char:") && v.length > 5) return w.ref("character", v.slice(5), p);
  w.v001(p, `цель найма — «candidate» или «char:<id>», получено ${show(v)}.`);
};

const Transfer: Checker = (w, v, p) => {
  if (!isObj(v)) return w.v001(p, `transfer — объект, получено ${show(v)}.`);
  // формат — core.md 3.7
  O({ equipment: B, workers: B, modifiers: B, overflow: E(["inventory", "destroy"]) })(w, v, p);
};

const EFFECTS: Record<string, Spec> = {
  var: { f: { target: Targ, var: R("variable"), add: Nd, set: Nd }, req: ["var"], extra: needOne("add", "set") },
  goods: { f: { good: R("good"), qty: Nd }, req: ["good", "qty"] },
  add_modifier: { f: { template: R("modifier"), target: Targ, duration: Duration, data: DataObj }, req: ["template"] },
  remove_modifier: { f: { template: R("modifier"), tag: R("modtag"), target: Targ, count: NdInt }, req: [], extra: needOne("template", "tag") },
  give_item: { f: { item: R("item"), target: Targ }, req: ["item"] },
  remove: { f: { what: E(["item", "workshop", "character"]), target: Targ, item: R("item") }, req: ["what"] },
  hire: { f: { target: HireTarget }, req: ["target"] },
  add_to_hire_pool: { f: { character: R("character") }, req: ["character"] },
  add_character: { f: { character: R("character"), as: E(["worker", "family"]) }, req: ["character"] },
  add_workshop: { f: { workshop: R("workshop") }, req: ["workshop"] },
  replace_workshop: { f: { target: Targ, workshop: R("workshop"), transfer: Transfer }, req: ["workshop"] },
  notify: { f: { text: S, popup: B, kind: E(["info", "good", "warn", "danger", "seal"]) }, req: ["text"] },
  show_offer: { f: { offer: R("offer"), data: DataObj }, req: ["offer"] },
  run_event: { f: { event: R("event"), data: DataObj, participant: Targ }, req: ["event"] },
  // отсутствие tag — V012, проверяется отдельно
  end_game: { f: { title: S, text: S, tag: E(["goal", "fail"]) }, req: ["title", "text"] },
};
export const EFFECT_TYPES = Object.keys(EFFECTS);
const EFFECT_CHECKERS: Record<string, Checker> = {};
for (const [t, s] of Object.entries(EFFECTS)) EFFECT_CHECKERS[t] = O({ type: S, ...s.f }, ["type", ...s.req], s.extra);

export const Effect: Checker = (w, v, p) => {
  if (!isObj(v)) return w.v001(p, `эффект должен быть объектом {"type": …}, получено ${show(v)}.`);
  const t = v.type;
  const c = typeof t === "string" ? EFFECT_CHECKERS[t] : undefined;
  if (!c)
    return w.v001(joinPath(p, "type"), `неизвестный тип эффекта ${show(t)}.` +
      (typeof t === "string" ? didYouMean(t, EFFECT_TYPES) : ""));
  c(w, v, p);
};
export const Effects = A(Effect);

// ---------- расход, выходы, роли ----------
export const CostLine: Checker = O(
  { var: R("variable"), good: R("good"), qty: Nd, from: Subj, qty_from: R("variable") },
  [],
  (w, v, p) => {
    const hasVar = v.var != null;
    const hasGood = v.good != null;
    if (hasVar === hasGood) w.v001(p, "строка расхода: нужно ровно одно из полей «var» или «good».");
    if (v.qty_from != null) {
      if (!hasVar) w.v001(joinPath(p, "qty_from"), "qty_from допустимо только в строке с «var».");
      if (v.from == null) w.v001(joinPath(p, "from"), "с qty_from нужно поле «from» (у кого брать количество).");
      if (v.qty != null) w.v001(joinPath(p, "qty"), "нельзя одновременно «qty» и «qty_from».");
    } else if (v.qty == null) w.v001(joinPath(p, "qty"), "нет обязательного поля «qty».");
  },
);
const Cost = A(CostLine);
const Output = O({ good: R("good"), qty: Nd }, ["good", "qty"]);
const PerHour = O({ target: Targ, var: R("variable"), add: Nd, scale_by: R("variable") }, ["target", "var", "add"]);
const Role = O({ who: E(WHO), where: Cond }, ["who"]);
const Roles = O({ actor: Role, partner: Role, candidate: Role }, ["actor"]);

function VarMap(owner: string): Checker {
  return M(N(), "variable", owner);
}

// ---------- записи файлов ----------
const Step = O({ at: N(), id: Id, name: S, modifiers: A(R("modifier")) }, ["at", "id"]);

const Variable = O(
  {
    id: Id, name: S, owner: E(OWNERS), start: N(), min: N(), max: N(), format: E(["number", "pct", "money"]),
    floor_pct: N(), good: E(["up", "down"]), ladder: A(Step), visible: Cond,
  },
  ["id", "owner", "start", "min"],
);

const ValueFrom = O({ var: S, subject: Subj, baseline: N(), per_point: N() }, ["var", "per_point"]);

const Modifier = O(
  {
    id: Id, name: S, text: S, var: R("variable"), target: E(["owner", "hero", "world"]),
    applies_to: E(["value", "change"]), direction: E(["gain", "loss", "any"]), op: E(["add", "pct", "mult"]),
    value: Nd, value_from: ValueFrom, action_tags: A(S), duration: Duration, flag: B, incapacitates: B,
    may_be_permanent: B, stack: B, on_expire: Effects, visible: Cond, show_numbers: B, tags: A(S), data_defaults: DataObj,
  },
  ["id"],
  (w, v, p) => {
    if (v.name == null && v.visible !== false)
      w.v001(joinPath(p, "name"), "нет поля «name»: видимому модификатору нужно название (или задайте \"visible\": false).");
  },
);

const Good = O(
  { id: Id, name: S, unit: S, price: N(), buy: B, sell_default: B, visible: Cond },
  ["id", "name", "price"],
);

const Item = O(
  {
    id: Id, name: S, kind: E(["tool", "equipment"]), slot: R("slot"), price: N(), modifiers: A(R("modifier")),
    vars: VarMap("item"), open_when: Cond, description: S, visible: Cond, line: Snake, grade: N({ int: true, min: 1 }),
  },
  ["id", "name", "kind"],
  (w, v, p) => {
    if (v.kind === "tool" && v.slot == null) w.v001(joinPath(p, "slot"), "инструменту (kind: tool) нужно поле «slot».");
    if (v.kind === "equipment") {
      if (v.line == null) w.v001(joinPath(p, "line"), "оборудованию (kind: equipment) нужно поле «line» — линейка, латиница snake_case (core.md 4.6).");
      if (v.grade == null) w.v001(joinPath(p, "grade"), "оборудованию (kind: equipment) нужно поле «grade» — уровень в линейке, целое ≥ 1 (core.md 4.6).");
      if (v.slot != null) w.v001(joinPath(p, "slot"), "у оборудования нет слота: места мастерской обезличены (core.md 3.7). Уберите «slot».");
    } else if (v.kind === "tool") {
      if (v.line != null) w.v001(joinPath(p, "line"), "«line» бывает только у оборудования (kind: equipment).");
      if (v.grade != null) w.v001(joinPath(p, "grade"), "«grade» бывает только у оборудования (kind: equipment).");
    }
  },
);

const Workshop = O(
  { id: Id, name: S, vars: VarMap("workshop"), modifiers: A(R("modifier")), description: S, visible: Cond },
  ["id", "name"],
);

const Character = O(
  {
    id: Id, name: S, role: E(ROLES), works: B, hire_pool: B, vars: VarMap("character"), slots: A(S),
    modifiers: A(R("modifier")), blurb: S, visible: Cond, role_name: S,
  },
  ["id", "name", "role"],
);

const Action = O(
  {
    id: Id, name: S, mode: E(["once", "assignable", "both"]), hours: N(), speed_scaled: B, roles: Roles,
    open_when: Cond, enabled_when: Cond, disabled_text: S, cost: Cost, outputs: A(Output), per_hour: A(PerHour),
    effects: Effects, tags: A(S), text: S, description: S, category: R("category"), visible: Cond,
  },
  ["id", "name", "mode", "hours", "roles"],
);

const Category = O({ id: Id, name: S, view: E(["list", "select"]) }, ["id", "name"]);

const Trigger = O({ signal: E(SIGNALS), pool: R("pool"), conditions: A(Cond) });
const Participant = O(
  { pick: E(["random"]), among: E(AMONG), where: Cond, from: E(["signal"]) },
  [],
  (w, v, p) => {
    needOne("pick", "from")(w, v, p);
    if (v.pick != null && v.among == null) w.v001(joinPath(p, "among"), "для pick: random нужно поле «among».");
  },
);
const Repeat = O({ max: N({ int: true, min: 0 }), cooldown_days: N({ int: true, min: 0 }) });

const Event = O(
  {
    id: Id, trigger: Trigger, weight: N({ min: 0 }), participant: Participant, repeat: Repeat, stops_time: B,
    tags: A(S), effects: Effects, data_defaults: DataObj, visible: Cond,
  },
  ["id"],
);

const Obligation = O(
  {
    id: Id, title: S, requires: Cost, deadline_days: Nd, on_done: Effects, on_fail: Effects, on_decline: Effects,
    data: DataObj,
  },
  ["id", "title"],
);
const Option = O(
  {
    id: Id, label: S, open_when: Cond, enabled_when: Cond, disabled_text: S, cost: Cost, effects: Effects,
    obligation: Obligation,
  },
  ["id", "label"],
);
const Offer = O(
  {
    id: Id, delivery: E(["now", "board"]), board_days: N({ int: true }), title: S, text: S, data: DataObj,
    data_defaults: DataObj, options: A(Option), visible: Cond,
  },
  ["id", "delivery", "title", "options"],
);

const Settings = O(
  {
    day_start: N({ int: true, min: 0, max: 24 }), day_end: N({ int: true, min: 0, max: 24 }),
    market_hours: N({ int: true, min: 1 }), trade_hours: N({ int: true, min: 1 }),
    trader_raw_target: M(N({ min: 0 }), "good"), trade_open_when: Cond, shop: A(R("item")),
    pools: M(O({ chance: N({ min: 0, max: 1 }) }, ["chance"])), max_event_chain: N({ int: true, min: 1 }),
  },
  ["day_start", "day_end", "market_hours"],
  (w, v, p) => {
    if (typeof v.day_start === "number" && typeof v.day_end === "number" && v.day_start >= v.day_end)
      w.v001(joinPath(p, "day_end"), `day_end (${v.day_end}) должен быть больше day_start (${v.day_start}).`);
  },
);

const Names = O({
  money: S, money_short: S, stress: S, slots: M(S),
  roles: O({ hero: S, worker: S, family: S, pet: S }),
});

// core.md 4.2: name и version — обязательные непустые строки; description — необязательная строка или null.
const PackMeta = O(
  {
    id: Id, name: NonEmptyS, version: NonEmptyS, description: S, names: Names, settings: Settings,
    start: O({ event: S /* V014 */, hero: R("character") }, ["event", "hero"]),
  },
  ["id", "name", "version", "settings", "start"],
);

const OfferChoices: Checker = (w, v, p) => {
  if (!isObj(v)) return w.v001(p, `ожидался объект {предложение: вариант}, получено ${show(v)}.`);
  for (const [k, opt] of Object.entries(v)) {
    w.ref("offer", k, joinPath(p, k));
    if (typeof opt !== "string") w.v001(joinPath(p, k), `ожидался id варианта, получено ${show(opt)}.`);
    else w.ref("option", opt, joinPath(p, k), k);
  }
};

const StrategyHints = O({
  action_ladder: A(R("action")), hire_order: A(R("character")), buy_order: A(R("item")), rest_action: R("action"),
  rest_when: O({ var: R("variable"), above: N(), below: N() }, ["var"]), offer_choices: OfferChoices,
  traders: A(R("character")), coverage_thresholds: Any,
});

const RECORD: Record<string, Checker> = {
  variables: Variable, modifiers: Modifier, goods: Good, items: Item, workshops: Workshop, characters: Character,
  actions: Action, categories: Category, events: Event, offers: Offer,
};

/** Проверка схемы одного файла. Тексты (texts.json) проверяются в checks.ts (V006). */
export function checkFileSchema(w: Walker, key: string, value: unknown): void {
  w.file = `${key}.json`;
  w.id = "-";
  if (key === "pack") {
    w.id = isObj(value) && typeof value.id === "string" ? value.id : "pack";
    PackMeta(w, value, "");
    return;
  }
  if (key === "strategy_hints") {
    StrategyHints(w, value, "");
    return;
  }
  if (key === "texts") {
    if (!isObj(value)) return w.v001("", `texts.json должен быть объектом «ключ: текст», получено ${show(value)}.`);
    for (const [k, t] of Object.entries(value)) {
      w.id = k;
      if (typeof t !== "string") w.v001("", `текст должен быть строкой, получено ${show(t)}.`);
    }
    return;
  }
  const rec = RECORD[key];
  if (!rec) return;
  if (!Array.isArray(value)) return w.v001("", `${key}.json должен быть массивом записей, получено ${show(value)}.`);
  value.forEach((r, i) => {
    w.id = recId(r, i);
    rec(w, r, "");
  });
}
