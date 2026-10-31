// Интеграция, круг 1: числа в виде и в готовых строках — без шума плавающей точки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createGame, loadGame } from "../src/index.ts";
import type { Command, Game, Pack, View } from "../src/index.ts";
import { HERO, ROOT, fixture, loadPackDir, ok, quietFixture, rawVar, withStart } from "./helpers.ts";

const NOISE = /\d\.\d*(0000000|9999999)\d/;

/** Все числа вида — не длиннее 9 знаков после запятой; в строках нет хвостов вроде 74.00000000000003. */
function assertClean(v: unknown, path = "view"): void {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return;
    const s = String(v);
    assert.ok(!/\.\d{10,}/.test(s) && !/e-/.test(s), `${path} = ${s}`);
    return;
  }
  if (typeof v === "string") {
    assert.ok(!NOISE.test(v), `${path} = «${v}»`);
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => assertClean(x, `${path}[${i}]`)); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) assertClean(x, `${path}.${k}`);
}

test("круг 1: изменения через pct и сложение долей дают чистые значения", () => {
  const p = withStart(quietFixture(), [{ type: "add_modifier", template: "burn_scar", target: "hero" }]);
  const g = createGame(p, 1);
  // 0.05 + 0.1 (неумеха) = 0.15 без хвоста
  const defect = () => g.view().characters[0].vars.find((x) => x.id === "defect")!.value;
  assert.equal(defect(), 0.15);
  for (let i = 0; i < 3; i++) ok(g, { type: "do_action", action: "bake_bread", actor: "baker" });
  // +4 × 1.1 трижды: 13.2, а не 13.200000000000001
  assert.equal(rawVar(g, HERO, "stress"), 13.2);
  assert.equal(g.view().stress!.value, 13.2);
  assertClean(g.view());
  // сохранение и загрузка не ломаются
  const g2 = loadGame(p, g.save());
  assert.deepEqual(g2.view(), g.view());
});

function walk(pack: Pack, seed: number, steps: number): Game {
  const g = createGame(pack, seed);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  let v: View = g.view();
  assertClean(v);
  for (let i = 0; i < steps && !v.ending; i++) {
    let cmd: Command;
    if (v.pending_offer) {
      const o = v.pending_offer.options.filter((x) => x.enabled);
      cmd = { type: "choose_option", offer: v.pending_offer.id, option: o[Math.floor(rnd() * o.length)].id };
    } else if (v.meta.is_night) cmd = { type: "sleep" };
    else {
      const r = rnd();
      const acts = v.actions.filter((a) => a.enabled && a.mode !== "assignable");
      const assignable = v.characters.flatMap((c) => c.assignable.filter((a) => a.enabled).map((a) => ({ c: c.id, a })));
      if (r < 0.3) cmd = { type: "work_until_stop" };
      else if (r < 0.4 && v.market.enabled) {
        const buy: Record<string, number> = {};
        for (const x of v.market.raw) buy[x.id] = 1 + Math.floor(rnd() * 5);
        cmd = { type: "market_trip", buy_raw: buy, buy_items: [] };
      } else if (r < 0.55 && assignable.length) {
        const x = assignable[Math.floor(rnd() * assignable.length)];
        cmd = { type: "set_assignment", character: x.c, assignment: x.a.assignment as any };
      } else if (r < 0.62 && v.board.length) cmd = { type: "choose_option", offer: v.board[0].id, option: v.board[0].options[0].id };
      else if (r < 0.66 && v.obligations.some((o) => o.can_deliver)) cmd = { type: "deliver", obligation: v.obligations.find((o) => o.can_deliver)!.id };
      else if (r < 0.9 && acts.length) {
        const a = acts[Math.floor(rnd() * acts.length)];
        cmd = { type: "do_action", action: a.id, actor: a.roles.actor[0], partner: a.roles.partner?.find((x) => x !== a.roles.actor[0]), candidate: a.roles.candidate?.[0] };
      } else cmd = { type: "sleep" };
    }
    const res = g.perform(cmd);
    assertClean(res.events, "events");
    if (res.stop) assertClean(res.stop, "stop");
    if (res.error) assertClean(res.error, "error");
    v = res.view;
    assertClean(v);
  }
  return g;
}

test("круг 1: в виде и строках фикстуры нет шума плавающей точки (случайные прогоны)", () => {
  for (const seed of [1, 2, 3]) {
    const p = fixture();
    p.modifiers.find((m) => m.id === "burn_scar")!.value = 7; // дробные приросты
    walk(p, seed, 200);
  }
});

const NAILS = join(ROOT, "packs", "nails_for_count");
test("круг 1: в виде пака nails_for_count нет шума плавающей точки", { skip: !existsSync(join(NAILS, "pack.json")) }, () => {
  for (const seed of [1, 2, 3, 4]) walk(loadPackDir(NAILS), seed, 300);
});
