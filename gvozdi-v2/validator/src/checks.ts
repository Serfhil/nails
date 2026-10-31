// Семантические проверки: V002–V009, V011–V014, W002, W004–W009.
import type { Ref, RefKind } from "./types.ts";
import type { EffectSite, PackIndex } from "./index-pack.ts";
import { walkCond, walkData } from "./index-pack.ts";
import { DataContexts } from "./data.ts";
import { Problems, arr, didYouMean, isObj, joinPath, num, placeholders, recId, str } from "./util.ts";

// ---------------- V002 дубликаты ----------------
export function checkDuplicates(p: Problems, pack: Record<string, any>): void {
  const files = ["variables", "modifiers", "goods", "items", "workshops", "characters", "actions", "categories", "events", "offers"];
  for (const f of files) {
    const seen = new Map<string, number>();
    arr(pack[f]).forEach((r, i) => {
      if (!isObj(r) || typeof r.id !== "string") return;
      if (seen.has(r.id))
        p.err("V002", `${f}.json`, r.id, `[${i}]`, `id «${r.id}» уже объявлен в записи [${seen.get(r.id)}] этого файла. Переименуйте одну из записей.`);
      else seen.set(r.id, i);
    });
  }
  arr(pack.variables).forEach((v, i) => {
    if (!isObj(v)) return;
    const seen = new Set<string>();
    arr(v.ladder).forEach((s, k) => {
      if (!isObj(s) || typeof s.id !== "string") return;
      if (seen.has(s.id)) p.err("V002", "variables.json", recId(v, i), `ladder[${k}].id`, `ступень «${s.id}» уже есть в этой лестнице. id ступеней одной лестницы должны различаться.`);
      seen.add(s.id);
    });
  });
  const obSeen = new Map<string, string>();
  arr(pack.offers).forEach((o, i) => {
    if (!isObj(o)) return;
    const seen = new Set<string>();
    arr(o.options).forEach((opt, k) => {
      if (!isObj(opt)) return;
      if (typeof opt.id === "string") {
        if (seen.has(opt.id)) p.err("V002", "offers.json", recId(o, i), `options[${k}].id`, `вариант «${opt.id}» уже есть в этом предложении. id вариантов одного предложения должны различаться.`);
        seen.add(opt.id);
      }
      const ob = opt.obligation;
      if (isObj(ob) && typeof ob.id === "string") {
        const where = `${recId(o, i)}.${str(opt.id) ?? k}`;
        if (obSeen.has(ob.id))
          p.err("V002", "offers.json", recId(o, i), `options[${k}].obligation.id`, `обязательство «${ob.id}» уже объявлено в ${obSeen.get(ob.id)}. id обязательств должны быть уникальны.`);
        else obSeen.set(ob.id, where);
      }
    });
  });
}

// ---------------- V003 ссылки ----------------
const KIND_TEXT: Record<RefKind, (v: string, extra?: string) => string> = {
  variable: (v) => `переменная «${v}» не объявлена в variables.json.`,
  modifier: (v) => `модификатор «${v}» не объявлен в modifiers.json.`,
  modtag: (v) => `ни у одного модификатора в modifiers.json нет тега «${v}».`,
  good: (v) => `товар «${v}» не объявлен в goods.json.`,
  item: (v) => `предмет «${v}» не объявлен в items.json.`,
  workshop: (v) => `мастерская «${v}» не объявлена в workshops.json.`,
  character: (v) => `персонаж «${v}» не объявлен в characters.json.`,
  action: (v) => `действие «${v}» не объявлено в actions.json.`,
  category: (v) => `категория «${v}» не объявлена в categories.json (файл необязателен, но если у действия есть category, категория должна быть в нём).`,
  event: (v) => `событие «${v}» не объявлено в events.json.`,
  offer: (v) => `предложение «${v}» не объявлено в offers.json.`,
  option: (v, o) => `у предложения «${o}» нет варианта «${v}».`,
  obligation: (v) => `обязательство «${v}» не объявлено ни в одном варианте offers.json.`,
  pool: (v) => `пул «${v}» не объявлен в pack.json → settings.pools.`,
  slot: (v) => `слот «${v}» не объявлен ни у одного персонажа (characters.json → slots).`,
};
const OWNER_TEXT: Record<string, string> = {
  character: "персонажа", workshop: "мастерской", item: "предмета", world: "мира",
};

