import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { formatProblems, loadPack, validatePack, type Problem } from "../src/index.ts";
import { BROKEN, basePack } from "../scripts/make-broken.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const BROKEN_DIR = join(ROOT, "fixtures", "broken");
const MINI = join(ROOT, "fixtures", "mini-pack");

const codes = (ps: Problem[]) => [...new Set(ps.map((p) => p.code))].sort();
const errors = (ps: Problem[]) => ps.filter((p) => p.severity === "error");
const find = (list: any[], id: string) => list.find((x) => x.id === id);
const withPack = (mut: (p: any) => void): Problem[] => {
  const p = basePack();
  mut(p);
  return validatePack(p);
};
const has = (ps: Problem[], code: string, re?: RegExp) =>
  assert.ok(ps.some((p) => p.code === code && (!re || re.test(p.message))), `ожидался ${code}${re ? ` ${re}` : ""}, получено:\n${formatProblems(ps)}`);

// ---------------- базовые паки ----------------
test("базовый пак в памяти: ни ошибок, ни предупреждений", () => {
  assert.deepEqual(validatePack(basePack()), []);
});

test("fixtures/broken/_base: ни ошибок, ни предупреждений", () => {
  assert.deepEqual(loadPack(join(BROKEN_DIR, "_base")).problems, []);
});

test("каждый сломанный пак даёт ровно свой код", () => {
  const dirs = readdirSync(BROKEN_DIR).filter((d) => /^[VW]\d{3}_/.test(d));
  assert.ok(dirs.length >= 28);
  for (const d of dirs) {
    const expected = d.slice(0, 4);
    const { problems } = loadPack(join(BROKEN_DIR, d));
    assert.deepEqual(codes(problems), [expected], `${d}:\n${formatProblems(problems)}`);
  }
});

test("сломанный пак есть на каждый код V001–V014 и W001–W010", () => {
  const dirs = new Set(readdirSync(BROKEN_DIR).map((d) => d.slice(0, 4)));
  for (let i = 1; i <= 14; i++) assert.ok(dirs.has(`V${String(i).padStart(3, "0")}`), `нет пака для V${i}`);
  for (let i = 1; i <= 10; i++) assert.ok(dirs.has(`W${String(i).padStart(3, "0")}`), `нет пака для W${i}`);
});

test("папки fixtures/broken совпадают с генератором (scripts/make-broken.ts)", () => {
  for (const name of Object.keys(BROKEN))
    assert.ok(existsSync(join(BROKEN_DIR, name)), `перегенерируйте: npm run make-broken (${name})`);
  const dirs = readdirSync(BROKEN_DIR).filter((d) => /^[VW]\d{3}_/.test(d));
  assert.deepEqual(dirs.sort(), Object.keys(BROKEN).sort(), "лишние папки — перегенерируйте: npm run make-broken");
});

// ---------------- мини-фикстура ----------------
test("fixtures/mini-pack проходит без ошибок", { skip: !existsSync(join(MINI, "READY.md")) && "фикстура ещё не готова" }, () => {
  const { problems } = loadPack(MINI);
  assert.deepEqual(errors(problems), [], formatProblems(problems));
});

// ---------------- вывод и CLI ----------------
test("формат строки: severity code file id path — сообщение", () => {
  const ps = withPack((p) => (find(p.actions, "make_widget").cost[0].good = "oer"));
  const line = formatProblems(ps).split("\n").find((l) => l.includes(" V003 "));
  assert.equal(line, "error V003 actions.json make_widget cost[0].good — товар «oer» не объявлен в goods.json. Возможно, имелось в виду «ore».");
});

test("сначала ошибки, потом предупреждения", () => {
  const ps = withPack((p) => {
    p.goods[0].colour = "x";
    p.actions[0].hours = -1;
  });
  const sev = ps.map((p) => p.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => (a === b ? 0 : a === "error" ? -1 : 1)));
  assert.equal(sev[0], "error");
});

const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "validator", "src", "cli.ts"), ...args], { encoding: "utf8", cwd: ROOT });

