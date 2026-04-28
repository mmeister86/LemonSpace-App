import {
  createVersionedStorageCache,
  getLocalStorage,
  getSessionStorage,
  safeStorageGet,
  safeStorageSet,
} from "@/lib/browser-storage-cache";

const STORAGE_NAMESPACE = "lemonspace.dashboard";
const CACHE_VERSION = 2;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const LAST_DASHBOARD_USER_KEY = "ls-last-dashboard-user";
const INVALIDATION_SIGNAL_KEY = `${STORAGE_NAMESPACE}:snapshot:invalidate:v${CACHE_VERSION}`;

type DashboardSnapshotCachePayload<TSnapshot> = {
  version: number;
  cachedAt: number;
  snapshot: TSnapshot;
};

function cacheKey(userId: string): string {
  return `${STORAGE_NAMESPACE}:snapshot:v${CACHE_VERSION}:${userId}`;
}

const snapshotCache = createVersionedStorageCache<unknown, "snapshot">({
  version: CACHE_VERSION,
  ttlMs: DEFAULT_TTL_MS,
  valueKey: "snapshot",
  getStorage: getLocalStorage,
  getKey: cacheKey,
});

export function readDashboardSnapshotCache<TSnapshot>(
  userId: string,
  options?: { now?: number; ttlMs?: number },
): DashboardSnapshotCachePayload<TSnapshot> | null {
  const cached = snapshotCache.read(userId, options);
  return cached as DashboardSnapshotCachePayload<TSnapshot> | null;
}

export function writeDashboardSnapshotCache<TSnapshot>(
  userId: string,
  snapshot: TSnapshot,
): void {
  snapshotCache.write(userId, snapshot);
}

export function clearDashboardSnapshotCache(userId: string): void {
  snapshotCache.clear(userId);
}

export function invalidateDashboardSnapshotForLastSignedInUser(): void {
  const sessionStorage = getSessionStorage();
  if (!sessionStorage) return;

  const userId = safeStorageGet(sessionStorage, LAST_DASHBOARD_USER_KEY);
  if (!userId) return;
  clearDashboardSnapshotCache(userId);
}

export function emitDashboardSnapshotCacheInvalidationSignal(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  safeStorageSet(storage, INVALIDATION_SIGNAL_KEY, String(Date.now()));
}

export function getDashboardSnapshotCacheInvalidationSignalKey(): string {
  return INVALIDATION_SIGNAL_KEY;
}
