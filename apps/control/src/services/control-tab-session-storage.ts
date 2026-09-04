type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type TabStorageResolver = () => TabStorage | null;

function resolveBrowserTabStorage(): TabStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists the Control session only for the lifetime of the current browser tab.
 * A memory fallback keeps authentication usable when sessionStorage is unavailable,
 * without widening persistence beyond the current tab.
 */
export function createControlTabSessionStorage(
  resolveStorage: TabStorageResolver = resolveBrowserTabStorage,
) {
  const memoryValues = new Map<string, string>();

  const getStorage = () => {
    try {
      return resolveStorage();
    } catch {
      return null;
    }
  };

  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return getStorage()?.getItem(key) ?? memoryValues.get(key) ?? null;
      } catch {
        return memoryValues.get(key) ?? null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        const storage = getStorage();
        if (storage) {
          storage.setItem(key, value);
          memoryValues.delete(key);
          return;
        }
      } catch {
        // The volatile fallback below keeps the session scoped to this runtime.
      }
      memoryValues.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      memoryValues.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        // The in-memory value was already removed; keep sign-out fail closed.
      }
    },
  };
}

export const controlTabSessionStorage = createControlTabSessionStorage();