test("CLI: код выхода 0 без ошибок, 1 с ошибками, --json — массив", () => {
  const ok = cli(join(BROKEN_DIR, "_base"));
  assert.equal(ok.status, 0, ok.stderr);
  const warn = cli(join(BROKEN_DIR, "W010_unknown_field"));
  assert.equal(warn.status, 0, warn.stderr);
  const bad = cli(join(BROKEN_DIR, "V003_unknown_ref"), "--json");
  assert.equal(bad.status, 1, bad.stderr);
  const arr = JSON.parse(bad.stdout);
  assert.ok(Array.isArray(arr) && arr.length === 1);
  for (const k of ["severity", "code", "file", "id", "path", "message"]) assert.ok(k in arr[0], k);
  assert.equal(cli().status, 2);
});

// ---------------- отдельные проверки ----------------
test("V001: неверное значение, неизвестный тип условия, обязательное поле", () => {
  has(withPack((p) => (p.actions[0].mode = "sometimes")), "V001", /допустимо: once, assignable, both/);
  has(withPack((p) => (find(p.actions, "polish").open_when = { type: "has_modifer", template: "has_anvil" })), "V001", /has_modifier/);
  has(withPack((p) => delete p.goods[0].price), "V001", /нет обязательного поля «price»/);
  has(withPack((p) => (p.goods[0].id = "Ore")), "V001", /snake_case/);
  has(withPack((p) => (p.events[0].effects[0] = { type: "var", var: "money" })), "V001", /add.*set/);
});

test("V001: нет файла — без каскада V003", () => {
  const p: any = basePack();
  delete p.goods;
  const ps = validatePack(p);
  assert.deepEqual(codes(ps), ["V001"], formatProblems(ps));
});

test("V002: дубликаты ступеней, вариантов и обязательств", () => {
  has(withPack((p) => (find(p.variables, "craft_xp").ladder[1].id = "novice")), "V002", /ступень/);
  has(withPack((p) => (find(p.offers, "victory").options[1].id = "stay")), "V002", /вариант/);
});

test("V003: слот, пул, тег, вариант в strategy_hints", () => {
  has(withPack((p) => (p.items[0].slot = "head")), "V003", /слот «head»/);
  has(withPack((p) => (find(p.events, "order_board").trigger.pool = "dayly")), "V003", /«daily»/);
  has(withPack((p) => find(p.actions, "rest").effects.push({ type: "remove_modifier", tag: "nope", target: "actor" })), "V003", /тега «nope»/);
  has(withPack((p) => (p.strategy_hints = { offer_choices: { victory: "goo" }, action_ladder: ["make_widget"] })), "V003", /нет варианта «goo».*«go»/);
  has(withPack((p) => (p.workshops[0].vars.speed = 2)), "V003", /owner: workshop/);
});

test("V004: зарезервированная переменная с неверным owner", () => {
  has(withPack((p) => (find(p.variables, "upkeep").owner = "world")), "V004", /owner «workshop»/);
});

test("V005: флаг с var, direction без change, несовместимый владелец, value_from", () => {
  has(withPack((p) => (find(p.modifiers, "has_anvil").var = "speed")), "V005", /флаг/);
  has(withPack((p) => delete find(p.modifiers, "rested").applies_to), "V005", /direction/);
  has(withPack((p) => (find(p.modifiers, "has_anvil").flag = false, Object.assign(find(p.modifiers, "has_anvil"), { var: "speed", op: "add", value: 1 }))), "V005", /мастерск/);
  has(withPack((p) => (find(p.modifiers, "skilled").value_from = { var: "nope", per_point: 1 })), "V005", /value_from/);
});

test("V006: подстановка в тексте события и предложения", () => {
  has(withPack((p) => p.events[0].effects.push({ type: "notify", text: "Привет, {participant}" })), "V006", /\{participant\}/);
  has(withPack((p) => (find(p.offers, "order").text = "Нужно {qtty}")), "V006", /\{qtty\}/);
  has(withPack((p) => (p.texts.reason_cost = "Нет {nam}")), "V006", /«name»/);
  const ok = withPack((p) => {
    find(p.events, "order_board").participant = { pick: "random", among: "characters" };
    find(p.offers, "order").text = "{participant}: нужно {qty}";
  });
  assert.deepEqual(ok, []);
});

