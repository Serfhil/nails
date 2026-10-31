// Проверки на основе достижимости: V010, W001 (недееспособность от суммы pct), W003 (предвестник поражения).
import type { EffectSite, PackIndex } from "./index-pack.ts";
import { walkCond } from "./index-pack.ts";
import type { Reach } from "./reach.ts";
import { usage } from "./checks.ts";
import { Problems, arr, isObj, joinPath, num, str } from "./util.ts";

const compact = (c: unknown): string => {
  const s = JSON.stringify(c) ?? "";
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
};

/** Первый лист условия, который при достижимых фактах не может быть истинным. */
function firstUnsat(r: Reach, c: unknown): unknown {
  if (r.sat(c)) return undefined;
  if (isObj(c) && Array.isArray(c.all)) {
    for (const x of c.all) {
      const u = firstUnsat(r, x);
      if (u !== undefined) return u;
    }
  }
  return c;
}

function why(r: Reach, c: unknown, what: string): string {
  const u = firstUnsat(r, c);
  return `${what} не выполнимо ни одним путём (${compact(u)})`;
}

export function checkReachability(p: Problems, ix: PackIndex, r: Reach): void {
  const used = usage(ix);

  for (const [id, a] of ix.actions) {
    if (r.actions.has(id)) continue;
    const reasons: string[] = [];
    for (const f of ["open_when", "enabled_when", "visible"]) if (!r.sat(a[f])) reasons.push(why(r, a[f], f));
    if (!r.actionOk({ cost: a.cost })) reasons.push("расход нельзя набрать: нужного товара или переменной не получить");
    if (isObj(a.roles))
      for (const [role, def] of Object.entries(a.roles)) {
        if (!r.actionOk({ roles: { [role]: def } }))
          reasons.push(`роль ${role} (${isObj(def) ? String(def.who) : "?"}) некому исполнить`);
      }
    p.err("V010", "actions.json", id, "", `действие недостижимо: ${reasons.join("; ") || "условия не выполнимы"}.`);
  }

  for (const [id, ev] of ix.events) {
    if (r.events.has(id) || !used.events.has(id)) continue;
    let reason: string;
    const t = ev.trigger;
    if (!isObj(t)) reason = "событие без trigger, а ни один эффект run_event с ним не достижим";
    else if (t.signal != null && !r.signals.has(t.signal))
      reason = `сигнал «${String(t.signal)}» не испускается ни при каких достижимых фактах, и ни один run_event с ним не достижим`;
    else {
      const i = arr(t.conditions).findIndex((c) => !r.sat(c));
      reason = i >= 0 ? why(r, t.conditions[i], `trigger.conditions[${i}]`) : "нет подходящего участника (participant)";
    }
    p.err("V010", "events.json", id, "", `событие никогда не сработает: ${reason}.`);
  }

  for (const [id, of] of ix.offers) {
    if (!used.offers.has(id)) continue;
    if (!r.offers.has(id)) {
      p.err("V010", "offers.json", id, "", "предложение никогда не показывается: ни один эффект show_offer с ним не достижим.");
      continue;
    }
    arr(of.options).forEach((opt, i) => {
      if (!isObj(opt)) return;
      if (r.options.has(`${id}#${str(opt.id) ?? `#${i}`}`)) return;
      const reasons: string[] = [];
      for (const f of ["open_when", "enabled_when"]) if (!r.sat(opt[f])) reasons.push(why(r, opt[f], f));
      if (!reasons.length) reasons.push("цену (cost) нельзя набрать");
      p.err("V010", "offers.json", id, `options[${i}]`, `вариант «${String(opt.id)}» нельзя выбрать: ${reasons.join("; ")}.`);
    });
  }

  for (const [id, v] of ix.declaredVars) {
    if (v.visible === undefined || v.visible === null || v.visible === false) continue;
    if (!r.sat(v.visible)) p.err("V010", "variables.json", id, "visible", `переменная никогда не станет видимой: ${why(r, v.visible, "visible")}.`);
  }

  for (const id of ix.goods.keys())
    if (!r.goods.has(id))
      p.err("V010", "goods.json", id, "", "товар нельзя получить: он не продаётся на рынке (buy: true), не выходит из достижимых действий и не выдаётся эффектом goods.");
  for (const id of ix.items.keys())
    if (used.items.has(id) && !r.items.has(id))
      p.err("V010", "items.json", id, "", "предмет нельзя получить: ни один give_item с ним не достижим, а в магазине его open_when не выполнимо.");
  for (const id of ix.workshops.keys())
    if (!r.workshops.has(id))
      p.err("V010", "workshops.json", id, "", "мастерская никогда не появится: нет достижимого эффекта add_workshop или replace_workshop с ней.");
  for (const id of ix.chars.keys())
    if (!r.present.has(id) && !r.pool.has(id))
      p.err("V010", "characters.json", id, "", "персонаж никогда не попадёт в игру: он не герой, не в пуле найма (hire_pool) и нет достижимого add_character / add_to_hire_pool / hire с ним.");

  // концовки внутри достижимых вариантов, но в недостижимых ветках обязательства
  for (const s of ix.effects) {
    if (s.type !== "end_game" || r.scopes.has(s.scope.key)) continue;
    if (s.scope.kind === "obligation" && r.options.has(`${s.scope.offer}#${s.scope.option}`)) {
      const reason = s.scope.branch === "on_fail" ? "у обязательства нет deadline_days — провала не бывает" : "requires нельзя набрать";
      p.err("V010", s.scope.file, s.scope.id, joinPath(s.path, "tag"), `концовка «${String(s.e.title)}» недостижима: ${reason}.`);
    }
  }
}

// ---------------- W001 ----------------
export function checkFloor(p: Problems, ix: PackIndex, r: Reach): void {
  for (const [id, v] of ix.declaredVars) {
    const floor = num(v.floor_pct);
    if (floor === undefined) continue;
    let pct = 0;
    let mult = 1;
    const names: string[] = [];
    for (const m of r.mods) {
      const t = ix.mods.get(m);
      if (!t || t.var !== id || t.applies_to === "change" || t.value_from != null) continue;
      const val = num(t.value);
      if (val === undefined) continue;
      if (t.op === "pct" && val < 0) {
        pct += val;
        names.push(m);
      } else if (t.op === "mult" && val < 1) {
        mult *= val;
        names.push(m);
      }
    }
    const factor = Math.max(0, 1 + pct / 100) * mult;
    if (names.length && factor * 100 < floor)
      p.warn("W001", "variables.json", id, "floor_pct",
        `достижимые отрицательные модификаторы (${names.join(", ")}) вместе опускают итог до ${Math.round(factor * 100)}% сырого — ниже floor_pct ${floor}%: персонаж станет недееспособным. Если так задумано — ок, иначе ослабьте модификаторы.`);
  }
}

// ---------------- W003 ----------------
interface Launch {
  vars: Set<string>;
  mods: Set<string>;
  tags: Set<string>;
  indicator: boolean;
}

function collectConds(ix: PackIndex, l: Launch, conds: unknown[]): void {
  for (const c of conds)
    walkCond(c, (leaf) => {
      switch (leaf.type) {
        case "var":
        case "var_cmp":
          if (typeof leaf.var === "string") l.vars.add(leaf.var);
          break;
        case "has_modifier":
          if (typeof leaf.template === "string") l.mods.add(leaf.template);
          if (typeof leaf.tag === "string") l.tags.add(leaf.tag);
          break;
        case "calc":
        case "stock":
        case "incapacitated":
        case "obligation":
          l.indicator = true; // деньги, склад, статус персонажа и заказы игроку видны всегда
          break;
        case "data":
          if (typeof leaf.value === "string") {
            if (ix.vars.has(leaf.value)) l.vars.add(leaf.value);
            if (ix.mods.has(leaf.value)) l.mods.add(leaf.value);
          }
          break;
      }
    });
}

function eventConds(ev: Record<string, any>): unknown[] {
  const out: unknown[] = [];
  if (isObj(ev.trigger)) out.push(...arr(ev.trigger.conditions));
  if (isObj(ev.participant) && ev.participant.where != null) out.push(ev.participant.where);
  return out;
}

function launchOf(ix: PackIndex, s: EffectSite["scope"], l: Launch, seen: Set<string>): void {
  if (seen.has(s.key)) return;
  seen.add(s.key);
  const callers = (pred: (x: EffectSite) => boolean) => {
    for (const site of ix.effects) if (pred(site)) launchOf(ix, site.scope, l, seen);
  };
  switch (s.kind) {
    case "event": {
      const ev = ix.events.get(s.id);
      if (!ev) return;
      collectConds(ix, l, eventConds(ev));
      if (!isObj(ev.trigger)) callers((x) => x.type === "run_event" && x.e.event === s.id);
      return;
    }
    case "option": {
      const of = ix.offers.get(s.offer ?? "");
      const opt = arr(of?.options).find((o) => isObj(o) && o.id === s.option);
      if (isObj(opt)) collectConds(ix, l, [opt.open_when, opt.enabled_when]);
      callers((x) => x.type === "show_offer" && x.e.offer === s.offer);
      return;
    }
    case "modifier":
      l.mods.add(s.id);
      return;
    case "obligation":
    case "action":
      l.indicator = true; // обязательство в окне заказов, действие выбирает сам игрок
      return;
  }
}

export function checkForeshadow(p: Problems, ix: PackIndex, r: Reach): void {
  const varVisible = (id: string): boolean => {
    const v = ix.vars.get(id);
    if (!v) return false;
    if (v.visible === undefined || v.visible === null) return true;
    if (v.visible === false) return false;
    return r.sat(v.visible);
  };
  const modVisible = (id: string): boolean => {
    const m = ix.mods.get(id);
    return !!m && m.visible !== false;
  };

  for (const s of ix.effects) {
    if (s.type !== "end_game" || s.e.tag !== "fail") continue;
    const l: Launch = { vars: new Set(), mods: new Set(), tags: new Set(), indicator: false };
    launchOf(ix, s.scope, l, new Set());
    for (const tag of l.tags) for (const [mid, m] of ix.mods) if (arr(m.tags).includes(tag)) l.mods.add(mid);
    if (l.indicator) continue;
    if ([...l.vars].some(varVisible) || [...l.mods].some(modVisible)) continue;
    // другое достижимое событие-предупреждение на те же переменные/модификаторы
    let warned = false;
    for (const [eid, ev] of ix.events) {
      if (s.scope.kind === "event" && eid === s.scope.id) continue;
      if (!r.events.has(eid)) continue;
      const sites = ix.sitesOf(`event:${eid}`);
      if (!sites.some((x) => x.type === "notify" || x.type === "show_offer")) continue;
      const w: Launch = { vars: new Set(), mods: new Set(), tags: new Set(), indicator: false };
      collectConds(ix, w, eventConds(ev));
      for (const tag of w.tags) for (const [mid, m] of ix.mods) if (arr(m.tags).includes(tag)) w.mods.add(mid);
      if ([...w.vars].some((v) => l.vars.has(v)) || [...w.mods].some((m) => l.mods.has(m))) {
        warned = true;
        break;
      }
    }
    if (warned) continue;
    const list: string[] = [];
    if (l.vars.size) list.push(`переменные: ${[...l.vars].join(", ")}`);
    if (l.mods.size) list.push(`модификаторы: ${[...l.mods].join(", ")}`);
    p.warn("W003", s.scope.file, s.scope.id, s.path,
      `поражение «${String(s.e.title)}» без видимого предвестника. ` +
      (list.length
        ? `Сделайте видимыми ${list.join("; ")} — или добавьте событие с notify/show_offer на те же условия.`
        : "В условиях запуска нет ни переменных, ни модификаторов: добавьте видимое условие-предвестник или событие-предупреждение."));
  }
}
