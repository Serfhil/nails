# Гвозди для графа

Текстовый инкрементал про деревенскую кузню, играется на телефоне. Движок не знает конкретной игры; игра целиком описана паком (JSON).

**Играть:** https://serfhil.github.io/nails/

## Устройство

Проект — в [`gvozdi-v2/`](gvozdi-v2/):

| Папка | Что это |
|---|---|
| `engine/` | движок: время, переменные, модификаторы, события, вид |
| `validator/` | проверка пака (коды `Vxxx` / `Wxxx`) |
| `ui/` | веб-интерфейс и сборка в самодостаточный HTML |
| `simulator/` | прогоны стратегий и метрика скрытого контента |
| `packs/` | паки игр (`nails_for_count` — основной) |
| `fixtures/` | мини-пак и сломанные паки для тестов |

Правила проекта и роли — [`gvozdi-v2/claude.md`](gvozdi-v2/claude.md), контракт движка — [`gvozdi-v2/core.md`](gvozdi-v2/core.md). Граф проекта — `graphify-out/`.

## Команды

Из `gvozdi-v2/`, Node ≥ 20:

```
npm ci
npm test                 # все тесты
npm run validate -- packs/nails_for_count
npm run build:site       # dist/: основной пак в index.html, остальные в packs/<id>/
npm run sim -- --pack packs/nails_for_count --strategy all --runs 50 --out sim-out
```

Каждый push в `main` проверяется и публикуется на GitHub Pages (`.github/workflows/pages.yml`).
