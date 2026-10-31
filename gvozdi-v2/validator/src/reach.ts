// Достижимость (validator.md, раздел 5): оптимистичная неподвижная точка от старта,
// без учёта денег, вероятностей и времени.
import type { EffectSite, PackIndex } from "./index-pack.ts";
import { arr, cmp, isObj, num, str } from "./util.ts";

const LESS_OPS = new Set(["<", "<=", "!="]);

export class Reach {
  goods = new Set<string>();
  items = new Set<string>();
  workshops = new Set<string>();
  present = new Set<string>();
  pool = new Set<string>();
  hired = new Set<string>();
  worker = false;
  /** достижим эффект hire с целью candidate: нанимается любой, кто попадёт в пул */
  hireFromPool = false;
  family = false;
  mods = new Set<string>();
  tags = new Set<string>();
  steps = new Set<string>(); // `${var}#${k}`
  events = new Set<string>();
  offers = new Set<string>();
  options = new Set<string>(); // `${offer}#${option}`
  obCreated = new Set<string>();
  obDone = new Set<string>();
  obFailed = new Set<string>();
  obDeclined = new Set<string>();
  actions = new Set<string>();
  scopes = new Set<string>();
  inc = new Set<string>();
  dec = new Set<string>();
  setVals = new Map<string, number[]>();
  modExpires = false;
  incap = false;
  incapPerm = false;
  signals = new Set<string>();
  private changed = false;
  private hasVisibilityConds = false;

  constructor(private ix: PackIndex) {
    this.run();
  }

  private add(set: Set<string>, v: unknown): void {
    if (typeof v !== "string" || set.has(v)) return;
    set.add(v);
    this.changed = true;
  }
  private flag(name: "worker" | "family" | "modExpires" | "incap" | "incapPerm" | "hireFromPool"): void {
    if (!this[name]) {
      this[name] = true;
      this.changed = true;
    }
  }

  // ---------- переменные ----------
  private values(v: string): number[] {
    return [...(this.ix.startValues.get(v) ?? []), ...(this.setVals.get(v) ?? [])];
  }

  /** может ли итог переменной стать ≥ x (или > x) */
  canAtLeast(v: string, x: number, strict = false): boolean {
    const def = this.ix.vars.get(v);
    if (!def || v === "money") return true;
    const max = num(def.max) ?? Infinity;
    if (strict ? x >= max : x > max) return false;
    const vals = this.values(v);
    if (vals.some((s) => (strict ? s > x : s >= x))) return true;
    return this.inc.has(v);
  }
  canAtMost(v: string, x: number): boolean {
    const def = this.ix.vars.get(v);
    if (!def || v === "money") return true;
    const min = num(def.min) ?? -Infinity;
    if (x < min) return false;
    return this.values(v).some((s) => s <= x) || this.dec.has(v);
  }

  stepReachable(v: string, k: number): boolean {
    const def = this.ix.vars.get(v);
    const ladder = arr(def?.ladder);
    const at = num(ladder[k]?.at);
    if (at === undefined) return false;
    if (v === "money") return true;
    const next = num(ladder[k + 1]?.at) ?? Infinity;
    const max = num(def?.max) ?? Infinity;
    if (at > max) return false;
    const vals = this.values(v);
    if (vals.some((s) => s >= at && s < next)) return true;
    if (this.inc.has(v) && vals.some((s) => s < at)) return true;
    if (this.dec.has(v) && vals.some((s) => s >= next)) return true;
    if (this.inc.has(v) && this.dec.has(v)) return true;
    return false;
  }

  private varChange(v: unknown, d: unknown): void {
    if (typeof v !== "string") return;
    const n = num(d);
    if (n === undefined || n > 0) this.add(this.inc, v);
    if (n === undefined || n < 0) this.add(this.dec, v);
  }
  private varSet(v: unknown, d: unknown): void {
    if (typeof v !== "string") return;
    const n = num(d);
    if (n === undefined) {
      this.add(this.inc, v);
      this.add(this.dec, v);
      return;
    }
    const list = this.setVals.get(v) ?? [];
    if (!list.includes(n)) {
      list.push(n);
      this.setVals.set(v, list);
      this.changed = true;
    }
  }