export function checkRefs(p: Problems, ix: PackIndex, refs: Ref[]): void {
  const slots = new Set<string>();
  for (const c of ix.chars.values()) for (const s of arr(c.slots)) if (typeof s === "string") slots.add(s);
  const pools = new Set(isObj(ix.settings.pools) ? Object.keys(ix.settings.pools) : []);
  const sets: Partial<Record<RefKind, Set<string>>> = {
    variable: new Set(ix.vars.keys()), modifier: new Set(ix.mods.keys()), modtag: ix.modTags,
    good: new Set(ix.goods.keys()), item: new Set(ix.items.keys()), workshop: new Set(ix.workshops.keys()),
    character: new Set(ix.chars.keys()), action: new Set(ix.actions.keys()), category: new Set(ix.categories.keys()), event: new Set(ix.events.keys()),
    offer: new Set(ix.offers.keys()), obligation: new Set(ix.obligations.keys()), pool: pools, slot: slots,
  };
  // файл, где объявлены сущности этого вида: если его нет или он битый, ссылки не проверяем (уже есть V001)
  const KIND_FILE: Record<RefKind, string> = {
    variable: "variables", modifier: "modifiers", modtag: "modifiers", good: "goods", item: "items",
    workshop: "workshops", character: "characters", slot: "characters", action: "actions", category: "categories", event: "events",
    offer: "offers", option: "offers", obligation: "offers", pool: "pack",
  };
  const root = ix.pack as Record<string, unknown>;
  const fileOk = (k: RefKind) => {
    const v = root[KIND_FILE[k]];
    if (k === "category" && v === undefined) return true; // файла нет — множество категорий пусто
    return KIND_FILE[k] === "pack" ? isObj(v) : Array.isArray(v);
  };
  for (const r of refs) {
    let set: Set<string> | undefined;
    if (!fileOk(r.kind)) continue;
    if (r.kind === "option") {
      const of = ix.offers.get(r.extra ?? "");
      if (!of) continue; // само предложение уже отмечено
      set = new Set(arr(of.options).map((o) => (isObj(o) ? o.id : undefined)).filter((x): x is string => typeof x === "string"));
    } else set = sets[r.kind];
    if (!set) continue;
    if (!set.has(r.value)) {
      p.err("V003", r.file, r.id, r.path, KIND_TEXT[r.kind](r.value, r.extra) + didYouMean(r.value, set));
      continue;
    }
    if (r.kind === "variable" && r.extra) {
      const owner = ix.vars.get(r.value)?.owner;
      if (owner && owner !== r.extra)
        p.err("V003", r.file, r.id, r.path,
          `переменная «${r.value}» принадлежит ${OWNER_TEXT[owner] ?? owner} (owner: ${owner}), а здесь нужна переменная ${OWNER_TEXT[r.extra] ?? r.extra} (owner: ${r.extra}).`);
    }
  }
}

// ---------------- V004 зарезервированные переменные ----------------
export const RESERVED: Record<string, string> = {
  money: "world", stress: "character", speed: "character", defect: "character", learn_speed: "character",
  sell_price: "character", buy_price: "character", commission: "character", wage: "character", hire_cost: "character",
  household_expense: "world", world_sell_price: "world", world_buy_price: "world", max_workers: "workshop",
  equipment_slots: "workshop", upkeep: "workshop",
};

export function checkReserved(p: Problems, ix: PackIndex): void {
  for (const [id, owner] of Object.entries(RESERVED)) {
    const v = ix.declaredVars.get(id);
    if (!v) {
      if (id !== "money" && id !== "stress")
        p.err("V004", "variables.json", id, "", `не объявлена зарезервированная переменная «${id}» (owner: ${owner}). Добавьте её в variables.json.`);
      continue;
    }
    if (v.owner !== owner)
      p.err("V004", "variables.json", id, "owner", `зарезервированная переменная «${id}» должна иметь owner «${owner}», а не «${String(v.owner)}».`);
  }
}

// ---------------- V005 модификаторы ----------------
function targetType(target: unknown, siteScopeKind: string): string | undefined {
  if (typeof target !== "string") return undefined;
  if (target === "world") return "world";
  if (target === "workshop") return "workshop";
  if (target === "self") return undefined; // зависит от владельца/контекста
  if (["hero", "actor", "partner", "candidate", "participant", "all_workers"].includes(target) || target.startsWith("char:"))
    return "character";
  void siteScopeKind;
  return undefined;
}

export function modifierUses(ix: PackIndex): Map<string, { type: string; where: string }[]> {
  const uses = new Map<string, { type: string; where: string }[]>();
  const put = (t: unknown, type: string | undefined, where: string) => {
    if (typeof t !== "string" || !type) return;
    const l = uses.get(t) ?? [];
    l.push({ type, where });
    uses.set(t, l);
  };
  const srcTarget = (t: string, ownerType: string): string => {
    const tpl = ix.mods.get(t);
    if (tpl?.target === "hero") return "character";
    if (tpl?.target === "world") return "world";
    return ownerType;
  };
  for (const [id, it] of ix.items)
    for (const t of arr(it.modifiers))
      if (typeof t === "string") put(t, srcTarget(t, it.kind === "equipment" ? "workshop" : "character"), `предмет «${id}»`);
  for (const [id, w] of ix.workshops)
    for (const t of arr(w.modifiers)) if (typeof t === "string") put(t, srcTarget(t, "workshop"), `мастерская «${id}»`);
  for (const [id, c] of ix.chars)
    for (const t of arr(c.modifiers)) if (typeof t === "string") put(t, srcTarget(t, "character"), `персонаж «${id}»`);
  for (const [id, v] of ix.vars)
    for (const st of arr(v.ladder))
      if (isObj(st))
        for (const t of arr(st.modifiers))
          if (typeof t === "string" && typeof v.owner === "string") put(t, srcTarget(t, v.owner), `ступень «${String(st.id)}» переменной «${id}»`);
  for (const s of ix.effects)
    if (s.type === "add_modifier")
      put(s.e.template, targetType(s.e.target, s.scope.kind), `${s.scope.file} ${s.scope.id} ${s.path}`);
  return uses;
}

