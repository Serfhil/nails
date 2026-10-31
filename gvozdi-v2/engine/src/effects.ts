// Эффекты (core.md 4.13): что меняется в мире.

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type { EffectDef, LineKind } from "./types.ts";
import type { Ref } from "./state.ts";
import { WORLD, charRef, refId, refKind } from "./state.ts";
import { resolveData, resolveDeep } from "./conditions.ts";
import { changeVar, rawOf, resolveSubject, setRaw, type Ctx } from "./vars.ts";
import { addModifier, removeModifiers } from "./modifiers.ts";
import { queueEvent, textVars } from "./events.ts";
import {
  addCharacter, addToPool, addWorkshop, destroyItem, giveItem, hire, itemsOfChar, removeCharacter, removeWorkshop,
  replaceWorkshop, workers, equipmentOf, inventory,
} from "./workforce.ts";
import { showOffer, pushPopup } from "./offers.ts";
import { addGoods } from "./market.ts";

/** Цель эффекта → список сущностей. */
export function resolveTargets(e: Engine, target: string | undefined, ctx: Ctx): Ref[] {
  const t = target ?? "self";
  if (t === "all_workers") return workers(e).map((c) => charRef(c.id));
  const r = resolveSubject(e, t, ctx);
  return r && e.exists(r) ? [r] : [];
}

const KINDS: LineKind[] = ["info", "good", "warn", "danger", "seal"];

export function applyEffects(e: Engine, list: EffectDef[] | undefined, ctx: Ctx): void {
  for (const eff of list ?? []) {
    if (e.s.ending) return;
    try {
      applyEffect(e, eff, ctx);
    } catch (err) {
      e.error(`эффект ${eff.type}: ${(err as Error).message}`);
    }
  }
}

function num(e: Engine, v: any, ctx: Ctx, def = 0): number {
  const x = resolveData(e, v, ctx);
  return typeof x === "number" && Number.isFinite(x) ? x : def;
}

function applyEffect(e: Engine, eff: EffectDef, ctx: Ctx): void {
  const source = ctx.source ?? (ctx.event ? `event:${ctx.event}` : "event:unknown");
  switch (eff.type) {
    case "var": {
      for (const ref of resolveTargets(e, eff.target ?? "world", ctx)) {
        if ("set" in eff && eff.set !== undefined) {
          const before = rawOf(e, ref, eff.var);
          setRaw(e, ref, eff.var, num(e, eff.set, ctx));
          const delta = norm(rawOf(e, ref, eff.var) - before);
          if (eff.var === "money" && ref === WORLD && delta) e.s.ledger.push({ source, amount: delta });
        } else {
          changeVar(e, ref, eff.var, num(e, eff.add, ctx), { source });
        }
      }
      return;
    }
    case "goods":
      addGoods(e, eff.good, num(e, eff.qty, ctx));
      return;
    case "add_modifier": {
      const data = resolveDeep(e, eff.data ?? {}, ctx);
      const duration = eff.duration ? resolveDeep(e, eff.duration, ctx) : null;
      for (const ref of resolveTargets(e, eff.target ?? "self", ctx)) addModifier(e, eff.template, ref, { duration, data });
      return;
    }
    case "remove_modifier": {
      const count = eff.count === undefined || eff.count === null ? undefined : num(e, eff.count, ctx);
      for (const ref of resolveTargets(e, eff.target ?? "self", ctx)) removeModifiers(e, ref, { template: eff.template, tag: eff.tag }, count);
      return;
    }
    case "give_item": {
      const t = eff.target ?? "hero";
      const targets = resolveTargets(e, t, ctx);
      if (!targets.length && t === "workshop") { giveItem(e, eff.item, null, ctx.replace); return; }
      for (const ref of targets) giveItem(e, eff.item, ref, ctx.replace);
      return;
    }
    case "remove": {
      const what = eff.what;
      for (const ref of resolveTargets(e, eff.target ?? "self", ctx)) {
        if (what === "character") {
          const c = e.charOf(ref);
          if (c && c.kind !== "hero") removeCharacter(e, c);
        } else if (what === "workshop") {
          if (refKind(ref) === "workshop") removeWorkshop(e, refId(ref));
        } else if (what === "item") {
          let pool = [] as ReturnType<typeof inventory>;
          if (refKind(ref) === "character") {
            const c = e.charOf(ref)!;
            pool = itemsOfChar(e, c);
            if (ref === e.heroRef) pool = [...pool, ...inventory(e)];
          } else if (refKind(ref) === "workshop") pool = equipmentOf(e, refId(ref));
          else if (refKind(ref) === "item") pool = e.s.items.filter((i) => `item:${i.id}` === ref);
          else pool = e.s.items.slice();
          const it = pool.find((i) => !eff.item || i.type === eff.item);
          if (it) destroyItem(e, it);
        }
      }
      return;
    }
    case "hire": {
      const t = String(eff.target ?? "candidate");
      if (t.startsWith("char:")) { hire(e, t.slice(5)); return; }
      const r = resolveSubject(e, t, ctx);
      if (r && refKind(r) === "character") hire(e, refId(r));
      else if (t === "candidate" && ctx.candidate) hire(e, refId(ctx.candidate));
      return;
    }
    case "add_to_hire_pool":
      addToPool(e, eff.character);
      return;
    case "add_character":
      addCharacter(e, eff.character, eff.as);
      return;
    case "add_workshop":
      addWorkshop(e, eff.workshop);
      return;
    case "replace_workshop": {
      for (const ref of resolveTargets(e, eff.target ?? "workshop", ctx)) {
        if (refKind(ref) === "workshop") replaceWorkshop(e, refId(ref), eff.workshop, eff.transfer);
      }
      return;
    }
    case "notify": {
      const text = e.fill(String(eff.text ?? ""), textVars(e, ctx));
      const kind: LineKind = KINDS.includes(eff.kind) ? eff.kind : "info";
      e.notify(text, kind);
      if (eff.popup) pushPopup(e, text);
      return;
    }
    case "show_offer": {
      const data = resolveDeep(e, eff.data ?? {}, ctx);
      showOffer(e, eff.offer, { ...(ctx.data ?? {}), ...data }, ctx.participant ?? null);
      return;
    }
    case "run_event": {
      const data = { ...(resolveDeep(e, eff.data ?? {}, ctx) as Record<string, any>) };
      let part: Ref | null = null;
      if (eff.participant) {
        const r = resolveSubject(e, eff.participant, ctx);
        if (r) part = r;
      } else if (ctx.participant && !e.idx.events.get(eff.event)?.participant) part = ctx.participant;
      queueEvent(e, eff.event, data, part);
      return;
    }
    case "end_game": {
      const tag = eff.tag === "goal" || eff.tag === "fail" ? eff.tag : null;
      const vars = textVars(e, ctx);
      e.s.ending = { title: e.fill(String(eff.title ?? ""), vars), text: e.fill(String(eff.text ?? ""), vars), tag };
      e.s.endings.push({ title: e.s.ending.title, tag, day: e.s.day });
      e.touch();
      return;
    }
    default:
      e.error(`неизвестный эффект ${eff.type}`);
  }
}
