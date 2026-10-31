// Индекс пака: карты id → запись, все списки эффектов с их «областью» (scope),
// все места с условиями. Строится один раз и используется всеми проверками.
import { arr, isObj, joinPath, str } from "./util.ts";
import type { Pack } from "./types.ts";

export type ScopeKind = "event" | "option" | "obligation" | "action" | "modifier";

export interface Scope {
  kind: ScopeKind;
  /** ключ области: `event:x`, `option:offer#opt`, `obligation:offer#opt#on_done`, `action:a`, `modifier:m` */
  key: string;
  /** ключ контекста данных: `event:x`, `offer:o`, `ob:offer#opt`, `action:a`, `modifier:m` */
  dataKey: string;
  file: string;
  id: string;
  offer?: string;
  option?: string;
  obligation?: string;
  branch?: "on_done" | "on_fail" | "on_decline";
}

export interface EffectSite {
  e: Record<string, any>;
  type: string;
  path: string;
  scope: Scope;
}

export interface CondSite {
  cond: unknown;
  file: string;
  id: string;
  path: string;
  /** чьё это условие: `event:x`, `action:a`, `option:o#opt`, `var:v`, … */
  owner: string;
  /** контекст данных (для $data) */
  dataKey?: string;
}

export interface ObligationRef {
  ob: Record<string, any>;
  offer: string;
  option: string;
  path: string;
}

export const DEFAULT_VARS: Record<string, any> = {
  money: { id: "money", owner: "world", start: 0, min: 0, format: "money" },
  stress: { id: "stress", owner: "character", start: 0, min: 0, max: 100, good: "down", visible: { type: "self_is_hero" } },
};

function byId(list: unknown): Map<string, Record<string, any>> {
  const m = new Map<string, Record<string, any>>();
  for (const r of arr(list)) if (isObj(r) && typeof r.id === "string" && !m.has(r.id)) m.set(r.id, r);
  return m;
}

export class PackIndex {
  meta: Record<string, any>;
  settings: Record<string, any>;
  vars: Map<string, Record<string, any>>;
  declaredVars: Map<string, Record<string, any>>;
  mods: Map<string, Record<string, any>>;
  goods: Map<string, Record<string, any>>;
  items: Map<string, Record<string, any>>;
  workshops: Map<string, Record<string, any>>;
  chars: Map<string, Record<string, any>>;
  actions: Map<string, Record<string, any>>;
  categories: Map<string, Record<string, any>>;
  events: Map<string, Record<string, any>>;
  offers: Map<string, Record<string, any>>;
  obligations = new Map<string, ObligationRef>();
  effects: EffectSite[] = [];
  byScope = new Map<string, EffectSite[]>();
  conds: CondSite[] = [];
  modTags = new Set<string>();
  /** все стартовые значения переменной: объявление и переопределения в шаблонах */
  startValues = new Map<string, number[]>();

  constructor(public pack: Pack) {
    this.meta = isObj(pack.pack) ? pack.pack : {};
    this.settings = isObj(this.meta.settings) ? this.meta.settings : {};
    this.declaredVars = byId(pack.variables);
    this.vars = new Map(this.declaredVars);
    for (const [k, v] of Object.entries(DEFAULT_VARS)) if (!this.vars.has(k)) this.vars.set(k, v);
    this.mods = byId(pack.modifiers);
    this.goods = byId(pack.goods);
    this.items = byId(pack.items);
    this.workshops = byId(pack.workshops);
    this.chars = byId(pack.characters);
    this.actions = byId(pack.actions);
    this.categories = byId(pack.categories);
    this.events = byId(pack.events);
    this.offers = byId(pack.offers);

    for (const m of this.mods.values()) for (const t of arr(m.tags)) if (typeof t === "string") this.modTags.add(t);

    for (const [id, v] of this.vars) {
      const s: number[] = [];
      if (typeof v.start === "number") s.push(v.start);
      this.startValues.set(id, s);
    }
    for (const map of [this.chars, this.workshops, this.items])
      for (const t of map.values())
        if (isObj(t.vars))
          for (const [k, val] of Object.entries(t.vars))
            if (typeof val === "number") this.startValues.get(k)?.push(val);

    this.collect();
  }

  private addEffects(list: unknown, scope: Scope, base: string): void {
    const sites: EffectSite[] = this.byScope.get(scope.key) ?? [];
    arr(list).forEach((e, i) => {
      if (!isObj(e) || typeof e.type !== "string") return;
      const site: EffectSite = { e, type: e.type, path: joinPath(base, i), scope };
      sites.push(site);
      this.effects.push(site);
      if (e.type === "add_modifier" && isObj(e.duration) && e.duration.kind === "while")
        this.cond(e.duration.condition, scope.file, scope.id, joinPath(site.path, "duration.condition"), scope.key, scope.dataKey);
    });
    this.byScope.set(scope.key, sites);
  }

  private cond(c: unknown, file: string, id: string, path: string, owner: string, dataKey?: string): void {
    if (c === undefined || c === null) return;
    this.conds.push({ cond: c, file, id, path, owner, dataKey });
  }