test("V007: ступени не по возрастанию и за max", () => {
  has(withPack((p) => (find(p.variables, "craft_xp").ladder[1].at = 0)), "V007", /возрастанию/);
  has(withPack((p) => Object.assign(find(p.variables, "craft_xp"), { max: 5 })), "V007", /max/);
});

test("V008: цикл через предложение, все варианты которого ведут обратно", () => {
  const ps = withPack((p) => {
    p.events.push({ id: "loop", effects: [{ type: "show_offer", offer: "loop_offer" }] });
    find(p.events, "order_board").effects.push({ type: "run_event", event: "loop" });
    p.offers.push({
      id: "loop_offer", delivery: "now", title: "Снова",
      options: [
        { id: "a", label: "А", effects: [{ type: "run_event", event: "loop" }] },
        { id: "b", label: "Б", effects: [{ type: "run_event", event: "loop" }] },
      ],
    });
  });
  has(ps, "V008", /loop/);
  const escape = withPack((p) => {
    p.events.push({ id: "loop", effects: [{ type: "show_offer", offer: "loop_offer" }] });
    find(p.events, "order_board").effects.push({ type: "run_event", event: "loop" });
    p.offers.push({
      id: "loop_offer", delivery: "now", title: "Снова",
      options: [{ id: "a", label: "А", effects: [{ type: "run_event", event: "loop" }] }, { id: "b", label: "Выйти" }],
    });
  });
  assert.ok(!escape.some((x) => x.code === "V008"), formatProblems(escape));
});

test("V009: снятие по тегу и may_be_permanent убирают ошибку", () => {
  const mk = (extra: (p: any) => void) =>
    withPack((p) => {
      p.modifiers.push({ id: "scar", name: "Шрам", var: "speed", op: "pct", value: -10, duration: { kind: "forever" }, tags: ["scar"] });
      find(p.actions, "rest").effects.push({ type: "add_modifier", template: "scar", target: "actor" });
      extra(p);
    });
  has(mk(() => {}), "V009");
  assert.deepEqual(mk((p) => find(p.actions, "polish").effects = [{ type: "remove_modifier", tag: "scar", target: "actor" }]), []);
  assert.deepEqual(mk((p) => (find(p.modifiers, "scar").may_be_permanent = true)), []);
  has(mk((p) => (find(p.modifiers, "scar").duration = { kind: "while", condition: { type: "day", op: ">=", value: 3 } })), "V009");
});

test("V010: недостижимые действие, вариант, событие, персонаж, мастерская, видимая переменная", () => {
  has(withPack((p) => (find(p.actions, "polish").open_when = { type: "hired", character: "hero" })), "V010", /действие недостижимо/);
  has(withPack((p) => (find(p.offers, "victory").options[1].open_when = { type: "hired", character: "hero" })), "V010", /вариант «go»/);
  has(withPack((p) => {
    find(p.offers, "order").options[0].obligation.deadline_days = null;
    p.events.push({ id: "on_fail", trigger: { signal: "obligation_failed" }, effects: [] });
  }), "V010", /obligation_failed/);
  has(withPack((p) => (p.characters[1].hire_pool = false)), "V010", /персонаж/);
  has(withPack((p) => (find(p.variables, "polish_xp").visible = { type: "var", subject: "self", var: "craft_xp", field: "level", op: ">=", value: 5 })), "V010", /видимой/);
  has(withPack((p) => p.workshops.push({ id: "castle", name: "Замок" })), "V010", /мастерская/);
});

test("V010: видимость false у переменной — сознательно скрыта (CI-004)", () => {
  assert.deepEqual(withPack((p) => (find(p.variables, "speed").visible = false)), []);
});