export function checkModifiers(p: Problems, ix: PackIndex): void {
  const uses = modifierUses(ix);
  for (const [id, m] of ix.mods) {
    const F = "modifiers.json";
    const isFlag = m.flag === true;
    if (isFlag) {
      if (m.var != null) p.err("V005", F, id, "var", "у флага (flag: true) не должно быть «var»: флаг — метка без var/op/value. Уберите var или flag.");
    } else {
      const missing: string[] = [];
      if (m.var == null) missing.push("var");
      if (m.op == null) missing.push("op");
      if (m.value == null && m.value_from == null) missing.push("value");
      if (missing.length)
        p.err("V005", F, id, "", `модификатор не флаг, но в нём нет: ${missing.join(", ")}. Добавьте их или пометьте \"flag\": true.`);
    }
    if (isObj(m.value_from) && typeof m.value_from.var === "string" && !ix.vars.has(m.value_from.var))
      p.err("V005", F, id, "value_from.var", `value_from ссылается на несуществующую переменную «${m.value_from.var}».` + didYouMean(m.value_from.var, ix.vars.keys()));
    if (m.direction != null && m.applies_to !== "change")
      p.err("V005", F, id, "direction", "direction имеет смысл только при \"applies_to\": \"change\". Добавьте applies_to: change или уберите direction.");
    const v = typeof m.var === "string" ? ix.vars.get(m.var) : undefined;
    if (v && typeof v.owner === "string") {
      for (const u of uses.get(id) ?? []) {
        if (u.type !== v.owner) {
          p.err("V005", F, id, "var",
            `переменная «${m.var}» принадлежит ${OWNER_TEXT[v.owner] ?? v.owner}, а модификатор накладывается на ${OWNER_TEXT[u.type] ?? u.type} (${u.where}). Смените var, target или место наложения.`);
          break;
        }
      }
    }
  }
}

// ---------------- V006 тексты ----------------
/** Обязательные ключи texts.json и допустимые подстановки (core.md 4.14, контракт 2.1). */
export const TEXT_KEYS: Record<string, string[]> = {
  reason_no_time: [], reason_cost: ["name", "need", "have"], reason_incapacitated: ["name"], reason_night: [],
  log_batch_done: ["worker", "item", "qty"], log_batch_defect: ["worker", "item"],
  log_sold: ["who", "item", "qty", "money"], log_bought: ["who", "item", "qty", "money"], log_hired: ["name"],
  log_expenses: ["total"], log_delivered: ["obligation"], log_declined: ["obligation"], log_failed: ["obligation"],
  stop_sunset: [], stop_offer: [], summary_title: [], source_sale: ["name"], source_purchase: ["name"],
  source_wage: ["name"], source_upkeep: ["name"], source_household: [], source_event: [], source_offer: [],
  source_obligation: [], source_action: [],
  assign_idle: [], assign_trade: [], reason_invalid: [], reason_not_available: [], reason_offer_pending: [],
  reason_game_over: [], reason_workers_full: ["name"], reason_trade_not_allowed: ["name"], reason_busy_slot: [],
  stop_game_over: [], popup_title: [], popup_ok: [], replace_warning: ["item", "old"],
};

export function checkServiceTexts(p: Problems, texts: unknown): void {
  if (!isObj(texts)) return;
  for (const [key, allowed] of Object.entries(TEXT_KEYS)) {
    const t = texts[key];
    if (t === undefined) {
      p.err("V006", "texts.json", key, "", `нет обязательного ключа «${key}»${allowed.length ? ` (подстановки: ${allowed.map((a) => `{${a}}`).join(", ")})` : ""}.`);
      continue;
    }
    if (typeof t !== "string") continue;
    for (const ph of placeholders(t))
      if (!allowed.includes(ph))
        p.err("V006", "texts.json", key, "", `неизвестная подстановка {${ph}}; для «${key}» доступны: ${allowed.length ? allowed.map((a) => `{${a}}`).join(", ") : "никаких"}.` + didYouMean(ph, allowed));
  }
  for (const key of Object.keys(texts))
    if (!(key in TEXT_KEYS))
      p.warn("W010", "texts.json", key, "", `неизвестный ключ «${key}» — движок его не читает.` + didYouMean(key, Object.keys(TEXT_KEYS)));
}

