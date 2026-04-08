/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDashboardSnapshotCache,
  readDashboardSnapshotCache,
  writeDashboardSnapshotCache,
} from "@/lib/dashboard-snapshot-cache";

const USER_ID = "user-cache-test";

describe("dashboard snapshot cache", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
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
});
