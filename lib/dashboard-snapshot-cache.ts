const STORAGE_NAMESPACE = "lemonspace.dashboard";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const LAST_DASHBOARD_USER_KEY = "ls-last-dashboard-user";
const INVALIDATION_SIGNAL_KEY = `${STORAGE_NAMESPACE}:snapshot:invalidate:v${CACHE_VERSION}`;

type JsonRecord = Record<string, unknown>;

type DashboardSnapshotCachePayload<TSnapshot> = {
  version: number;
  cachedAt: number;
  snapshot: TSnapshot;
};

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
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
  return `${STORAGE_NAMESPACE}:snapshot:v${CACHE_VERSION}:${userId}`;
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
    // Ignore storage write failures in UX cache layer.
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

export function readDashboardSnapshotCache<TSnapshot>(
  userId: string,
  options?: { now?: number; ttlMs?: number },
): DashboardSnapshotCachePayload<TSnapshot> | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const parsed = safeParse(safeGet(storage, cacheKey(userId)));
  if (!isRecord(parsed)) return null;
  if (parsed.version !== CACHE_VERSION) return null;
  if (typeof parsed.cachedAt !== "number") return null;
  if (!("snapshot" in parsed)) return null;

  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const now = options?.now ?? Date.now();
  if (now - parsed.cachedAt > ttlMs) {
    safeRemove(storage, cacheKey(userId));
    return null;
  }

  return {
    version: CACHE_VERSION,
    cachedAt: parsed.cachedAt,
    snapshot: parsed.snapshot as TSnapshot,
  };
}

export function writeDashboardSnapshotCache<TSnapshot>(
  userId: string,
  snapshot: TSnapshot,
): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    safeSet(
      storage,
      cacheKey(userId),
      JSON.stringify({
        version: CACHE_VERSION,
        cachedAt: Date.now(),
        snapshot,
      }),
    );
  } catch {
    // Ignore quota/storage write errors in UX cache layer.
  }
}

export function clearDashboardSnapshotCache(userId: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  safeRemove(storage, cacheKey(userId));
}

export function invalidateDashboardSnapshotForLastSignedInUser(): void {
  const sessionStorage = getSessionStorage();
  if (!sessionStorage) return;

  const userId = safeGet(sessionStorage, LAST_DASHBOARD_USER_KEY);
  if (!userId) return;
  clearDashboardSnapshotCache(userId);
}

export function emitDashboardSnapshotCacheInvalidationSignal(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  safeSet(storage, INVALIDATION_SIGNAL_KEY, String(Date.now()));
}

export function getDashboardSnapshotCacheInvalidationSignalKey(): string {
  return INVALIDATION_SIGNAL_KEY;
}
