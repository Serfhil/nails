// Точка входа в браузере: читает встроенный пак, создаёт игру через движок, подключает DOM.

import { createGame, loadGame } from "../../engine/src/index.ts";
import type { GameApi, Pack } from "./contract.ts";
import { mount, type DocLike } from "./dom.ts";
import { parsePackList } from "./packs.ts";
import { S } from "./strings.ts";

const api = { createGame, loadGame } as unknown as GameApi;

export function boot(doc: DocLike, storage: Storage | null): void {
  const root = doc.getElementById("app");
  const data = doc.getElementById("pack-data");
  if (!root) return;
  if (!data || !data.textContent) {
    root.textContent = S.packMissing;
    return;
  }
  const pack = JSON.parse(data.textContent) as Pack;
  const packs = parsePackList(doc.getElementById("pack-list")?.textContent);
  const app = mount(root, { api, pack, packs, storage, random: Math.random });
  doc.title = app.view.meta.game_title;
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

if (typeof document !== "undefined") {
  boot(document as unknown as DocLike, localStorageOrNull());
}
