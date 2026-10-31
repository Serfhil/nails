// Тестовые помощники: чтение пака из папки (это тестовый код, не движок).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame } from "../src/index.ts";
import type { Command, Game, Pack, Result } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");
export const FIXTURE_DIR = join(ROOT, "fixtures", "mini-pack");

const FILES = ["pack", "variables", "modifiers", "goods", "items", "workshops", "characters", "actions", "categories", "events", "offers", "texts", "strategy_hints"];

export function loadPackDir(dir: string): Pack {
  const out: Record<string, unknown> = {};
  for (const f of FILES) {
    const p = join(dir, `${f}.json`);
    if (existsSync(p)) out[f] = JSON.parse(readFileSync(p, "utf8"));
  }
  return out as unknown as Pack;
}

/** Свежая копия фикстуры (можно менять в тесте). */
export function fixture(): Pack {
  return loadPackDir(FIXTURE_DIR);
}

/** Фикстура без случайных утренних событий (шанс пула 0). */
export function quietFixture(): Pack {
  const p = fixture();
  p.pack.settings.pools = { daily: { chance: 0 } };
  return p;
}

export function newGame(pack: Pack = quietFixture(), seed = 1): Game {
  return createGame(pack, seed);
}

export function ok(g: Game, cmd: Command): Result {
  const r = g.perform(cmd);
  if (!r.ok) throw new Error(`команда ${JSON.stringify(cmd)} не прошла: ${r.error?.code} ${r.error?.text}`);
  return r;
}

/** Ответить на все окна «сейчас» первым доступным вариантом. */
export function clearOffers(g: Game, prefer?: string): void {
  for (let i = 0; i < 20; i++) {
    const p = g.view().pending_offer;
    if (!p) return;
    const opt = p.options.find((o) => o.enabled && (!prefer || o.id === prefer)) ?? p.options.find((o) => o.enabled)!;
    ok(g, { type: "choose_option", offer: p.id, option: opt.id });
  }
}

export function sleep(g: Game): Result {
  clearOffers(g);
  const r = ok(g, { type: "sleep" });
  clearOffers(g);
  return r;
}

export function dbgEntity(g: Game, ref: string) {
  return g.debugView().entities.find((x) => x.ref === ref)!;
}

export function rawVar(g: Game, ref: string, v: string): number {
  return dbgEntity(g, ref).vars.find((x) => x.id === v)!.raw;
}

export function finalVar(g: Game, ref: string, v: string): number {
  return dbgEntity(g, ref).vars.find((x) => x.id === v)!.value;
}

export function money(g: Game): number {
  return g.view().money.value;
}

export function stock(g: Game, good: string): number {
  return g.debugView().stock[good]?.qty ?? 0;
}

/** Добавить эффекты в стартовое событие фикстуры. */
export function withStart(pack: Pack, effects: Record<string, unknown>[]): Pack {
  const ev = pack.events.find((x) => x.id === pack.pack.start.event)!;
  ev.effects = [...(ev.effects ?? []), ...(effects as any)];
  return pack;
}

export const HERO = "char:baker";

/** Сценарий команд, который проходит несколько дней и задевает многое. */
export function playScript(g: Game, days = 6): void {
  const inv = g.view().inventory;
  if (inv[0]) g.perform({ type: "equip", character: "baker", item: inv[0].item });
  g.perform({ type: "set_assignment", character: "baker", assignment: { kind: "action", action: "bake_bread" } });
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 6; i++) {
      const v = g.view();
      if (v.ending || v.meta.is_night) break;
      if (v.pending_offer) { clearOffers(g); continue; }
      const r = g.perform({ type: "work_until_stop" });
      if (r.stop?.reason === "event" && g.view().market.enabled) {
        g.perform({ type: "market_trip", buy_raw: { flour: 8 }, buy_items: [] });
      }
      const v2 = g.view();
      const hire = v2.actions.find((a) => a.id === "hire_helper");
      if (hire?.enabled && !v2.pending_offer) {
        g.perform({ type: "do_action", action: "hire_helper", actor: "baker", candidate: hire.roles.candidate![0] });
        const w = g.view().characters.find((c) => c.role === "worker" && c.workshop);
        if (w) g.perform({ type: "set_assignment", character: w.id, assignment: { kind: "action", action: "bake_bread" } });
      }
      for (const b of g.view().board) {
        if (!g.view().pending_offer) g.perform({ type: "choose_option", offer: b.id, option: b.options[0].id });
      }
      for (const o of g.view().obligations) if (o.can_deliver && !g.view().pending_offer) g.perform({ type: "deliver", obligation: o.id });
    }
    if (g.view().ending) return;
    clearOffers(g);
    g.perform({ type: "sleep" });
    clearOffers(g);
  }
}