  private collect(): void {
    const s = this.settings;
    this.cond(s.trade_open_when, "pack.json", str(this.meta.id) ?? "pack", "settings.trade_open_when", "settings");

    for (const [id, v] of this.vars) {
      if (!this.declaredVars.has(id)) continue;
      this.cond(v.visible, "variables.json", id, "visible", `var:${id}`);
    }
    for (const [id, m] of this.mods) {
      const scope: Scope = { kind: "modifier", key: `modifier:${id}`, dataKey: `modifier:${id}`, file: "modifiers.json", id };
      this.addEffects(m.on_expire, scope, "on_expire");
      this.cond(m.visible, "modifiers.json", id, "visible", `modifier:${id}`);
      if (isObj(m.duration) && m.duration.kind === "while")
        this.cond(m.duration.condition, "modifiers.json", id, "duration.condition", `modifier:${id}`, `modifier:${id}`);
    }
    for (const [id, g] of this.goods) this.cond(g.visible, "goods.json", id, "visible", `good:${id}`);
    for (const [id, it] of this.items) {
      this.cond(it.visible, "items.json", id, "visible", `item:${id}`);
      this.cond(it.open_when, "items.json", id, "open_when", `item:${id}`);
    }
    for (const [id, w] of this.workshops) this.cond(w.visible, "workshops.json", id, "visible", `workshop:${id}`);
    for (const [id, c] of this.chars) this.cond(c.visible, "characters.json", id, "visible", `char:${id}`);
    for (const [id, a] of this.actions) {
      const scope: Scope = { kind: "action", key: `action:${id}`, dataKey: `action:${id}`, file: "actions.json", id };
      this.addEffects(a.effects, scope, "effects");
      for (const f of ["open_when", "enabled_when", "visible"]) this.cond(a[f], "actions.json", id, f, `action:${id}`, scope.dataKey);
      if (isObj(a.roles))
        for (const [r, role] of Object.entries(a.roles))
          if (isObj(role)) this.cond(role.where, "actions.json", id, `roles.${r}.where`, `action:${id}`, scope.dataKey);
    }
    for (const [id, ev] of this.events) {
      const scope: Scope = { kind: "event", key: `event:${id}`, dataKey: `event:${id}`, file: "events.json", id };
      this.addEffects(ev.effects, scope, "effects");
      if (isObj(ev.trigger))
        arr(ev.trigger.conditions).forEach((c, i) =>
          this.cond(c, "events.json", id, `trigger.conditions[${i}]`, `event:${id}`, scope.dataKey));
      if (isObj(ev.participant)) this.cond(ev.participant.where, "events.json", id, "participant.where", `event:${id}`, scope.dataKey);
      this.cond(ev.visible, "events.json", id, "visible", `event:${id}`, scope.dataKey);
    }
    for (const [oid, of] of this.offers) {
      this.cond(of.visible, "offers.json", oid, "visible", `offer:${oid}`, `offer:${oid}`);
      arr(of.options).forEach((opt, i) => {
        if (!isObj(opt)) return;
        const optId = str(opt.id) ?? `#${i}`;
        const base = `options[${i}]`;
        const key = `${oid}#${optId}`;
        const scope: Scope = {
          kind: "option", key: `option:${key}`, dataKey: `offer:${oid}`, file: "offers.json", id: oid, offer: oid, option: optId,
        };
        this.addEffects(opt.effects, scope, `${base}.effects`);
        for (const f of ["open_when", "enabled_when"])
          this.cond(opt[f], "offers.json", oid, `${base}.${f}`, `option:${key}`, scope.dataKey);
        const ob = opt.obligation;
        if (isObj(ob)) {
          const obId = str(ob.id);
          if (obId && !this.obligations.has(obId)) this.obligations.set(obId, { ob, offer: oid, option: optId, path: `${base}.obligation` });
          for (const br of ["on_done", "on_fail", "on_decline"] as const) {
            const bscope: Scope = {
              kind: "obligation", key: `obligation:${key}#${br}`, dataKey: `ob:${key}`, file: "offers.json", id: oid,
              offer: oid, option: optId, obligation: obId, branch: br,
            };
            this.addEffects(ob[br], bscope, `${base}.obligation.${br}`);
          }
        }
      });
    }
  }

  sitesOf(scopeKey: string): EffectSite[] {
    return this.byScope.get(scopeKey) ?? [];
  }
}

/** Обход всех узлов дерева условия. */
export function walkCond(c: unknown, fn: (leaf: Record<string, any>, negated: boolean) => void, negated = false): void {
  if (!isObj(c)) return;
  if (Array.isArray(c.all)) for (const x of c.all) walkCond(x, fn, negated);
  else if (Array.isArray(c.any)) for (const x of c.any) walkCond(x, fn, negated);
  else if ("not" in c) walkCond(c.not, fn, !negated);
  else if (typeof c.type === "string") {
    fn(c, negated);
    if (c.type === "some") walkCond(c.where, fn, negated);
  }
}

/** Все значения `{"$data": имя}` внутри произвольного значения. */
export function walkData(v: unknown, path: string, fn: (name: string, path: string) => void): void {
  if (Array.isArray(v)) v.forEach((x, i) => walkData(x, joinPath(path, i), fn));
  else if (isObj(v)) {
    if (typeof v.$data === "string" && Object.keys(v).length === 1) fn(v.$data, path);
    else for (const [k, x] of Object.entries(v)) walkData(x, joinPath(path, k), fn);
  }
}
