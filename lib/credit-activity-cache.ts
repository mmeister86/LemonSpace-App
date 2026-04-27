import {
  createVersionedStorageCache,
  getLocalStorage,
} from "@/lib/browser-storage-cache";

const STORAGE_NAMESPACE = "lemonspace.credit-activity";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

type CachePayload<TActivity> = {
  version: number;
  cachedAt: number;
  activity: TActivity;
};

function cacheKey(userId: string): string {
  return `${STORAGE_NAMESPACE}:v${CACHE_VERSION}:${userId}`;
}

const activityCache = createVersionedStorageCache<unknown, "activity">({
  version: CACHE_VERSION,
  ttlMs: DEFAULT_TTL_MS,
  valueKey: "activity",
  getStorage: getLocalStorage,
  getKey: cacheKey,
});

export function readCreditActivityCache<TActivity>(
  userId: string,
  options?: { now?: number; ttlMs?: number },
): CachePayload<TActivity> | null {
  const cached = activityCache.read(userId, options);
  return cached as CachePayload<TActivity> | null;
}

export function writeCreditActivityCache<TActivity>(
  userId: string,
  activity: TActivity,
): void {
  activityCache.write(userId, activity);
}

export function clearCreditActivityCache(userId: string): void {
  activityCache.clear(userId);
}
