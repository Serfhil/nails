// Категории действий (core.md 4.9, 4.9.1, 5.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/index.ts";
import { quietFixture } from "./helpers.ts";

const NEVER = { type: "day", op: "<", value: 0 };

test("категории: порядок файла, view и категория у действия", () => {
  const g = createGame(quietFixture(), 1);
  const v = g.view();
  assert.deepEqual(v.categories, [
    { id: "baking", name: "Выпечка", view: "select" },
    { id: "care", name: "Забота", view: "list" },
  ]);
  const cat = (id: string) => v.actions.find((a) => a.id === id)!.category;
  assert.equal(cat("bake_bread"), "baking");
  assert.equal(cat("rest"), "care");
  assert.equal(cat("hire_helper"), null); // действие без категории
});

test("категория скрывается, когда все её действия закрыты", () => {
  const p = quietFixture();
  p.actions.find((a) => a.id === "rest")!.open_when = NEVER as any; // visit_healer закрыт и так
  const g = createGame(p, 1);
  assert.deepEqual(g.view().categories.map((c) => c.id), ["baking"]);
  const p2 = quietFixture();
  for (const a of p2.actions) if (a.category === "baking") a.open_when = NEVER as any;
  assert.deepEqual(createGame(p2, 1).view().categories.map((c) => c.id), ["care"]);
});

test("порядок категорий — порядок файла, а не действий; view по умолчанию list", () => {
  const p = quietFixture();
  p.categories = [{ id: "care", name: "Забота" }, { id: "baking", name: "Выпечка", view: "select" }, { id: "empty", name: "Пустая" }];
  const v = createGame(p, 1).view();
  assert.deepEqual(v.categories, [
    { id: "care", name: "Забота", view: "list" },
    { id: "baking", name: "Выпечка", view: "select" },
  ]);
});

test("пак без categories.json и без поля category работает", () => {
  const p = quietFixture();
  delete p.categories;
  for (const a of p.actions) delete a.category;
  const v = createGame(p, 1).view();
  assert.deepEqual(v.categories, []);
  assert.ok(v.actions.length > 0 && v.actions.every((a) => a.category === null));
});