test("контракт 2.1: слоты, оборудование, лавка, роли, тексты", () => {
  has(withPack((p) => delete p.pack.names.slots), "V003", /names\.slots/);
  has(withPack((p) => (find(p.items, "anvil").grade = 0)), "V001", /меньше допустимого 1/);
  has(withPack((p) => (find(p.items, "anvil").line = "Big Anvil")), "V001", /snake_case/);
  has(withPack((p) => (find(p.items, "anvil").slot = "hand")), "V001", /обезличены/);
  has(withPack((p) => (find(p.actions, "buy_anvil").effects[0].target = "hero")), "V001", /только в мастерскую/);
  has(withPack((p) => (p.events[0].effects[3].target = "workshop")), "V001", /инструмент/);
  has(withPack((p) => (p.pack.names.roles.boss = "Босс")), "W010", /boss/);
  assert.deepEqual(withPack((p) => (p.characters[0].role_name = "Хозяин")), []);
  assert.deepEqual(withPack((p) => p.events[0].effects.push({ type: "notify", text: "x", kind: "seal" })), []);
  has(withPack((p) => p.events[0].effects.push({ type: "notify", text: "x", kind: "red" })), "V001", /seal/);
  has(withPack((p) => (p.texts.replace_warning = "{item} вместо {older}")), "V006", /\{older\}/);
  // W005 не срабатывает на событии по редкому сигналу (CI-016)
  assert.deepEqual(withPack((p) => p.events.push({ id: "step", trigger: { signal: "ladder_step" }, stops_time: true, effects: [] })), []);
});

test("T-002: description у действия — необязательная строка или null", () => {
  assert.deepEqual(withPack((p) => (find(p.actions, "rest").description = "Пояснение для игрока.")), []);
  assert.deepEqual(withPack((p) => (find(p.actions, "rest").description = null)), []);
  assert.deepEqual(withPack((p) => delete find(p.actions, "rest").description), []);
  const num = withPack((p) => (find(p.actions, "rest").description = 42));
  has(num, "V001", /ожидалась строка/);
  assert.ok(num.some((x) => x.code === "V001" && x.path === "description"));
  assert.ok(!num.some((x) => x.code === "W010"), "description не даёт W010");
  has(withPack((p) => (find(p.actions, "rest").description = ["a"])), "V001", /ожидалась строка/);
});

test("T-015: pack.json — name и version обязательны и непусты, description необязателен", () => {
  // description: отсутствие (базовый пак), строка, null — без ошибок и без W010
  assert.equal(basePack().pack.description, undefined);
  assert.deepEqual(validatePack(basePack()), []);
  assert.deepEqual(withPack((p) => (p.pack.description = "Мастер растёт от подмастерья до хозяина.")), []);
  assert.deepEqual(withPack((p) => (p.pack.description = null)), []);
  // description не строка — V001 по полю description, без W010
  for (const bad of [42, ["a"], { text: "x" }, true]) {
    const ps = withPack((p) => (p.pack.description = bad));
    assert.deepEqual(codes(ps), ["V001"], formatProblems(ps));
    assert.ok(ps.some((x) => x.file === "pack.json" && x.id === "base" && x.path === "description"), formatProblems(ps));
  }
  // name и version: нет поля, null, пустая строка, пробелы, не строка — V001 по своему полю
  for (const field of ["name", "version"]) {
    for (const [label, mut] of [
      ["нет поля", (p: any) => delete p.pack[field]],
      ["null", (p: any) => (p.pack[field] = null)],
      ["пустая строка", (p: any) => (p.pack[field] = "")],
      ["пробелы", (p: any) => (p.pack[field] = "  ")],
      ["число", (p: any) => (p.pack[field] = 1)],
    ] as [string, (p: any) => void][]) {
      const ps = withPack(mut);
      assert.deepEqual(codes(ps), ["V001"], `${field}, ${label}:\n${formatProblems(ps)}`);
      assert.ok(ps.some((x) => x.file === "pack.json" && x.path === field), `${field}, ${label}:\n${formatProblems(ps)}`);
    }
  }
  has(withPack((p) => (p.pack.version = "")), "V001", /не может быть пустой/);
  has(withPack((p) => delete p.pack.version), "V001", /нет обязательного поля «version»/);
});