/** Тексты событий и предложений (V006) и $data-имена (W004). */
export function checkDataUse(p: Problems, ix: PackIndex): void {
  const dc = new DataContexts(ix);

  const textCheck = (ctx: string, text: unknown, file: string, id: string, path: string) => {
    if (typeof text !== "string") return;
    for (const ph of placeholders(text)) {
      if (ph === "participant" && dc.hasParticipant(ctx)) continue;
      const st = dc.status(ctx, ph);
      if (st === "none")
        p.err("V006", file, id, path, `подстановку {${ph}} не даёт ни участник, ни данные, ни data_defaults. Передайте «${ph}» в data (эффекта, события или предложения) или добавьте data_defaults.`);
      else if (st === "partial")
        p.warn("W004", file, id, path, `подстановку {${ph}} передают не все источники, а data_defaults для неё нет. Добавьте «${ph}» в data_defaults.`);
    }
  };
  const dataCheck = (ctx: string, value: unknown, file: string, id: string, path: string) => {
    walkData(value, path, (name, at) => {
      const st = dc.status(ctx, name);
      if (st === "none")
        p.warn("W004", file, id, at, `$data «${name}» не передаёт ни один источник и нет data_defaults — при выполнении будет ошибка. Передайте «${name}» в data или добавьте data_defaults.`);
      else if (st === "partial")
        p.warn("W004", file, id, at, `$data «${name}» передают не все источники, а data_defaults нет. Добавьте «${name}» в data_defaults.`);
    });
  };

  for (const s of ix.effects) {
    const ctx = s.scope.dataKey;
    const textual = s.scope.kind === "event" || s.scope.kind === "option" || s.scope.kind === "obligation";
    if (textual && s.type === "notify") textCheck(ctx, s.e.text, s.scope.file, s.scope.id, joinPath(s.path, "text"));
    if (textual && s.type === "end_game") {
      textCheck(ctx, s.e.title, s.scope.file, s.scope.id, joinPath(s.path, "title"));
      textCheck(ctx, s.e.text, s.scope.file, s.scope.id, joinPath(s.path, "text"));
    }
    dataCheck(ctx, s.e, s.scope.file, s.scope.id, s.path);
  }
  for (const c of ix.conds) {
    if (!c.dataKey) continue;
    walkCond(c.cond, (leaf) => {
      if (leaf.type === "data") return;
      dataCheck(c.dataKey!, leaf, c.file, c.id, c.path);
    });
  }
  for (const [oid, of] of ix.offers) {
    const ctx = `offer:${oid}`;
    textCheck(ctx, of.title, "offers.json", oid, "title");
    textCheck(ctx, of.text, "offers.json", oid, "text");
    dataCheck(ctx, of.data, "offers.json", oid, "data");
    arr(of.options).forEach((opt, i) => {
      if (!isObj(opt)) return;
      const base = `options[${i}]`;
      textCheck(ctx, opt.label, "offers.json", oid, `${base}.label`);
      textCheck(ctx, opt.disabled_text, "offers.json", oid, `${base}.disabled_text`);
      dataCheck(ctx, opt.cost, "offers.json", oid, `${base}.cost`);
      const ob = opt.obligation;
      if (isObj(ob)) {
        const octx = `ob:${oid}#${str(opt.id) ?? `#${i}`}`;
        textCheck(octx, ob.title, "offers.json", oid, `${base}.obligation.title`);
        dataCheck(ctx, ob.data, "offers.json", oid, `${base}.obligation.data`);
        dataCheck(octx, ob.requires, "offers.json", oid, `${base}.obligation.requires`);
        dataCheck(octx, ob.deadline_days, "offers.json", oid, `${base}.obligation.deadline_days`);
      }
    });
  }
  for (const [aid, a] of ix.actions) {
    const ctx = `action:${aid}`;
    for (const f of ["cost", "outputs", "per_hour"]) dataCheck(ctx, a[f], "actions.json", aid, f);
  }
  for (const [mid, m] of ix.mods) {
    const ctx = `modifier:${mid}`;
    dataCheck(ctx, m.value, "modifiers.json", mid, "value");
    if (isObj(m.duration)) dataCheck(ctx, m.duration.n, "modifiers.json", mid, "duration.n");
  }
}

