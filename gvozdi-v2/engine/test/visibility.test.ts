// Приёмка 6: в обычном виде нет ни одной скрытой сущности (случайные прогоны по фикстуре).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import type { Command, Game, View } from "../src/index.ts";
import { fixture } from "./helpers.ts";

const NEVER_VARS = ["learn_speed", "sell_price", "buy_price", "commission", "hire_cost"];
const pack = fixture();
const NEVER_MOD_NAMES = pack.modifiers.filter((m) => m.visible === false).map((m) => m.name);

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function heroLevel(g: Game): number {
  return g.debugView().entities.find((e) => e.ref === "char:baker")!.vars.find((v) => v.id === "bake_xp")!.level!;
}

function check(g: Game, v: View): void {
  const dbg = g.debugView();
  const lvl = heroLevel(g);
  // действия — только открытые
  for (const a of v.actions) assert.ok(dbg.actions.find((x) => x.id === a.id)!.open, `закрытое действие ${a.id} в виде`);
  // персонажи — только видимые
  for (const c of v.characters) {
    const ent = dbg.entities.find((e) => e.ref === `char:${c.id}`);
    if (ent) assert.equal(ent.extra.visible, true, `скрытый персонаж ${c.id}`);
    else assert.ok(dbg.hire_pool.includes(c.id));
    if (c.id === "cat") assert.ok((dbg.event_counts.cat_mischief ?? 0) >= 1);
    for (const vv of c.vars) {
      assert.ok(!NEVER_VARS.includes(vv.id), `скрытая переменная ${vv.id}`);
      if (vv.id === "pastry_xp") {
        const ll = ent!.vars.find((x) => x.id === "bake_xp")!.level!;
        assert.ok(ll >= 2, "pastry_xp видна раньше времени");
      }
    }
  }
  const allEffects = [
    ...v.effects, ...v.characters.flatMap((c) => c.effects), ...v.workshops.flatMap((w) => w.effects), ...v.inventory.flatMap((i) => i.effects),
  ];
  for (const fx of allEffects) assert.ok(!NEVER_MOD_NAMES.includes(fx.name), `скрытый модификатор ${fx.name}`);
  if (v.storage.goods.some((x) => x.id === "pastry")) assert.ok(lvl >= 2);
  if (v.market.shop.some((x) => x.item_type === "good_peel")) assert.ok(lvl >= 1);
  for (const o of [...(v.pending_offer ? [v.pending_offer] : []), ...v.board]) {
    if (o.options.some((x) => x.id === "take_pastry")) assert.ok(lvl >= 2);
  }
  const json = JSON.stringify(v);
  for (const id of NEVER_VARS) assert.ok(!json.includes(`"${id}"`), `в виде есть ${id}`);
}

function randomCommand(v: View, rnd: () => number): Command {
  if (v.pending_offer) {
    const opts = v.pending_offer.options.filter((o) => o.enabled);
    return { type: "choose_option", offer: v.pending_offer.id, option: opts[Math.floor(rnd() * opts.length)].id };
  }
  if (v.meta.is_night) return { type: "sleep" };
  const r = rnd();
  if (r < 0.25) return { type: "work_until_stop" };
  if (r < 0.32) return { type: "sleep" };
  if (r < 0.42 && v.market.enabled) return { type: "market_trip", buy_raw: { flour: 1 + Math.floor(rnd() * 8) }, buy_items: v.market.shop.filter((s) => s.enabled).map((s) => s.item_type).slice(0, 1) };
  if (r < 0.5 && v.board.length) return { type: "choose_option", offer: v.board[0].id, option: v.board[0].options[0].id };
  if (r < 0.55 && v.obligations.some((o) => o.can_deliver)) return { type: "deliver", obligation: v.obligations.find((o) => o.can_deliver)!.id };
  if (r < 0.62 && v.inventory.length) return { type: "equip", character: "baker", item: v.inventory[0].item };
  if (r < 0.75) {
    const c = v.characters.filter((x) => x.assignable.length)[Math.floor(rnd() * v.characters.length)];
    if (c) {
      const opts = c.assignable.filter((a) => a.enabled);
      const a = opts[Math.floor(rnd() * opts.length)];
      if (a) return { type: "set_assignment", character: c.id, assignment: a.assignment as any };
    }
  }
  const acts = v.actions.filter((a) => a.enabled && a.mode !== "assignable");
  if (acts.length) {
    const a = acts[Math.floor(rnd() * acts.length)];
    return { type: "do_action", action: a.id, actor: a.roles.actor[0], partner: a.roles.partner?.[0], candidate: a.roles.candidate?.[0] };
  }
  return { type: "work_until_stop" };
}

test("приёмка 6: в обычном виде нет скрытых сущностей (случайные прогоны)", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const p = fixture();
    p.actions.find((a) => a.id === "bake_bread")!.per_hour![0].add = 2; // быстрее дойти до скрытого
    const g = createGame(p, seed);
    const rnd = lcg(seed * 7919);
    let v = g.view();
    check(g, v);
    for (let step = 0; step < 250 && !v.ending; step++) {
      const cmd = randomCommand(v, rnd);
      const r = g.perform(cmd);
      v = r.view;
      check(g, v);
    }
    assert.deepEqual(g.debugView().errors, [], `ошибки выполнения при зерне ${seed}`);
  }
});

test("приёмка 6: панели пустые, если нечего показать (доска, заказы, инвентарь после экипировки)", () => {
  const g = createGame(fixture(), 1);
  const v = g.view();
  assert.deepEqual(v.board, []);
  assert.deepEqual(v.obligations, []);
  assert.equal(v.summary, null);
  assert.equal(v.pending_offer, null);
  assert.equal(v.ending, null);
  assert.equal(v.inventory.length, 1);
  g.perform({ type: "equip", character: "baker", item: v.inventory[0].item });
  assert.deepEqual(g.view().inventory, []);
  assert.deepEqual(g.view().characters[0].slots, [{ slot: "hand", slot_name: "В руке", item: v.inventory[0].item, name: "Старая лопата" }]);
});
