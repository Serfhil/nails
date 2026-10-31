// Сборка игры в один самодостаточный HTML: интерфейс + движок + пак.
// Запуск: tsx ui/build.ts <папка пака> <выходной html>
//         tsx ui/build.ts --site <папка паков> <выходная папка> --main <id>   (сайт, view.md 3.14)

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import type { PackEntry } from "./src/packs.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** Пак в форме CI-001: ключи — имена файлов без .json, значения — разобранный JSON. */
export function readPack(dir: string): Record<string, unknown> {
  const pack: Record<string, unknown> = {};
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  for (const f of files) {
    const full = join(dir, f);
    if (!statSync(full).isFile()) continue;
    const text = readFileSync(full, "utf8").replace(/^﻿/, "");
    try {
      pack[basename(f, ".json")] = JSON.parse(text);
    } catch (e) {
      throw new Error(`Не разобран JSON ${full}: ${(e as Error).message}`);
    }
  }
  if (!pack.pack) throw new Error(`В ${dir} нет pack.json`);
  return pack;
}

/** JSON, безопасный внутри <script>. */
export function jsonForScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, () => "\\u003c");
}

export async function bundle(): Promise<string> {
  const r = await esbuild.build({
    entryPoints: [join(here, "src", "main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    charset: "utf8",
    logLevel: "silent",
  });
  if (r.errors.length) throw new Error(r.errors.map((e) => e.text).join("\n"));
  return r.outputFiles[0].text;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function page(opts: { title: string; css: string; js: string; packJson: string; packListJson?: string }): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#4a2f1d">
<title>${escHtml(opts.title)}</title>
<style>
${opts.css}
</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="pack-data">${opts.packJson}</script>
<script type="application/json" id="pack-list">${opts.packListJson ?? "[]"}</script>
<script>
${opts.js.replace(/<\/script/gi, "<\\/script")}
</script>
</body>
</html>
`;
}

/** Сведения о паке для списка паков (из pack.json); url заполняет вызывающий. */
export function packInfo(pack: Record<string, unknown>): Omit<PackEntry, "url"> {
  const m = pack.pack as { id?: unknown; name?: unknown; version?: unknown; description?: unknown };
  const id = String(m.id ?? "");
  return {
    id,
    name: typeof m.name === "string" ? m.name : id,
    version: typeof m.version === "string" ? m.version : "",
    description: typeof m.description === "string" && m.description !== "" ? m.description : null,
  };
}

/** Одна страница: пак + список паков (ссылки уже относительно этой страницы). */
function writePage(out: string, pack: Record<string, unknown>, packs: PackEntry[], css: string, js: string): number {
  const title = packInfo(pack).name;
  const html = page({ title, css, js, packJson: jsonForScript(pack), packListJson: jsonForScript(packs) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  return Buffer.byteLength(html);
}

function readCss(): string {
  return readFileSync(join(here, "src", "styles.css"), "utf8");
}

/** Один пак в один HTML; список паков — из одного текущего. */
export async function build(packDir: string, out: string): Promise<{ bytes: number }> {
  const pack = readPack(packDir);
  const packs: PackEntry[] = [{ ...packInfo(pack), url: basename(out) }];
  const bytes = writePage(out, pack, packs, readCss(), await bundle());
  return { bytes };
}

/**
 * Относительные ссылки на страницы паков для страницы `from`:
 * "root" — <out>/index.html (основной пак), иначе id пака — <out>/packs/<id>/index.html.
 * index.html пишется явно: так ссылки работают и с диска (file://), и из подпапки GitHub Pages.
 */
export function siteUrl(from: string, to: string, mainId: string): string {
  if (from === "root") return to === mainId ? "index.html" : `packs/${encodeURIComponent(to)}/index.html`;
  if (to === mainId) return "../../index.html";
  return to === from ? "index.html" : `../${encodeURIComponent(to)}/index.html`;
}

/** Сайт: каждый пак из packsDir/* — в <outDir>/packs/<id>/index.html, основной — ещё и в <outDir>/index.html. */
export async function buildSite(packsDir: string, outDir: string, mainId: string): Promise<{ files: string[] }> {
  const dirs = readdirSync(packsDir)
    .map((d) => join(packsDir, d))
    .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "pack.json")))
    .sort();
  if (dirs.length === 0) throw new Error(`В ${packsDir} нет паков (папок с pack.json)`);
  const packs = dirs.map((d) => readPack(d));
  const infos = packs.map(packInfo);
  const ids = new Set<string>();
  for (const i of infos) {
    if (!i.id) throw new Error("У пака нет id в pack.json");
    if (ids.has(i.id)) throw new Error(`Два пака с id ${i.id}`);
    ids.add(i.id);
  }
  if (!ids.has(mainId)) throw new Error(`Основной пак ${mainId} не найден в ${packsDir} (есть: ${[...ids].join(", ")})`);
  // основной — первым в списке, остальные по порядку папок
  const order = [...infos].sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : 0));
  const listFor = (from: string): PackEntry[] => order.map((i) => ({ ...i, url: siteUrl(from, i.id, mainId) }));

  const css = readCss();
  const js = await bundle();
  const files: string[] = [];
  packs.forEach((pack, k) => {
    const id = infos[k].id;
    const out = join(outDir, "packs", id, "index.html");
    writePage(out, pack, listFor(id), css, js);
    files.push(out);
    if (id === mainId) {
      const rootOut = join(outDir, "index.html");
      writePage(rootOut, pack, listFor("root"), css, js);
      files.push(rootOut);
    }
  });
  return { files };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
function fail(e: unknown): never {
  console.error(`Сборка не удалась: ${(e as Error).message}`);
  process.exit(1);
}

if (isMain && process.argv[2] === "--site") {
  const args = process.argv.slice(3);
  const mi = args.indexOf("--main");
  const mainId = mi >= 0 ? args[mi + 1] : undefined;
  const [packsDir, outDir] = mi >= 0 ? args.filter((_, i) => i !== mi && i !== mi + 1) : args;
  if (!packsDir || !outDir || !mainId) {
    console.error("Использование: tsx ui/build.ts --site <папка паков> <выходная папка> --main <id>");
    process.exit(2);
  }
  buildSite(resolve(packsDir), resolve(outDir), mainId).then(
    ({ files }) => console.log([`Собран сайт: ${files.length} стр.`, ...files.map((f) => `  ${f}`)].join("\n")),
    fail,
  );
} else if (isMain) {
  const [packDir, out] = process.argv.slice(2);
  if (!packDir || !out) {
    console.error("Использование: tsx ui/build.ts <папка пака> <выходной html>");
    process.exit(2);
  }
  build(resolve(packDir), resolve(out)).then(
    ({ bytes }) => console.log(`Собрано: ${out} (${Math.round(bytes / 1024)} КБ)`),
    fail,
  );
}