// ---------------- V007 лестницы ----------------
export function checkLadders(p: Problems, ix: PackIndex): void {
  for (const [id, v] of ix.declaredVars) {
    const ladder = arr(v.ladder);
    if (!ladder.length) continue;
    const min = num(v.min);
    const max = num(v.max);
    let prev: number | undefined;
    ladder.forEach((s, k) => {
      const at = isObj(s) ? num(s.at) : undefined;
      if (at === undefined) return;
      if (k === 0 && min !== undefined && at !== min)
        p.err("V007", "variables.json", id, "ladder[0].at", `у первой ступени at (${at}) должен быть равен min переменной (${min}).`);
      if (prev !== undefined && at <= prev)
        p.err("V007", "variables.json", id, `ladder[${k}].at`, `ступени должны идти по возрастанию at: ${at} не больше предыдущего ${prev}.`);
      if (max !== undefined && at > max)
        p.err("V007", "variables.json", id, `ladder[${k}].at`, `ступень at = ${at} за пределами max переменной (${max}) — до неё не дойти.`);
      prev = at;
    });
  }
}

// ---------------- V008 циклы без выхода ----------------
function effectiveDuration(ix: PackIndex, s: EffectSite): unknown {
  return s.e.duration ?? ix.mods.get(s.e.template)?.duration;
}

