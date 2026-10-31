import { test } from "node:test";
import assert from "node:assert/strict";
import { mount } from "../src/dom.ts";
import { el, fakeRoot } from "./helpers.ts";
import type { Pack } from "../src/contract.ts";
import { memoryStorage } from "../src/storage.ts";
import { stubApi, type StubGame } from "../src/stub.ts";

const pack = { pack: { id: "stubpack" } } as Pack;

test("mount рисует экран и проводит нажатия в команды", () => {
  const api = stubApi();
  const root = fakeRoot();
  const app = mount(root, { api, pack, storage: memoryStorage(), random: () => 0.3 });
  const g = api.created[0] as StubGame;
  assert.ok(root.innerHTML.includes('data-act="sleep"'));

  root.fire("click", el("BUTTON", { act: "sleep" }));
  assert.equal(g.log[0].type, "sleep");
  assert.ok(root.innerHTML.includes('class="modal summary"'), "перерисовано после команды");

  root.fire("click", el("BUTTON", { act: "summary-close" }));
  root.fire("change", el("INPUT", { act: "sell-flag", id: "g_raw" }, { checked: true, type: "checkbox" }));
  assert.deepEqual(g.log[1], { type: "set_sell_flag", good: "g_raw", on: true });

  // клик по чекбоксу не дублирует команду (её шлёт change)
  root.fire("click", el("INPUT", { act: "sell-flag", id: "g_raw" }, { checked: false, type: "checkbox" }));
  assert.equal(g.log.length, 2);

  root.fire("input", el("INPUT", { act: "market-raw", id: "g_raw" }, { value: "2", type: "number" }));
  assert.deepEqual(app.ui.market.raw, { g_raw: 2 });

  // клик мимо элементов с data-act ничего не делает
  root.fire("click", { closest: () => null });
  root.fire("click", null);
  assert.equal(g.log.length, 2);
});