test("V011, V012, V013, V014", () => {
  has(withPack((p) => find(p.offers, "victory").options.push(...[1, 2, 3].map((i) => ({ id: `o${i}`, label: "x" })))), "V011", /от 1 до 4/);
  has(withPack((p) => delete find(p.offers, "order").options[0].obligation.requires), "V011", /requires/);
  has(withPack((p) => (p.goods[0].price = -1)), "V013", /цена/);
  has(withPack((p) => (find(p.variables, "defect").start = 2)), "V013", /0\.\.1/);
  has(withPack((p) => (find(p.actions, "make_widget").outputs[0].qty = 0)), "V013", /qty/);
  has(withPack((p) => (p.pack.start.event = "start_defualt")), "V014", /«start_default»/);
});

test("W003: видимый модификатор, событие-предупреждение и видимые деньги считаются предвестником", () => {
  const hidden = (p: any) => {
    p.variables.push({ id: "fatigue", name: "Изнурение", owner: "character", start: 0, min: 0, visible: false });
    find(p.actions, "make_widget").per_hour.push({ target: "actor", var: "fatigue", add: 1 });
    find(p.events, "burnout").trigger.conditions[0] = { type: "var", subject: "hero", var: "fatigue", op: ">=", value: 50 };
  };
  has(withPack(hidden), "W003", /fatigue/);
  assert.deepEqual(withPack((p) => {
    hidden(p);
    p.events.push({
      id: "fatigue_warn", trigger: { conditions: [{ type: "var", subject: "hero", var: "fatigue", op: ">=", value: 40 }] },
      repeat: { max: 1 }, effects: [{ type: "notify", text: "Руки дрожат." }],
    });
  }), []);
  assert.deepEqual(withPack((p) => (find(p.events, "burnout").trigger.conditions[0] = { type: "calc", name: "wealth", op: "<", value: -10 })), []);
});

test("W004: имя без data_defaults", () => {
  has(withPack((p) => (find(p.offers, "order").options[0].obligation.on_done[0].add = { $data: "rewrd" })), "W004", /не передаёт ни один источник/);
});

// ---------------- устойчивость и скорость ----------------
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const JUNK = [null, 0, -1, "", "x", [], {}, true, { type: "zzz" }, { $data: "q" }, [{}], [1, "a"]];

test("устойчивость: случайные порчи пака не роняют валидатор", () => {
  const r = rng(42);
  const sources = [basePack];
  for (let n = 0; n < 400; n++) {
    const p: any = sources[0]();
    // выбрать случайный узел и испортить
    const nodes: [any, string | number][] = [];
    const walk = (v: any) => {
      if (Array.isArray(v)) v.forEach((x, i) => (nodes.push([v, i]), walk(x)));
      else if (v && typeof v === "object") for (const k of Object.keys(v)) (nodes.push([v, k]), walk(v[k]));
    };
    walk(p);
    for (let k = 0; k < 3; k++) {
      const [obj, key] = nodes[Math.floor(r() * nodes.length)];
      obj[key] = JUNK[Math.floor(r() * JUNK.length)];
    }
    assert.doesNotThrow(() => validatePack(p));
  }
  for (const junk of JUNK) assert.doesNotThrow(() => validatePack(junk));
  assert.doesNotThrow(() => validatePack(Object.fromEntries(Object.keys(basePack()).map((k) => [k, "junk"]))));
});