export function checkCycles(p: Problems, ix: PackIndex): void {
  const unconditionalEvent = (id: string): boolean => {
    const ev = ix.events.get(id);
    if (!ev) return false;
    // run_event запускает событие без проверки trigger.conditions (CONTRACT_ISSUES CI-007);
    // выход из цикла дают только ограничения repeat
    const r = isObj(ev.repeat) ? ev.repeat : {};
    if (r.max != null || r.cooldown_days != null) return false;
    return true;
  };
  const targetsOf = (sites: EffectSite[]): Set<string> => {
    const out = new Set<string>();
    for (const s of sites) {
      if (s.type === "run_event" && typeof s.e.event === "string" && unconditionalEvent(s.e.event)) out.add(`event:${s.e.event}`);
      if (s.type === "show_offer" && typeof s.e.offer === "string" && ix.offers.has(s.e.offer)) out.add(`offer:${s.e.offer}`);
      if (s.type === "add_modifier" && typeof s.e.template === "string") {
        const tpl = ix.mods.get(s.e.template);
        const d = effectiveDuration(ix, s);
        if (tpl && arr(tpl.on_expire).length && isObj(d) && d.kind === "days") out.add(`modifier:${s.e.template}`);
      }
    }
    return out;
  };
  const graph = new Map<string, Set<string>>();
  for (const id of ix.events.keys()) graph.set(`event:${id}`, targetsOf(ix.sitesOf(`event:${id}`)));
  for (const id of ix.mods.keys()) graph.set(`modifier:${id}`, targetsOf(ix.sitesOf(`modifier:${id}`)));
  for (const [id, of] of ix.offers) {
    const opts = arr(of.options).filter(isObj);
    let common: Set<string> | null = null;
    for (const [i, opt] of opts.entries()) {
      const t = targetsOf(ix.sitesOf(`option:${id}#${str(opt.id) ?? `#${i}`}`));
      const prev: Set<string> | null = common;
      common = prev === null ? t : new Set([...prev].filter((x: string) => t.has(x)));
    }
    graph.set(`offer:${id}`, common ?? new Set());
  }

  // Тарьян
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) strong(v);

  const label = (n: string) => {
    const [k, id] = n.split(":");
    return `${k === "event" ? "событие" : k === "offer" ? "предложение" : "модификатор"} «${id}»`;
  };
  for (const comp of sccs) {
    const self = comp.length === 1 && graph.get(comp[0])!.has(comp[0]);
    if (comp.length < 2 && !self) continue;
    comp.reverse();
    const head = comp.find((n) => n.startsWith("event:")) ?? comp[0];
    const [kind, id] = head.split(":");
    const file = kind === "event" ? "events.json" : kind === "offer" ? "offers.json" : "modifiers.json";
    p.err("V008", file, id, "",
      `цикл без выхода: ${comp.map(label).join(" → ")} → ${label(comp[0])} запускают друг друга безусловно. ` +
      "Добавьте условие запуска (trigger.conditions), repeat.max/cooldown_days или вариант выбора, который разрывает цепочку.");
  }
}

// ---------------- V009 негатив без снятия ----------------
/** Направление действия модификатора на переменную: +1 вверх, −1 вниз, 0 — неизвестно. */
function modDirection(m: Record<string, any>): number {
  const val = num(m.value);
  if (val === undefined || m.value_from != null) return 0;
  const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const op = m.op;
  if (m.applies_to === "change") {
    if (op === "add") return sign(val);
    const amp = sign(op === "mult" ? val - 1 : val);
    if (m.direction === "gain") return amp;
    if (m.direction === "loss") return -amp;
    return 0;
  }
  return op === "mult" ? sign(val - 1) : sign(val);
}

export function isNegative(ix: PackIndex, m: Record<string, any>): boolean {
  if (m.incapacitates === true) return true;
  if (m.flag === true || typeof m.var !== "string") return false;
  const dir = modDirection(m);
  if (!dir) return false;
  const goodDown = ix.vars.get(m.var)?.good === "down";
  return goodDown ? dir > 0 : dir < 0;
}

/** Условие, которое, став истинным, уже не станет ложным (день и счётчики только растут). */
export function cannotBecomeFalse(c: unknown): boolean {
  if (c === undefined || c === null || c === true) return true;
  if (!isObj(c)) return false;
  if (Array.isArray(c.all)) return c.all.every(cannotBecomeFalse);
  if (Array.isArray(c.any)) return c.any.some(cannotBecomeFalse);
  if ("not" in c) return false;
  if ((c.type === "day" || c.type === "event_count") && (c.op === ">=" || c.op === ">")) return true;
  if (c.type === "obligation" && ["done", "failed", "declined"].includes(c.state)) return true;
  return false;
}

function permanentDuration(d: unknown): boolean {
  if (d === undefined || d === null) return true; // срок не задан — вечный
  if (!isObj(d)) return false;
  if (d.kind === "forever") return true;
  if (d.kind === "while") return cannotBecomeFalse(d.condition);
  return false;
}

export function checkPermanentNegative(p: Problems, ix: PackIndex): void {
  const removedTemplates = new Set<string>();
  const removedTags = new Set<string>();
  for (const s of ix.effects)
    if (s.type === "remove_modifier") {
      if (typeof s.e.template === "string") removedTemplates.add(s.e.template);
      if (typeof s.e.tag === "string") removedTags.add(s.e.tag);
    }
  const applied = new Map<string, EffectSite[]>();
  for (const s of ix.effects)
    if (s.type === "add_modifier" && typeof s.e.template === "string") {
      const l = applied.get(s.e.template) ?? [];
      l.push(s);
      applied.set(s.e.template, l);
    }
  for (const [id, m] of ix.mods) {
    if (m.may_be_permanent === true || !isNegative(ix, m)) continue;
    if (removedTemplates.has(id) || arr(m.tags).some((t) => removedTags.has(t))) continue;
    const site = (applied.get(id) ?? []).find((s) => permanentDuration(effectiveDuration(ix, s)));
    if (!site) continue;
    p.err("V009", "modifiers.json", id, "duration",
      `негативный модификатор вечен (${site.e.duration ? `срок задан в ${site.scope.file} ${site.scope.id} ${site.path}` : "срок шаблона"}) и ничем не снимается. ` +
      "Добавьте эффект remove_modifier (по template или tag), срок days или \"may_be_permanent\": true.");
  }
}

// ---------------- слоты, лавка, оборудование (контракт 2.1) ----------------
export function checkSlotsAndEquipment(p: Problems, ix: PackIndex): void {
  const names = isObj(ix.meta.names) && isObj(ix.meta.names.slots) ? ix.meta.names.slots : {};
  const reported = new Set<string>();
  const need = (slot: unknown, file: string, id: string, path: string) => {
    if (typeof slot !== "string" || reported.has(slot) || typeof names[slot] === "string") return;
    reported.add(slot);
    p.err("V003", file, id, path, `у слота «${slot}» нет названия для игрока: добавьте его в pack.json → names.slots: "${slot}": "<название>".`);
  };
  const packOk = isObj((ix.pack as Record<string, unknown>).pack);
  if (packOk) {
    for (const [id, c] of ix.chars) arr(c.slots).forEach((s, i) => need(s, "characters.json", id, `slots[${i}]`));
    for (const [id, it] of ix.items) if (it.kind === "tool") need(it.slot, "items.json", id, "slot");
  }
  arr(ix.settings.shop).forEach((it, i) => {
    if (typeof it === "string" && ix.items.get(it)?.kind === "equipment")
      p.err("V003", "pack.json", str(ix.meta.id) ?? "pack", `settings.shop[${i}]`, `«${it}» — оборудование, а в лавке рынка только инструменты (core.md 3.6). Продавайте его действием с эффектом give_item в мастерскую.`);
  });
  for (const s of ix.effects) {
    if (s.type !== "give_item" || typeof s.e.item !== "string") continue;
    const kind = ix.items.get(s.e.item)?.kind;
    const target = s.e.target ?? "hero";
    if (kind === "equipment" && target !== "workshop")
      p.err("V001", s.scope.file, s.scope.id, joinPath(s.path, "target"), `оборудование «${s.e.item}» ставится только в мастерскую: "target": "workshop" (в инвентарь героя оборудование не попадает, core.md 3.7).`);
    if (kind === "tool" && target === "workshop")
      p.err("V001", s.scope.file, s.scope.id, joinPath(s.path, "target"), `«${s.e.item}» — инструмент, его нельзя поставить в мастерскую. Выдайте его персонажу (например, "target": "hero").`);
  }
}

// ---------------- V011–V014 ----------------
export function checkOffers(p: Problems, ix: PackIndex): void {
  for (const [id, of] of ix.offers) {
    const n = arr(of.options).length;
    if (Array.isArray(of.options) && (n < 1 || n > 4))
      p.err("V011", "offers.json", id, "options", `вариантов ${n}, а должно быть от 1 до 4.`);
    const bd = num(of.board_days);
    if (bd !== undefined && bd < 1) p.err("V011", "offers.json", id, "board_days", `board_days = ${bd}, должно быть не меньше 1.`);
    arr(of.options).forEach((opt, i) => {
      if (!isObj(opt) || !isObj(opt.obligation)) return;
      if (!Array.isArray(opt.obligation.requires) || !opt.obligation.requires.length)
        p.err("V011", "offers.json", id, `options[${i}].obligation.requires`, "у обязательства нет requires — нечего сдавать. Укажите, что сдать (товары или переменные).");
    });
  }
}

export function checkEndGameTags(p: Problems, ix: PackIndex): void {
  for (const s of ix.effects)
    if (s.type === "end_game" && s.e.tag == null)
      p.err("V012", s.scope.file, s.scope.id, joinPath(s.path, "tag"), "у end_game нет метки tag. Укажите \"tag\": \"goal\" (желательный исход) или \"fail\" (нежелательный).");
}

export function checkNumbers(p: Problems, ix: PackIndex): void {
  const qtyLine = (list: unknown, file: string, id: string, base: string) =>
    arr(list).forEach((l, i) => {
      if (!isObj(l)) return;
      const q = num(l.qty);
      if (q !== undefined && q <= 0) p.err("V013", file, id, `${base}[${i}].qty`, `qty = ${q}; количество в расходе и выходах должно быть больше 0.`);
    });
  for (const [id, g] of ix.goods) {
    const pr = num(g.price);
    if (pr !== undefined && pr < 0) p.err("V013", "goods.json", id, "price", `отрицательная цена ${pr}.`);
  }
  for (const [id, it] of ix.items) {
    const pr = num(it.price);
    if (pr !== undefined && pr < 0) p.err("V013", "items.json", id, "price", `отрицательная цена ${pr}.`);
  }
  const defect = ix.declaredVars.get("defect");
  const ds = num(defect?.start);
  if (ds !== undefined && (ds < 0 || ds > 1)) p.err("V013", "variables.json", "defect", "start", `defect = ${ds} вне 0..1 (это вероятность брака).`);
  for (const [id, c] of ix.chars) {
    const d = isObj(c.vars) ? num(c.vars.defect) : undefined;
    if (d !== undefined && (d < 0 || d > 1)) p.err("V013", "characters.json", id, "vars.defect", `defect = ${d} вне 0..1 (это вероятность брака).`);
  }
  for (const [id, a] of ix.actions) {
    const h = num(a.hours);
    if (h !== undefined && h <= 0) p.err("V013", "actions.json", id, "hours", `hours = ${h}; длительность действия должна быть больше 0.`);
    qtyLine(a.cost, "actions.json", id, "cost");
    qtyLine(a.outputs, "actions.json", id, "outputs");
  }
  for (const [id, of] of ix.offers)
    arr(of.options).forEach((opt, i) => {
      if (!isObj(opt)) return;
      qtyLine(opt.cost, "offers.json", id, `options[${i}].cost`);
      if (isObj(opt.obligation)) qtyLine(opt.obligation.requires, "offers.json", id, `options[${i}].obligation.requires`);
    });
}

export function checkStart(p: Problems, ix: PackIndex): void {
  const start = ix.meta.start;
  if (!isObj(start) || typeof start.event !== "string") return; // схема уже отметила
  const ev = ix.events.get(start.event);
  const packId = str(ix.meta.id) ?? "pack";
  if (!ev) {
    p.err("V014", "pack.json", packId, "start.event", `стартовое событие «${start.event}» не объявлено в events.json.` + didYouMean(start.event, ix.events.keys()));
    return;
  }
  if (!isObj(ev.trigger) || ev.trigger.signal !== "game_start")
    p.err("V014", "pack.json", packId, "start.event", `стартовое событие «${start.event}» не запускается сигналом game_start. Задайте ему "trigger": {"signal": "game_start"}.`);
}

// ---------------- предупреждения W005–W009 ----------------
/** Сигналы, которые бывают каждый час (validator.md W005). */
const HOURLY_SIGNALS = ["action_done", "batch_defect", "idle_no_cost", "became_visible"];

export function checkEventWarnings(p: Problems, ix: PackIndex): void {
  const marketHours = num(ix.settings.market_hours);
  for (const [id, ev] of ix.events) {
    const r = isObj(ev.repeat) ? ev.repeat : {};
    const limited = r.max != null || r.cooldown_days != null;
    const t0 = isObj(ev.trigger) ? ev.trigger : undefined;
    const hourly = !!t0 && (t0.signal == null || HOURLY_SIGNALS.includes(t0.signal));
    if (ev.stops_time === true && !limited && hourly)
      p.warn("W005", "events.json", id, "stops_time", "событие останавливает время, но без repeat — может останавливать work_until_stop каждый час. Задайте repeat.max или repeat.cooldown_days.");
    const t = isObj(ev.trigger) ? ev.trigger : undefined;
    if (t && t.signal == null && !limited) {
      const conds = arr(t.conditions);
      const endsGame = ix.sitesOf(`event:${id}`).some((s) => s.type === "end_game");
      const once = conds.length > 0 && conds.every(cannotBecomeFalse);
      let selfGuard = false;
      for (const c of conds)
        walkCond(c, (leaf, neg) => {
          if (leaf.type === "event_count" && leaf.event === id && !neg && ["<", "<=", "=="].includes(leaf.op)) selfGuard = true;
        });
      if (!endsGame && !once && !selfGuard)
        p.warn("W006", "events.json", id, "repeat", "событие по условию без repeat.max и cooldown_days: условие может становиться истинным снова и снова. Задайте repeat.max или repeat.cooldown_days.");
    }
    if (t && marketHours !== undefined)
      arr(t.conditions).forEach((c, i) =>
        walkCond(c, (leaf) => {
          const v = num(leaf.value);
          if (leaf.type === "calc" && leaf.name === "cost_hours" && v !== undefined && v < marketHours)
            p.warn("W008", "events.json", id, `trigger.conditions[${i}]`, `порог cost_hours (${v}) меньше settings.market_hours (${marketHours}) — игрок не успеет закупиться. Возьмите порог не меньше ${marketHours}.`);
        }));
  }
}

export function checkActionWarnings(p: Problems, ix: PackIndex): void {
  for (const [id, a] of ix.actions) {
    if (a.mode !== "assignable" && a.mode !== "both") continue;
    if (!arr(a.cost).length && !arr(a.outputs).length && !arr(a.per_hour).length && !arr(a.effects).length)
      p.warn("W007", "actions.json", id, "", "поручение без расхода, выходов, начислений и эффектов — работник будет занят впустую.");
  }
}

export function checkGoalExists(p: Problems, ix: PackIndex): void {
  if (!ix.effects.some((s) => s.type === "end_game" && s.e.tag === "goal"))
    p.warn("W009", "events.json", "-", "", "в паке нет ни одного end_game с tag: \"goal\" — игроку нечего добиваться.");
}

/** Где «используется» сущность (для W002 и чтобы не дублировать V010). */
export function usage(ix: PackIndex): { mods: Set<string>; offers: Set<string>; items: Set<string>; events: Set<string> } {
  const mods = new Set<string>();
  const offers = new Set<string>();
  const items = new Set<string>();
  const events = new Set<string>();
  for (const s of ix.effects) {
    if (s.type === "add_modifier") mods.add(s.e.template);
    if (s.type === "show_offer") offers.add(s.e.offer);
    if (s.type === "give_item") items.add(s.e.item);
    if (s.type === "run_event") events.add(s.e.event);
  }
  for (const map of [ix.items, ix.workshops, ix.chars]) for (const r of map.values()) for (const t of arr(r.modifiers)) mods.add(t);
  for (const v of ix.vars.values()) for (const st of arr(v.ladder)) if (isObj(st)) for (const t of arr(st.modifiers)) mods.add(t);
  for (const it of arr(ix.settings.shop)) items.add(it);
  for (const [id, ev] of ix.events) if (isObj(ev.trigger)) events.add(id);
  const se = ix.meta.start?.event;
  if (typeof se === "string") events.add(se);
  return { mods, offers, items, events };
}

export function checkUnused(p: Problems, ix: PackIndex): void {
  const u = usage(ix);
  for (const id of ix.mods.keys())
    if (!u.mods.has(id)) p.warn("W002", "modifiers.json", id, "", "шаблон модификатора нигде не накладывается (нет add_modifier, предмета, мастерской, персонажа или ступени с ним).");
  for (const id of ix.offers.keys())
    if (!u.offers.has(id)) p.warn("W002", "offers.json", id, "", "предложение нигде не показывается (нет эффекта show_offer с ним).");
  for (const id of ix.items.keys())
    if (!u.items.has(id)) p.warn("W002", "items.json", id, "", "предмет нигде не выдаётся (нет give_item и его нет в settings.shop).");
  for (const id of ix.events.keys())
    if (!u.events.has(id)) p.warn("W002", "events.json", id, "", "событие без trigger и ни один run_event его не запускает.");
  const usedCats = new Set<string>();
  for (const a of ix.actions.values()) if (typeof a.category === "string") usedCats.add(a.category);
  for (const id of ix.categories.keys())
    if (!usedCats.has(id)) p.warn("W002", "categories.json", id, "", "категория без действий — ни у одного действия нет category с этим id. Назначьте её действиям или удалите.");
}
