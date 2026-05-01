/**
 * Onboarding note:
 * Shared TypeScript utility for browser storage cache. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type JsonRecord = Record<string, unknown>;

export type VersionedCachePayload<TValue, TValueKey extends string> = {
  version: number;
  cachedAt: number;
} & Record<TValueKey, TValue>;

type BrowserStorageName = "localStorage" | "sessionStorage";

type VersionedStorageCacheOptions<TValueKey extends string> = {
  version: number;
  ttlMs: number;
  valueKey: TValueKey;
  getStorage: () => Storage | null;
  getKey: (scopeId: string) => string;
};

type ReadOptions = {
  now?: number;
  ttlMs?: number;
};

type WriteOptions = {
  now?: number;
};

export function getBrowserStorage(name: BrowserStorageName): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

export function getLocalStorage(): Storage | null {
  return getBrowserStorage("localStorage");
}

export function getSessionStorage(): Storage | null {
  return getBrowserStorage("sessionStorage");
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

export function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    if (typeof storage.getItem === "function") {
      return storage.getItem(key);
    }
  } catch {
    // Browser storage can be denied or unavailable; cache reads must stay optional.
  }
  return null;
}

export function safeStorageSet(
  storage: Storage,
  key: string,
  value: string,
): void {
  try {
    if (typeof storage.setItem === "function") {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore quota and permission failures in UX cache layers.
  }
}

export function safeStorageRemove(storage: Storage, key: string): void {
  try {
    if (typeof storage.removeItem === "function") {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage remove failures in UX cache layers.
  }
}

export function createVersionedStorageCache<
  TValue,
  TValueKey extends string,
>(options: VersionedStorageCacheOptions<TValueKey>) {
  function read(
    scopeId: string,
    readOptions?: ReadOptions,
  ): VersionedCachePayload<TValue, TValueKey> | null {
    const storage = options.getStorage();
    if (!storage) return null;

    const key = options.getKey(scopeId);
    const parsed = safeJsonParse(safeStorageGet(storage, key));
    if (!isJsonRecord(parsed)) return null;
    if (parsed.version !== options.version) return null;
    if (typeof parsed.cachedAt !== "number") return null;
    if (!(options.valueKey in parsed)) return null;

    const ttlMs = readOptions?.ttlMs ?? options.ttlMs;
    const now = readOptions?.now ?? Date.now();
    if (now - parsed.cachedAt > ttlMs) {
      safeStorageRemove(storage, key);
      return null;
    }

    return {
      version: options.version,
      cachedAt: parsed.cachedAt,
      [options.valueKey]: parsed[options.valueKey] as TValue,
    } as VersionedCachePayload<TValue, TValueKey>;
  }

  function write(scopeId: string, value: TValue, writeOptions?: WriteOptions): void {
    const storage = options.getStorage();
    if (!storage) return;

    safeStorageSet(
      storage,
      options.getKey(scopeId),
      JSON.stringify({
        version: options.version,
        cachedAt: writeOptions?.now ?? Date.now(),
        [options.valueKey]: value,
      }),
    );
  }

  function clear(scopeId: string): void {
    const storage = options.getStorage();
    if (!storage) return;
    safeStorageRemove(storage, options.getKey(scopeId));
  }

  return { clear, read, write };
}
