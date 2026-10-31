// Приёмка 5: в коде движка нет id, названий и текстов пака (кроме зарезервированных переменных core.md 4.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, fixture } from "./helpers.ts";

const RESERVED = new Set([
  "money", "stress", "speed", "defect", "learn_speed", "sell_price", "buy_price", "commission", "wage", "hire_cost",
  "household_expense", "world_sell_price", "world_buy_price", "max_workers", "equipment_slots", "upkeep",
]);

function collect(): { ids: Set<string>; texts: Set<string> } {
  const p = fixture() as any;
  const ids = new Set<string>();
  const texts = new Set<string>();
  ids.add(p.pack.id);
  for (const file of ["variables", "modifiers", "goods", "items", "workshops", "characters", "actions", "events", "offers"]) {
    for (const rec of p[file]) {
      ids.add(rec.id);
      for (const st of rec.ladder ?? []) ids.add(st.id);
      for (const op of rec.options ?? []) {
        ids.add(op.id);
        if (op.obligation) ids.add(op.obligation.id);
      }
    }
  }
  // все строки по-русски — названия и тексты
  const walk = (x: unknown) => {
    if (typeof x === "string") { if (/[а-яё]/i.test(x)) texts.add(x); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(p);
  for (const r of RESERVED) ids.delete(r);
  return { ids, texts };
}

test("приёмка 5: в engine/src нет id, названий и текстов фикстуры", () => {
  const dir = join(ROOT, "engine", "src");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length > 5);
  const { ids, texts } = collect();
  const found: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const id of ids) {
      const re = new RegExp(`["'\`]${id}["'\`]`);
      if (re.test(src)) found.push(`${f}: id «${id}»`);
    }
    for (const t of texts) {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![а-яёА-ЯЁa-zA-Z])${esc}(?![а-яёА-ЯЁa-zA-Z])`);
      if (re.test(src)) found.push(`${f}: текст «${t}»`);
    }
  }
  assert.deepEqual(found, []);
});