  // ---------- условия ----------
  sat(c: unknown): boolean {
    if (c === undefined || c === null) return true;
    if (typeof c === "boolean") return c;
    if (!isObj(c)) return true;
    if (Array.isArray(c.all)) return c.all.every((x) => this.sat(x));
    if (Array.isArray(c.any)) return c.any.some((x) => this.sat(x));
    if ("not" in c) return true;
    const op = str(c.op) ?? ">=";
    const val = c.value;
    const n = num(val);
    const less = LESS_OPS.has(op);
    switch (c.type) {
      case "var": {
        if (less || n === undefined) return true;
        const v = str(c.var) ?? "";
        if (c.field === "level") {
          const ladder = arr(this.ix.vars.get(v)?.ladder);
          if (!ladder.length) return true;
          for (let k = 0; k < ladder.length; k++) if (cmp(k, op, n) && this.stepReachable(v, k)) return true;
          return false;
        }
        if (op === "==") return this.canAtLeast(v, n) && this.canAtMost(v, n);
        return this.canAtLeast(v, n, op === ">");
      }
      case "has_modifier": {
        const mc = num(c.min_count) ?? 1;
        if (typeof c.template === "string") {
          if (!this.mods.has(c.template)) return false;
          return mc <= 1 || this.ix.mods.get(c.template)?.stack === true;
        }
        if (typeof c.tag === "string") return this.tags.has(c.tag);
        return true;
      }
      case "has_item": return this.items.has(c.item);
      case "stock": {
        if (less || n === undefined) return true;
        if (op === ">=" && n <= 0) return true;
        if (op === "==" && n === 0) return true;
        return this.goods.has(c.good);
      }
      case "hired": return this.hired.has(c.character);
      case "worker_count": {
        if (less || n === undefined) return true;
        const need = op === ">" ? n + 1 : n;
        if (need <= 0) return true;
        return this.hired.size + (this.worker ? 1 : 0) >= need;
      }
      case "workshop_type": return this.workshops.has(c.workshop);
      case "incapacitated": return c.permanent === true ? this.incapPerm : this.incap;
      case "obligation": {
        const id = c.id;
        switch (c.state) {
          case "active": return this.obCreated.has(id);
          case "done": return this.obDone.has(id);
          case "failed": return this.obFailed.has(id);
          case "declined": return this.obDeclined.has(id);
        }
        return true;
      }
      case "event_count": {
        if (less || n === undefined) return true;
        if ((op === ">=" || op === "==") && n <= 0) return true;
        return this.events.has(c.event);
      }
      case "some": return this.sat(c.where);
      default:
        // day, hour, calc, role, self_is_hero, var_cmp, data — всегда выполнимы
        return true;
    }
  }
  private satAll(list: unknown): boolean {
    return arr(list).every((x) => this.sat(x));
  }

  private costOk(cost: unknown): boolean {
    for (const line of arr(cost)) {
      if (!isObj(line)) continue;
      if (typeof line.good === "string") {
        const q = num(line.qty);
        if (q !== undefined && q <= 0) continue;
        if (!this.goods.has(line.good)) return false;
      } else if (typeof line.var === "string" && line.qty_from == null) {
        const q = num(line.qty);
        if (q !== undefined && !this.canAtLeast(line.var, q)) return false;
      }
    }
    return true;
  }

  private whoOk(role: unknown): boolean {
    if (!isObj(role)) return true;
    if (!this.sat(role.where)) return false;
    switch (role.who) {
      case "worker": return this.hired.size > 0 || this.worker;
      case "pool": return this.pool.size > 0;
      default: return true;
    }
  }

  private participantOk(p: unknown): boolean {
    if (!isObj(p)) return true;
    if (p.pick != null) {
      if (p.among === "workers" && !(this.hired.size > 0 || this.worker)) return false;
      if (p.among === "family" && !this.family) return false;
    }
    return this.sat(p.where);
  }

  // ---------- эффекты ----------
  private addMod(t: unknown): void {
    if (typeof t !== "string") return;
    if (!this.mods.has(t)) {
      this.mods.add(t);
      this.changed = true;
      for (const tag of arr(this.ix.mods.get(t)?.tags)) this.add(this.tags, tag);
    }
  }
  private addMods(list: unknown): void {
    for (const t of arr(list)) this.addMod(t);
  }

