const STORAGE_NAMESPACE = "lemonspace.credit-activity";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

type CachePayload<TActivity> = {
  version: number;
  cachedAt: number;
  activity: TActivity;
};

type JsonRecord = Record<string, unknown>;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cacheKey(userId: string): string {
  return `${STORAGE_NAMESPACE}:v${CACHE_VERSION}:${userId}`;
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    if (typeof storage.getItem === "function") {
      return storage.getItem(key);
    }
  } catch {
    // Ignore storage read failures in UX cache layer.
  }
  return null;
}

function safeSet(storage: Storage, key: string, value: string): void {
  try {
    if (typeof storage.setItem === "function") {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore quota/storage write failures in UX cache layer.
  }
}

function safeRemove(storage: Storage, key: string): void {
  try {
    if (typeof storage.removeItem === "function") {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage remove failures in UX cache layer.
  }
}

export function readCreditActivityCache<TActivity>(
  userId: string,
  options?: { now?: number; ttlMs?: number },
): CachePayload<TActivity> | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const parsed = safeParse(safeGet(storage, cacheKey(userId)));
  if (!isRecord(parsed)) return null;
  if (parsed.version !== CACHE_VERSION) return null;
  if (typeof parsed.cachedAt !== "number") return null;
  if (!("activity" in parsed)) return null;

  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const now = options?.now ?? Date.now();
  if (now - parsed.cachedAt > ttlMs) {
    safeRemove(storage, cacheKey(userId));
    return null;
  }

  return {
    version: CACHE_VERSION,
    cachedAt: parsed.cachedAt,
    activity: parsed.activity as TActivity,
  };
}

export function writeCreditActivityCache<TActivity>(
  userId: string,
  activity: TActivity,
): void {
  const storage = getLocalStorage();
  if (!storage) return;

  safeSet(
    storage,
    cacheKey(userId),
    JSON.stringify({
      version: CACHE_VERSION,
      cachedAt: Date.now(),
      activity,
    }),
  );
}

export function clearCreditActivityCache(userId: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  safeRemove(storage, cacheKey(userId));
}
