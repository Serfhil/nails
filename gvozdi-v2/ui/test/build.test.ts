// Сборка HTML на фикстуре и запуск встроенного скрипта на фейковом документе (без браузера).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { build, buildSite, siteUrl } from "../build.ts";
import { memoryStorage } from "../src/storage.ts";
import { el, fakeRoot } from "./helpers.ts";

const root = join(import.meta.dirname, "..", "..");

test("сборка фикстуры: один HTML, скрипт запускается и рисует игру", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gvozdi-ui-"));
  try {
    const out = join(dir, "mini.html");
    await build(join(root, "fixtures", "mini-pack"), out);
    const html = readFileSync(out, "utf8");
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes('name="viewport"'));
    // никаких внешних скриптов и стилей, кроме шрифтов
    assert.ok(!/<script[^>]+src=/.test(html));
    for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) assert.ok(m[1].startsWith("https://fonts.g"), m[1]);

    const packJson = html.match(/<script type="application\/json" id="pack-data">([\s\S]*?)<\/script>/)![1];
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.equal(scripts.length, 1);
    assert.equal(typeof JSON.parse(packJson).pack.id, "string", "пак разбирается из встроенного JSON");

    const appRoot = fakeRoot();
    const storage = memoryStorage();
    const document = {
      title: "",
      getElementById: (id: string) =>
        id === "app" ? appRoot : id === "pack-data" ? { ...fakeRoot(), textContent: packJson } : null,
    };
    const ctx = vm.createContext({ document, localStorage: storage, console, Math, JSON });
    vm.runInContext(scripts[0], ctx);
    assert.ok(appRoot.innerHTML.includes('data-act="sleep"'), "игра нарисована");
    assert.ok(document.title.length > 0);
    assert.equal(storage.data.size >= 1, true, "сохранение записано");

    // нажатие проходит через бандл
    appRoot.fire("click", el("BUTTON", { act: "work" }));
    assert.ok(appRoot.innerHTML.includes('class="panel now"') || appRoot.innerHTML.includes('class="overlay"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("обычная сборка: в странице список из одного текущего пака", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gvozdi-ui-"));
  try {
    const out = join(dir, "mini.html");
    await build(join(root, "fixtures", "mini-pack"), out);
    const html = readFileSync(out, "utf8");
    const list = JSON.parse(html.match(/<script type="application\/json" id="pack-list">([\s\S]*?)<\/script>/)![1]);
    const id = JSON.parse(readFileSync(join(root, "fixtures", "mini-pack", "pack.json"), "utf8")).id;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, id);
    assert.equal(list[0].url, "mini.html");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ссылки сайта относительные и верны для каждой страницы", () => {
  assert.equal(siteUrl("root", "m", "m"), "index.html");
  assert.equal(siteUrl("root", "b", "m"), "packs/b/index.html");
  assert.equal(siteUrl("m", "m", "m"), "../../index.html");
  assert.equal(siteUrl("b", "m", "m"), "../../index.html");
  assert.equal(siteUrl("b", "b", "m"), "index.html");
  assert.equal(siteUrl("b", "c", "m"), "../c/index.html");
});

test("сборка сайта: основной пак в корне и в packs/<id>/, остальные — в packs/<id>/, ссылки ведут на существующие файлы", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gvozdi-site-"));
  try {
    const packsDir = join(dir, "packs");
    const src = join(root, "fixtures", "mini-pack");
    // два пака: фикстура как есть и её копия с другим id
    const a = join(packsDir, "a");
    const b = join(packsDir, "b");
    cpSync(src, a, { recursive: true });
    cpSync(src, b, { recursive: true });
    const meta = JSON.parse(readFileSync(join(b, "pack.json"), "utf8"));
    const mainId = meta.id as string;
    meta.id = `${mainId}_copy`;
    meta.name = "Копия";
    delete meta.description;
    writeFileSync(join(b, "pack.json"), JSON.stringify(meta));
    mkdirSync(join(packsDir, "not-a-pack")); // папка без pack.json пропускается

    const out = join(dir, "dist");
    const { files } = await buildSite(packsDir, out, mainId);
    assert.equal(files.length, 3);
    const pages = [join(out, "index.html"), join(out, "packs", mainId, "index.html"), join(out, "packs", meta.id, "index.html")];
    for (const p of pages) {
      assert.ok(existsSync(p), p);
      const html = readFileSync(p, "utf8");
      const list = JSON.parse(html.match(/id="pack-list">([\s\S]*?)<\/script>/)![1]) as { id: string; url: string; description: string | null }[];
      assert.equal(list.length, 2);
      assert.equal(list[0].id, mainId, "основной — первым");
      assert.equal(list.find((x) => x.id === meta.id)!.description, null);
      for (const e of list) {
        assert.ok(!e.url.startsWith("/") && !/^[a-z]+:/i.test(e.url), `ссылка относительная: ${e.url}`);
        assert.ok(existsSync(resolve(dirname(p), e.url)), `${p} → ${e.url}`);
      }
    }
    const rootPack = JSON.parse(readFileSync(pages[0], "utf8").match(/id="pack-data">([\s\S]*?)<\/script>/)![1]);
    assert.equal(rootPack.pack.id, mainId, "в корне — основной пак");
    await assert.rejects(buildSite(packsDir, out, "nope"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