test("скорость: пак из нескольких сотен записей проверяется быстрее секунды", () => {
  const p: any = basePack();
  for (let i = 0; i < 150; i++) {
    p.goods.push({ id: `g${i}`, name: `Товар ${i}`, price: i, buy: false, sell_default: true });
    p.modifiers.push({ id: `m${i}`, name: `Мод ${i}`, var: "speed", op: "pct", value: 1, duration: { kind: "days", n: 1 } });
    p.actions.push({
      id: `a${i}`, name: `Действие ${i}`, mode: "both", hours: 1, roles: { actor: { who: "hero_or_worker" } },
      open_when: i ? { type: "stock", good: `g${i - 1}`, op: ">=", value: 1 } : null,
      cost: [{ good: "ore", qty: 1 }], outputs: [{ good: `g${i}`, qty: 1 }],
      effects: [{ type: "add_modifier", template: `m${i}`, target: "actor" }],
    });
    p.events.push({
      id: `e${i}`, trigger: { signal: "morning", pool: "daily", conditions: [{ type: "stock", good: `g${i}`, op: ">=", value: 1 }] },
      weight: 1, effects: [{ type: "show_offer", offer: `o${i}` }],
    });
    p.offers.push({
      id: `o${i}`, delivery: "board", board_days: 1, title: `Заказ ${i}`, text: "Нужно {qty}", data: { qty: 2 },
      options: [{ id: "take", label: "Взять", obligation: { id: `ob${i}`, title: "Заказ", requires: [{ good: `g${i}`, qty: { $data: "qty" } }], deadline_days: 2, on_done: [], on_fail: [], on_decline: [] } }, { id: "skip", label: "Нет" }],
    });
  }
  const t0 = performance.now();
  const ps = validatePack(p);
  const ms = performance.now() - t0;
  assert.deepEqual(errors(ps), [], formatProblems(ps));
  assert.ok(ms < 1000, `проверка заняла ${Math.round(ms)} мс`);
});

test("T-006: категории действий (categories.json, category)", () => {
  const cat = (p: any, extra: any[] = []) => {
    p.categories = [{ id: "craft", name: "Работа", view: "select" }, { id: "rest", name: "Отдых" }, ...extra];
    find(p.actions, "make_widget").category = "craft";
    find(p.actions, "rest").category = "rest";
  };
  // отсутствие файла и поля, category: null — без проблем
  assert.deepEqual(validatePack(basePack()), []);
  assert.deepEqual(withPack((p) => (find(p.actions, "rest").category = null)), []);
  assert.deepEqual(withPack((p) => (p.categories = [])), []);
  // корректные категории (view необязателен, оба значения допустимы) — без проблем и без W010
  assert.deepEqual(withPack((p) => cat(p)), []);
  // V001: схема
  has(withPack((p) => cat(p, [{ id: "x", name: "X", view: "grid" }])), "V001", /допустимо: list, select/);
  has(withPack((p) => cat(p, [{ id: "x" }])), "V001", /name/);
  has(withPack((p) => cat(p, [{ name: "X" }])), "V001", /id/);
  has(withPack((p) => cat(p, [{ id: "X Y", name: "X" }])), "V001");
  has(withPack((p) => (p.categories = { id: "craft" })), "V001", /массив/);
  has(withPack((p) => (find(p.actions, "rest").category = 5)), "V001", /id/);
  has(withPack((p) => cat(p, [{ id: "x", name: "X", colour: 1 }])), "W010", /colour/);
  // V002: дубликат id
  has(withPack((p) => cat(p, [{ id: "rest", name: "Ещё отдых" }])), "V002", /«rest»/);
  // V003: несуществующая категория, подсказка, отсутствие файла
  const bad = withPack((p) => (cat(p), (find(p.actions, "rest").category = "rset")));
  has(bad, "V003", /категория «rset».*Возможно, имелось в виду «rest»/);
  assert.ok(bad.some((x) => x.code === "V003" && x.file === "actions.json" && x.id === "rest" && x.path === "category"));
  has(withPack((p) => (find(p.actions, "rest").category = "rest")), "V003", /категория «rest»/);
  // W002: категория без действий
  const empty = withPack((p) => cat(p, [{ id: "unused", name: "Пустая" }]));
  assert.deepEqual(codes(empty), ["W002"]);
  assert.ok(empty.some((x) => x.file === "categories.json" && x.id === "unused"));
});

test("T-006: categories.json в папке пака не даёт W010", () => {
  const { problems } = loadPack(join(BROKEN_DIR, "V003_unknown_category"));
  assert.ok(!problems.some((x) => x.code === "W010"), formatProblems(problems));
});
