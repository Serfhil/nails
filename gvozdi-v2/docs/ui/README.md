# Интерфейс — обзор

Обычный веб (TypeScript + DOM + CSS), без фреймворков. Интерфейс показывает `game.view()` и отправляет команды `game.perform()` (core.md 5). Ничего не считает, не знает ни одного id, названия или текста пака.

## Модули (`/ui`)
| Файл | Назначение | Описание |
|---|---|---|
| `src/contract.ts` | типы контракта core.md 5 | [contract.md](contract.md) |
| `src/strings.ts` | все тексты самого интерфейса | [strings.md](strings.md) |
| `src/model.ts` | чистая логика «что показывать» | [model.md](model.md) |
| `src/render.ts` | View + состояние интерфейса → HTML-строка | [render.md](render.md) |
| `src/app.ts` | контроллер: события → команды, сохранение | [app.md](app.md) |
| `src/storage.ts` | localStorage с ключом по id пака | [storage.md](storage.md) |
| `src/packs.ts` | список паков сборки для окна «Настройки» | [packs.md](packs.md) |
| `src/dom.ts`, `src/main.ts` | подключение к странице | [dom.md](dom.md) |
| `src/styles.css` | оформление, тема в CSS-переменных | [styles.md](styles.md) |
| `src/stub.ts` | заглушка вида для разработки и тестов | [stub.md](stub.md) |
| `build.ts` | сборка в один HTML и сайт из всех паков | [build.md](build.md) |

## Поток
```
main.ts  читает пак из <script id="pack-data"> и список паков из <script id="pack-list">, mount(#app)
dom.ts   клики и изменения по data-act  ->  app.handle(event)
app.ts   Command -> game.perform() -> Result.view -> render.ts -> root.innerHTML
```
Перерисовка — целиком по каждому событию, меняющему экран. Поля количества на рынке при вводе не перерисовываются (чтобы не терять фокус).

## Проверка
```
npm run test:ui          # логика, рендер, контроллер, DOM-подключение; заглушка и фикстура через движок
npm run build:fixture    # dist/mini-pack.html
npm run build            # dist/index.html (пак nails_for_count)
npm run build:site       # dist/index.html (основной пак) + dist/packs/<id>/index.html
```
