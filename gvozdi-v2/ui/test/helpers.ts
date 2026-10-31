// Помощники тестов: фейковый корень и элементы DOM.
import type { ElLike, RootLike } from "../src/dom.ts";

/** Минимальный корень: хранит innerHTML и обработчики. */
export function fakeRoot() {
  const handlers: Record<string, ((e: { target: unknown }) => void)[]> = {};
  const root: RootLike & { fire(type: string, target: unknown): void } = {
    innerHTML: "",
    textContent: null,
    addEventListener(type, fn) {
      (handlers[type] ??= []).push(fn);
    },
    fire(type, target) {
      for (const fn of handlers[type] ?? []) fn({ target });
    },
  };
  return root;
}

/** Фейковый элемент с data-атрибутами; closest находит сам себя. */
export function el(tagName: string, dataset: Record<string, string>, extra: Partial<ElLike> = {}): ElLike {
  const e: ElLike = { tagName, dataset, closest: () => e, ...extra };
  return e;
}

