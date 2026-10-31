// Метаданные пака в виде (core.md 4.2, 5.3): pack_id, pack_version, pack_description.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, loadGame } from "../src/index.ts";
import { quietFixture } from "./helpers.ts";

test("meta: id, версия и описание пака из pack.json", () => {
  const p = quietFixture();
  const m = createGame(p, 1).view().meta;
  assert.equal(m.game_title, p.pack.name);
  assert.equal(m.pack_id, p.pack.id);
  assert.equal(m.pack_version, p.pack.version);
  assert.equal(typeof p.pack.description, "string");
  assert.equal(m.pack_description, p.pack.description);
});

test("meta: пак без description работает, pack_description = null", () => {
  const p = quietFixture();
  delete p.pack.description;
  const g = createGame(p, 1);
  assert.equal(g.view().meta.pack_description, null);
  assert.equal(g.perform({ type: "sleep" }).ok, true);
  assert.equal(loadGame(p, g.save()).view().meta.pack_description, null);

  const p2 = quietFixture();
  p2.pack.description = null;
  assert.equal(createGame(p2, 1).view().meta.pack_description, null);
});
