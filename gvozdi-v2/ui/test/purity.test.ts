// Проверка поиском: в коде интерфейса нет ни одного id, названия или текста пака (view.md 6.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPack } from "../build.ts";

const root = join(import.meta.dirname, "..", "..");
const packDirs = ["fixtures/mini-pack", "packs/nails_for_count"].map((d) => join(root, d)).filter((d) => existsSync(join(d, "pack.json")));

const TEXT_KEYS = ["name", "title", "text", "label", "blurb", "disabled_text", "unit"];

/** Зарезервированные переменные движка (core.md 4.3) — их знать можно. */
const RESERVED = new Set([
  "money", "stress", "speed", "defect", "learn_speed", "sell_price", "buy_price", "commission", "wage", "hire_cost",
  "household_expense", "world_sell_price", "world_buy_price", "max_workers", "equipment_slots", "upkeep",
]);

/**
 * exact — id сущностей и их названия/тексты (объект с полем id) и названия денег/стресса:
 *   не должны встречаться литералом;
 * long — все длинные тексты пака (включая texts.json): не должны встречаться даже подстрокой.
 */
function packStrings(pack: Record<string, unknown>): { exact: Set<string>; long: Set<string> } {
  const exact = new Set<string>();
  const long = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (v.length >= 12 && /[а-яё]/i.test(v)) long.add(v);
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.id === "string") {
        if (!RESERVED.has(o.id)) exact.add(o.id);
        for (const k of TEXT_KEYS) if (typeof o[k] === "string") exact.add(o[k] as string);
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(pack);
  const meta = pack.pack as { name?: string; names?: Record<string, string> };
  if (meta.name) exact.add(meta.name);
  for (const n of Object.values(meta.names ?? {})) exact.add(n);
  return { exact, long };
}

/** Все строковые литералы файла. */
function literals(src: string): string[] {
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g;
  const out: string[] = [];
  for (const m of src.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/**
 * Словарь самого контракта core.md 5 и интерфейса — не id пака, даже если пак назвал запись так же:
 * - все строковые литералы ui/src/contract.ts (типы команд, kind назначений, коды ошибок, Line.kind,
 *   mode/status/tag и т. п. — файл состоит только из типов core.md 5);
 * - значения format (core.md 4.3);
 * - служебные имена событий интерфейса data-act (render.ts).
 * Зарезервированные переменные core.md 4.3 исключаются ещё при сборе id пака (RESERVED).
 */
function vocabulary(): Set<string> {
  const contract = readFileSync(join(root, "ui", "src", "contract.ts"), "utf8");
  const render = readFileSync(join(root, "ui", "src", "render.ts"), "utf8");
  const out = new Set<string>(literals(contract));
  for (const f of ["number", "pct", "money"]) out.add(f);
  // значения role персонажа (core.md 4.7): слова контракта
  for (const r of ["hero", "worker", "family", "pet"]) out.add(r);
  for (const m of render.matchAll(/"data-act":\s*"([^"]+)"|data-act="([a-z-]+)"/g)) out.add(m[1] ?? m[2]);
  return out;
}
const VOCAB = vocabulary();

/** Код интерфейса (кроме заглушки с выдуманными тестовыми данными и копии типов контракта). */
function uiSources(): { file: string; src: string }[] {
  const dir = join(root, "ui", "src");
  const files = readdirSync(dir)
    .filter((f) => /\.(ts|css)$/.test(f) && f !== "stub.ts" && f !== "contract.ts")
    .map((f) => join(dir, f));
  files.push(join(root, "ui", "build.ts"));
  return files.map((file) => ({ file, src: readFileSync(file, "utf8") }));
}

test("в коде интерфейса нет id, названий и текстов пака", { skip: packDirs.length === 0 }, () => {
  const found: string[] = [];
  for (const dir of packDirs) {
    const { exact, long } = packStrings(readPack(dir));
    for (const { file, src } of uiSources()) {
      for (const lit of literals(src)) if (lit.length >= 2 && exact.has(lit) && !VOCAB.has(lit)) found.push(`${file}: "${lit}" (${dir})`);
      for (const s of long) if (src.includes(s)) found.push(`${file}: …${s}… (${dir})`);
    }
  }
  assert.deepEqual(found, []);
});

test("словарь контракта узкий: только служебные слова", () => {
  for (const w of ["sleep", "work_until_stop", "do_action", "idle", "trade", "seal", "offer_pending", "once", "incapacitated", "goal"]) {
    assert.ok(VOCAB.has(w), w);
  }
  for (const w of VOCAB) assert.match(w, /^[a-z_-]+$/, `в словаре только служебные слова: ${w}`);
});

test("проверка поиском действительно ловит id и названия пака", { skip: packDirs.length === 0 }, () => {
  for (const dir of packDirs) {
    const { exact } = packStrings(readPack(dir));
    assert.ok(exact.size > 10);
    const someId = [...exact].find((s) => /^[a-z_]+$/.test(s) && !VOCAB.has(s))!;
    const someName = [...exact].find((s) => /[а-яё]/i.test(s))!;
    assert.ok(someId && someName);
    for (const fake of [`const x = "${someId}";`, `const y = '${someName}';`]) {
      assert.ok(literals(fake).some((l) => exact.has(l) && !VOCAB.has(l)), fake);
    }
  }
});
