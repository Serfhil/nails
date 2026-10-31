// Простые тесты симулятора: npx tsx --test "simulator/test/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load, simulate, STRATEGIES, traceRun } from "../src/index.ts";
import { openedKey } from "../src/coverage.ts";

const MINI = "fixtures/mini-pack";

test("все стратегии отрабатывают на мини-фикстуре без исключений", async () => {
  const r = await simulate(MINI, [...STRATEGIES], { runs: 3, cap: 40, seedStart: 1, jobs: 0 });
  assert.equal(r.problems, null);
  for (const s of r.results) {
    assert.equal(s.error, null, `${s.name}: ${s.error}`);
    assert.equal(s.runs.length, 3);
    for (const run of s.runs) assert.match(run.outcome, /^(goal:|fail:|end:|cap$)/);
  }
  assert.match(r.summary!.md, /без подсказок/);
  assert.match(r.summary!.md, /## Закрытое/);
  assert.ok(r.summary!.files["coverage.csv"].startsWith("kind,id,"));
});

test("--trace воспроизводим: одно зерно — тот же вывод", () => {
  for (const s of ["optimizer", "random"] as const) {
    const a: string[] = [], b: string[] = [];
    traceRun(MINI, s, 7, 25, (l) => a.push(l));
    traceRun(MINI, s, 7, 25, (l) => b.push(l));
    assert.ok(a.length > 10);
    assert.deepEqual(a, b);
  }
});

test("потоки и один процесс дают одинаковые итоги", async () => {
  const one = await simulate(MINI, ["random", "solo"], { runs: 4, cap: 20, seedStart: 3, jobs: 0 });
  const par = await simulate(MINI, ["random", "solo"], { runs: 4, cap: 20, seedStart: 3, jobs: 2 });
  assert.equal(one.summary!.md, par.summary!.md);
});

test("ключи реестра opened приводятся к виду:id", () => {
  assert.equal(openedKey("var:char:baker:stress"), "variable:stress");
  assert.equal(openedKey("action:x"), "action:x");
  assert.equal(openedKey("char:cat"), "character:cat");
});

test("пак с ошибками валидатора не прогоняется", () => {
  const r = load("fixtures/no-such-pack");
  assert.equal(r.pack, null);
  assert.match(r.problems!, /V001/);
});

test("в коде симулятора нет id пака", () => {
  const { pack } = load(MINI);
  const ids = new Set<string>();
  const RESERVED = new Set(["money", "stress"]); // зарезервированные переменные core.md 4.3
  for (const key of ["actions", "events", "modifiers", "offers", "goods", "items", "characters", "variables", "workshops"] as const)
    for (const x of ((pack as unknown as Record<string, { id: string }[]>)[key] ?? [])) if (!RESERVED.has(x.id)) ids.add(x.id);
  const dir = "simulator/src";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const id of ids) assert.ok(!src.includes(`"${id}"`), `${f}: найден id пака «${id}»`);
  }
});