  applyScope(key: string): void {
    if (this.scopes.has(key)) return;
    this.scopes.add(key);
    this.changed = true;
    for (const s of this.ix.sitesOf(key)) this.applyEffect(s);
  }

  private fire(id: unknown): void {
    if (typeof id !== "string" || !this.ix.events.has(id)) return;
    this.add(this.events, id);
    this.applyScope(`event:${id}`);
  }

  private applyEffect(s: EffectSite): void {
    const e = s.e;
    switch (s.type) {
      case "var":
        if (e.add !== undefined) this.varChange(e.var, e.add);
        else if (e.set !== undefined) this.varSet(e.var, e.set);
        break;
      case "goods": {
        const q = num(e.qty);
        if (q === undefined || q > 0) this.add(this.goods, e.good);
        break;
      }
      case "add_modifier":
        this.addMod(e.template);
        if (isObj(e.duration) && e.duration.kind === "days") this.flag("modExpires");
        break;
      case "give_item": this.add(this.items, e.item); break;
      case "hire":
        if (e.target === "candidate") this.flag("hireFromPool");
        else if (typeof e.target === "string" && e.target.startsWith("char:")) this.hireChar(e.target.slice(5));
        break;
      case "add_to_hire_pool": this.add(this.pool, e.character); break;
      case "add_character":
        this.add(this.present, e.character);
        if (e.as === "worker") this.flag("worker");
        if (e.as === "family") this.flag("family");
        break;
      case "add_workshop":
      case "replace_workshop":
        this.add(this.workshops, e.workshop);
        break;
      case "show_offer": this.add(this.offers, e.offer); break;
      case "run_event": this.fire(e.event); break;
    }
  }
  private hireChar(c: string): void {
    this.add(this.hired, c);
    this.add(this.present, c);
  }

  // ---------- сигналы ----------
  private computeSignals(): void {
    const ix = this.ix;
    const sig = this.signals;
    for (const s of ["game_start", "night", "morning", "market_trip"]) sig.add(s);
    const reachedActions = [...this.actions].map((a) => ix.actions.get(a)).filter(isObj);
    if (reachedActions.length) sig.add("action_done");
    if (reachedActions.some((a) => arr(a.outputs).length > 0)) sig.add("batch_defect");
    if (reachedActions.some((a) => (a.mode === "assignable" || a.mode === "both") && arr(a.cost).length > 0))
      sig.add("idle_no_cost");
    for (const [v, def] of ix.vars) {
      const n = arr(def.ladder).length;
      let c = 0;
      for (let k = 0; k < n; k++) if (this.steps.has(`${v}#${k}`)) c++;
      if (c >= 2) sig.add("ladder_step");
    }
    if (this.modExpires) sig.add("modifier_expired");
    if (this.hasVisibilityConds) sig.add("became_visible");
    if (this.incap) sig.add("incapacitated");
    if (this.hired.size) sig.add("hired");
    if (this.obDone.size) sig.add("obligation_done");
    if (this.obFailed.size) sig.add("obligation_failed");
    if (this.obDeclined.size) sig.add("obligation_declined");
    if ([...this.offers].some((o) => ix.offers.get(o)?.delivery === "board")) sig.add("offer_expired");
  }

  eventCanFire(ev: Record<string, any>): boolean {
    const t = ev.trigger;
    if (!isObj(t)) return false;
    if (t.signal != null && !this.signals.has(t.signal)) return false;
    return this.satAll(t.conditions) && this.participantOk(ev.participant);
  }

  actionOk(a: Record<string, any>): boolean {
    if (!this.sat(a.open_when) || !this.sat(a.enabled_when) || !this.sat(a.visible)) return false;
    if (!this.costOk(a.cost)) return false;
    if (isObj(a.roles)) for (const r of Object.values(a.roles)) if (!this.whoOk(r)) return false;
    return true;
  }

  optionOk(opt: Record<string, any>): boolean {
    return this.sat(opt.open_when) && this.sat(opt.enabled_when) && this.costOk(opt.cost);
  }

