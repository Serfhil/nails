// Сохранение в localStorage: ключ включает id пака.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveKey(packId: string): string {
  return `gvozdi-v2:${packId}:save`;
}

export function uiKey(packId: string): string {
  return `gvozdi-v2:${packId}:ui`;
}

/** Обёртка, которая не падает, если хранилище недоступно или переполнено. */
export function safeStorage(s: StorageLike | null): { store: StorageLike | null; ok: boolean } {
  if (!s) return { store: null, ok: false };
  try {
    const probe = "gvozdi-v2:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return { store: s, ok: true };
  } catch {
    return { store: null, ok: false };
  }
}

export function read(s: StorageLike | null, key: string): string | null {
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

export function write(s: StorageLike | null, key: string, value: string): boolean {
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(s: StorageLike | null, key: string): void {
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* ничего */
  }
}

/** Память в оперативке — для тестов. */
export function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}
