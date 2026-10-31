// Приёмка 1–3: детерминизм, save/load, ошибочная команда не меняет состояние.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, loadGame } from "../src/index.ts";
import { fixture, playScript, ok, quietFixture, newGame, clearOffers } from "./helpers.ts";

test("детерминизм: одно зерно + пак + команды = одинаковый результат", () => {
  const a = createGame(fixture(), 42);
  const b = createGame(fixture(), 42);
  playScript(a, 8);
  playScript(b, 8);
  assert.equal(a.save(), b.save());
  assert.deepEqual(a.view(), b.view());
  assert.deepEqual(a.debugView(), b.debugView());
});

test("детерминизм: другое зерно даёт другую случайность", () => {
  const saves = new Set<string>();
  for (const seed of [1, 2, 3, 4]) {
    const g = createGame(fixture(), seed);
    playScript(g, 6);
    saves.add(JSON.stringify(g.debugView().rng_state));
  }
  assert.ok(saves.size > 1);
});

test("save/load: игра после загрузки идёт так же, как без сохранения", () => {
  const a = createGame(fixture(), 9);
  playScript(a, 3);
  const saved = a.save();
  const b = loadGame(fixture(), saved);
  assert.deepEqual(b.view(), a.view());
  assert.equal(b.save(), saved);
  playScript(a, 4);
  playScript(b, 4);
  assert.equal(b.save(), a.save());
  assert.deepEqual(b.view(), a.view());
});

test("save/load: сохранение посреди окна выбора", () => {
  const p = quietFixture();
  const g = createGame(p, 3);
  // вызвать окно: просьба выходного требует работника; проще — окно notify с popup
  p.events.find((e) => e.id === "start_default")!.effects!.push({ type: "notify", text: "x", popup: true } as any);
  const g2 = createGame(p, 3);
  assert.ok(g2.view().pending_offer);
  const g3 = loadGame(p, g2.save());
  assert.deepEqual(g3.view().pending_offer, g2.view().pending_offer);
  clearOffers(g3);
  assert.equal(g3.view().pending_offer, null);
  assert.ok(g);
});

test("save/load: несовместимое сохранение отклоняется с понятной ошибкой", () => {
  const g = newGame();
  const s = JSON.parse(g.save());
  assert.throws(() => loadGame(fixture(), "не json"), /JSON/);
  assert.throws(() => loadGame(fixture(), JSON.stringify({ ...s, save_version: 999 })), /несовместимо/);
  const other = fixture();
  other.pack.id = "other_pack";
  assert.throws(() => loadGame(other, g.save()), /другого пака/);
  const v2 = fixture();
  v2.pack.version = "9.9.9";
  assert.throws(() => loadGame(v2, g.save()), /версии пака/);
  assert.throws(() => loadGame(fixture(), JSON.stringify({ hello: 1 })), /не сохранение/);
});

test("ошибочная команда не меняет состояние", () => {
  const g = createGame(fixture(), 5);
  playScript(g, 2);
  clearOffers(g);
  const bad: any[] = [
    { type: "do_action", action: "nope", actor: "baker" },
    { type: "do_action", action: "bake_cake", actor: "baker" },
    { type: "do_action", action: "buy_oven", actor: "nobody" },
    { type: "do_action", action: "upgrade_bakery", actor: "baker" },
    { type: "set_assignment", character: "baker", assignment: { kind: "trade" } },
    { type: "set_assignment", character: "ghost", assignment: { kind: "idle" } },
    { type: "set_assignment", character: "baker", assignment: { kind: "action", action: "rest" } },
    { type: "market_trip", buy_raw: { bread: 1 }, buy_items: [] },
    { type: "market_trip", buy_raw: { flour: 100000 }, buy_items: [] },
    { type: "market_trip", buy_raw: { flour: -1 }, buy_items: [] },
    { type: "set_sell_flag", good: "nope", on: true },
    { type: "choose_option", offer: "of999", option: "x" },
    { type: "deliver", obligation: "ob999" },
    { type: "decline", obligation: "ob999" },
    { type: "equip", character: "baker", item: "it999" },
    { type: "unequip", character: "baker", item: "it999" },
    { type: "assign_workshop", character: "baker", workshop: "ws999" },
    { type: "fly" },
  ];
  for (const cmd of bad) {
    const before = g.save();
    const r = g.perform(cmd);
    assert.equal(r.ok, false, JSON.stringify(cmd));
    assert.ok(r.error && r.error.text.length > 0, JSON.stringify(cmd));
    assert.equal(g.save(), before, `состояние изменилось после ${JSON.stringify(cmd)}`);
  }
});

test("ошибочная команда ночью и при окне выбора не меняет состояние", () => {
  const g = newGame();
  ok(g, { type: "set_assignment", character: "baker", assignment: { kind: "idle" } });
  ok(g, { type: "work_until_stop" }); // до заката
  assert.equal(g.view().meta.is_night, true);
  const before = g.save();
  const r = g.perform({ type: "do_action", action: "rest", actor: "baker" });
  assert.equal(r.ok, false);
  assert.equal(r.error!.code, "no_time");
  const r2 = g.perform({ type: "work_until_stop" });
  assert.equal(r2.error!.code, "no_time");
  assert.equal(g.save(), before);
});