  // ---------- неподвижная точка ----------
  private run(): void {
    const ix = this.ix;
    this.hasVisibilityConds = ix.conds.some((c) => /\.?(visible|open_when)$/.test(c.path) && c.cond !== true);
    const hero = str(ix.meta.start?.hero);
    if (hero) this.present.add(hero);
    for (const [id, c] of ix.chars) if (c.hire_pool === true) this.pool.add(id);
    for (const [id, g] of ix.goods) if (g.buy === true) this.goods.add(id);
    this.inc.add("money");
    this.dec.add("money");
    for (const [id, v] of ix.vars) if (v.floor_pct != null) this.incap = true;

    for (let guard = 0; guard < 1000; guard++) {
      this.changed = false;
      this.computeSignals();
      if (this.hireFromPool) for (const c of [...this.pool]) this.hireChar(c);

      for (const c of [...this.present, ...this.pool]) {
        const ch = ix.chars.get(c);
        if (!ch) continue;
        this.addMods(ch.modifiers);
        if (ch.role === "family" && this.present.has(c)) this.flag("family");
      }
      for (const w of this.workshops) this.addMods(ix.workshops.get(w)?.modifiers);
      for (const it of this.items) this.addMods(ix.items.get(it)?.modifiers);
      for (const it of arr(ix.settings.shop)) if (ix.items.has(it) && this.sat(ix.items.get(it)!.open_when)) this.add(this.items, it);

      for (const m of [...this.mods]) {
        const t = ix.mods.get(m);
        if (!t) continue;
        if (typeof t.var === "string" && t.applies_to !== "change") {
          const val = num(t.value);
          if (t.value_from != null || val === undefined) this.varChange(t.var, undefined);
          else if (t.op === "mult") this.varChange(t.var, val - 1);
          else this.varChange(t.var, val);
        }
        if (t.incapacitates === true) {
          this.flag("incap");
          if (isObj(t.duration) && t.duration.kind === "forever") this.flag("incapPerm");
        }
        if (isObj(t.duration) && t.duration.kind === "days") this.flag("modExpires");
        this.applyScope(`modifier:${m}`);
      }

      for (const [v, def] of ix.vars) {
        arr(def.ladder).forEach((step, k) => {
          const key = `${v}#${k}`;
          if (!this.steps.has(key) && this.stepReachable(v, k)) {
            this.add(this.steps, key);
          }
          if (this.steps.has(key) && isObj(step)) this.addMods(step.modifiers);
        });
      }

      for (const [id, a] of ix.actions) {
        if (this.actions.has(id) || !this.actionOk(a)) continue;
        this.add(this.actions, id);
        for (const o of arr(a.outputs)) if (isObj(o)) this.add(this.goods, o.good);
        for (const ph of arr(a.per_hour)) if (isObj(ph)) this.varChange(ph.var, ph.add);
        this.applyScope(`action:${id}`);
      }

      for (const [id, ev] of ix.events) if (!this.events.has(id) && this.eventCanFire(ev)) this.fire(id);

      for (const oid of [...this.offers]) {
        const of = ix.offers.get(oid);
        if (!of) continue;
        arr(of.options).forEach((opt, i) => {
          if (!isObj(opt)) return;
          const key = `${oid}#${str(opt.id) ?? `#${i}`}`;
          if (!this.options.has(key) && this.optionOk(opt)) {
            this.add(this.options, key);
            this.applyScope(`option:${key}`);
          }
          if (!this.options.has(key) || !isObj(opt.obligation)) return;
          const ob = opt.obligation;
          const obId = str(ob.id) ?? key;
          this.add(this.obCreated, obId);
          this.add(this.obDeclined, obId);
          this.applyScope(`obligation:${key}#on_decline`);
          if (ob.deadline_days != null) {
            this.add(this.obFailed, obId);
            this.applyScope(`obligation:${key}#on_fail`);
          }
          if (this.costOk(ob.requires)) {
            this.add(this.obDone, obId);
            this.applyScope(`obligation:${key}#on_done`);
          }
        });
      }

      if (!this.changed) break;
    }
  }
}
