// Подключение контроллера к DOM: перерисовка корня и делегирование событий по data-act.
// Типы DOM здесь минимальные, чтобы модуль можно было проверить фейковым документом в Node.

import { createApp, type App, type AppOptions } from "./app.ts";

export interface ElLike {
  tagName: string;
  dataset: Record<string, string | undefined>;
  value?: string;
  checked?: boolean;
  type?: string;
  closest(selector: string): ElLike | null;
}

/** Элемент, которому можно вернуть фокус и положение прокрутки (есть только в настоящем браузере). */
export interface FocusLike {
  tagName?: string;
  dataset?: Record<string, string | undefined>;
  scrollTop?: number;
  value?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  setSelectionRange?(start: number, end: number): void;
  focus?(opts?: { preventScroll?: boolean }): void;
}

export interface RootLike {
  innerHTML: string;
  textContent: string | null;
  addEventListener(type: string, fn: (e: { target: unknown }) => void): void;
  querySelector?(selector: string): FocusLike | null;
  ownerDocument?: { activeElement: FocusLike | null };
}

export interface DocLike {
  title: string;
  getElementById(id: string): (RootLike & { textContent: string | null }) | null;
}

function actor(target: unknown): ElLike | null {
  const t = target as ElLike | null;
  if (!t || typeof t.closest !== "function") return null;
  return t.closest("[data-act]");
}

/** Селектор поля по его data-атрибутам (act, id, char …). */
function selectorOf(el: FocusLike): string | null {
  const ds = el.dataset;
  if (!ds || !ds.act || !["INPUT"].includes(el.tagName ?? "")) return null;
  return Object.entries(ds)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `[data-${k}="${String(v).replace(/["\\]/g, "\\$&")}"]`)
    .join("");
}

/** Перерисовка с сохранением фокуса поля и прокрутки списка склада. */
function render(root: RootLike, html: string): void {
  const active = root.ownerDocument?.activeElement ?? null;
  const sel = active ? selectorOf(active) : null;
  const caret: [number, number] | null =
    active && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd ?? active.selectionStart] : null;
  const list = root.querySelector?.("[data-scroll]") ?? null;
  const listKey = list?.dataset?.scroll;
  const top = list?.scrollTop ?? 0;
  root.innerHTML = html;
  try {
    if (listKey) {
      const again = root.querySelector?.(`[data-scroll="${listKey}"]`);
      if (again) again.scrollTop = top;
    }
    if (sel) {
      const next = root.querySelector?.(sel);
      next?.focus?.({ preventScroll: true });
      // текстовое поле: вернуть курсор, не дальше конца нового значения
      if (next && caret) {
        const len = next.value?.length ?? 0;
        next.setSelectionRange?.(Math.min(caret[0], len), Math.min(caret[1], len));
      }
    }
  } catch {
    /* фокус и прокрутка — удобство, не требование */
  }
}

export function mount(root: RootLike, opts: Omit<AppOptions, "onRender">): App {
  const app = createApp({
    ...opts,
    onRender: (html) => render(root, html),
  });
  root.innerHTML = app.html();

  root.addEventListener("click", (e) => {
    // тап мимо окна: нажат сам фон окна (не его содержимое) — событие из data-backdrop
    const t = e.target as Partial<ElLike> | null;
    const back = t && t.dataset ? t.dataset.backdrop : undefined;
    if (back) {
      app.handle({ act: back });
      return;
    }
    const el = actor(e.target);
    if (!el) {
      app.handle({ act: "dd-close" }); // нажатие мимо закрывает выпадающий список
      return;
    }
    if (el.tagName !== "BUTTON") return;
    app.handle({ act: el.dataset.act!, data: { ...el.dataset } });
  });

  root.addEventListener("change", (e) => {
    const el = actor(e.target);
    if (!el || el.tagName === "BUTTON") return;
    app.handle({ act: el.dataset.act!, data: { ...el.dataset }, value: el.value, checked: el.checked });
  });

  root.addEventListener("input", (e) => {
    const el = actor(e.target);
    if (!el || el.tagName !== "INPUT" || (el.type !== "number" && el.type !== "text")) return;
    app.handle({ act: el.dataset.act!, data: { ...el.dataset }, value: el.value });
  });

  return app;
}
