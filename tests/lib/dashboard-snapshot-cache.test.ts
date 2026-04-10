/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDashboardSnapshotCache,
  emitDashboardSnapshotCacheInvalidationSignal,
  getDashboardSnapshotCacheInvalidationSignalKey,
  invalidateDashboardSnapshotForLastSignedInUser,
  readDashboardSnapshotCache,
  writeDashboardSnapshotCache,
} from "@/lib/dashboard-snapshot-cache";

const USER_ID = "user-cache-test";
const LAST_DASHBOARD_USER_KEY = "ls-last-dashboard-user";
const INVALIDATION_SIGNAL_KEY = getDashboardSnapshotCacheInvalidationSignalKey();

describe("dashboard snapshot cache", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    const sessionData = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    const sessionStorageMock = {
      getItem: (key: string) => sessionData.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionData.set(key, value);
      },
      removeItem: (key: string) => {
        sessionData.delete(key);
      },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
    });

    clearDashboardSnapshotCache(USER_ID);
  });

  it("reads back a written snapshot", () => {
    const snapshot = {
      balance: { available: 320 },
      generatedAt: 100,
    };

    writeDashboardSnapshotCache(USER_ID, snapshot);
    const cached = readDashboardSnapshotCache<typeof snapshot>(USER_ID);

    expect(cached?.snapshot).toEqual(snapshot);
    expect(typeof cached?.cachedAt).toBe("number");
  });

  it("invalidates stale cache entries via ttl", () => {
    const snapshot = {
      balance: { available: 100 },
      generatedAt: 50,
    };

    writeDashboardSnapshotCache(USER_ID, snapshot);
    const fresh = readDashboardSnapshotCache<typeof snapshot>(USER_ID, {
      now: Date.now(),
      ttlMs: 60_000,
    });
    expect(fresh?.snapshot).toEqual(snapshot);

    const stale = readDashboardSnapshotCache<typeof snapshot>(USER_ID, {
      now: Date.now() + 61_000,
      ttlMs: 60_000,
    });
    expect(stale).toBeNull();
  });

  it("clears user cache explicitly", () => {
    writeDashboardSnapshotCache(USER_ID, { generatedAt: 1 });
    clearDashboardSnapshotCache(USER_ID);

    expect(readDashboardSnapshotCache(USER_ID)).toBeNull();
  });

  it("invalidates cache for the last signed-in user", () => {
    writeDashboardSnapshotCache(USER_ID, { generatedAt: 1 });
    window.sessionStorage.setItem(LAST_DASHBOARD_USER_KEY, USER_ID);

    invalidateDashboardSnapshotForLastSignedInUser();

    expect(readDashboardSnapshotCache(USER_ID)).toBeNull();
    expect(window.sessionStorage.getItem(LAST_DASHBOARD_USER_KEY)).toBe(USER_ID);
  });

  it("does not fail if no last dashboard user exists", () => {
    expect(() => invalidateDashboardSnapshotForLastSignedInUser()).not.toThrow();
  });

  it("emits a localStorage invalidation signal", () => {
    emitDashboardSnapshotCacheInvalidationSignal();

    const signal = window.localStorage.getItem(INVALIDATION_SIGNAL_KEY);
    expect(typeof signal).toBe("string");
    expect(Number(signal)).toBeGreaterThan(0);
  });
});
