# build.ts — сборка

## Один пак в один HTML
`tsx ui/build.ts <папка пака> <выходной html>` (`npm run build`, `npm run build:fixture`).

1. `readPack(dir)` — все `*.json` папки в объект формы CI-001 (ключ — имя файла без `.json`); без `pack.json` — ошибка.
2. `bundle()` — esbuild: `ui/src/main.ts` + движок (`engine/src/index.ts`) в один IIFE, ES2020, минифицированный.
3. `page()` — HTML: `styles.css` в `<style>`, пак в `<script type="application/json" id="pack-data">`, список паков в `<script type="application/json" id="pack-list">` (`<` экранирован как `<`), бандл в `<script>`. `<title>` — `pack.name` (после запуска заменяется на `view.meta.game_title`).
4. Список паков обычной сборки — из одного текущего (`url` — имя выходного файла).
5. Внешний запрос — только шрифты Google Fonts; без сети работают системные шрифты-фолбэки.

## Сайт (view.md 3.14, «Сборка сайта»)
`tsx ui/build.ts --site <папка паков> <выходная папка> --main <id>` (`npm run build:site` = `--site packs dist --main nails_for_count`).

- Паки — подпапки `<папка паков>/*` с `pack.json` (остальные пропускаются; фикстуры не входят, если их не передать). Одинаковые `id` или отсутствие основного `id` — ошибка.
- Каждый пак → `<выход>/packs/<id>/index.html`; основной — ещё и `<выход>/index.html` (при открытии сайта сразу грузится он, меню выбора нет).
- Бандл и CSS собираются один раз; в каждую страницу вкладывается свой список `{ id, name, version, description, url }` (основной — первым) с относительными ссылками именно от этой страницы (`siteUrl`):

| Страница | → основной | → свой | → другой `x` |
|---|---|---|---|
| `index.html` | `index.html` | — | `packs/x/index.html` |
| `packs/<id>/index.html` | `../../index.html` | `index.html` | `../x/index.html` |

  `index.html` пишется явно: ссылки работают и из подпапки GitHub Pages (`/nails/`), и при открытии файла с диска (`file://`).
- Старые папки `<выход>/packs/*` удалённых паков сборка не стирает.
