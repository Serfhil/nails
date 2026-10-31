// Список паков сборки для окна «Настройки» (view.md 3.14). Не из движка: его кладёт в страницу ui/build.ts
// (<script type="application/json" id="pack-list">). Ссылки относительные, готовые для этой страницы.

import type { View } from "./contract.ts";

export interface PackEntry {
  id: string;
  name: string;
  version: string;
  description: string | null;
  /** Относительная ссылка на страницу пака от текущей страницы. */
  url: string;
}

/** Разобрать вложенный список; кривые записи отбрасываются, не JSON — пустой список. */
export function parsePackList(text: string | null | undefined): PackEntry[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: PackEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.url !== "string") continue;
    out.push({
      id: o.id,
      name: typeof o.name === "string" ? o.name : o.id,
      version: typeof o.version === "string" ? o.version : "",
      description: typeof o.description === "string" && o.description !== "" ? o.description : null,
      url: o.url,
    });
  }
  return out;
}

/** Список для окна: вложенный, а если его нет или в нём нет текущего — текущий пак из вида добавляется (пак один — пункт всё равно виден). */
export function packsForView(view: View, list: PackEntry[]): PackEntry[] {
  if (list.some((p) => p.id === view.meta.pack_id)) return list;
  const self: PackEntry = {
    id: view.meta.pack_id,
    name: view.meta.game_title,
    version: view.meta.pack_version,
    description: view.meta.pack_description,
    url: "",
  };
  return [self, ...list];
}
