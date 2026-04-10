/* @vitest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuthQueryMock = vi.hoisted(() => vi.fn());
const readDashboardSnapshotCacheMock = vi.hoisted(() => vi.fn());
const writeDashboardSnapshotCacheMock = vi.hoisted(() => vi.fn());
const clearDashboardSnapshotCacheMock = vi.hoisted(() => vi.fn());
const getDashboardSnapshotCacheInvalidationSignalKeyMock = vi.hoisted(() => vi.fn());

vi.mock("@/convex/_generated/api", () => ({
  api: {
    dashboard: { getSnapshot: "dashboard.getSnapshot" },
  },
}));

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: useAuthQueryMock,
}));

vi.mock("@/lib/dashboard-snapshot-cache", () => ({
  readDashboardSnapshotCache: readDashboardSnapshotCacheMock,
  writeDashboardSnapshotCache: writeDashboardSnapshotCacheMock,
  clearDashboardSnapshotCache: clearDashboardSnapshotCacheMock,
  getDashboardSnapshotCacheInvalidationSignalKey:
    getDashboardSnapshotCacheInvalidationSignalKeyMock,
}));

import { useDashboardSnapshot } from "@/hooks/use-dashboard-snapshot";

const latestHookValue: {
  current: ReturnType<typeof useDashboardSnapshot> | null;
} = { current: null };

function createCachedSnapshot() {
  return {
    balance: { available: 120 },
    subscription: null,
    usageStats: null,
    recentTransactions: [
      {
        _id: "tx_1",
        _creationTime: 1,
        type: "usage",
        status: "committed",
        amount: -12,
      },
    ],
    canvases: [],
    mediaPreview: [],
  };
}

function HookHarness({ userId }: { userId: string | null }) {
  const value = useDashboardSnapshot(userId);

  useEffect(() => {
    latestHookValue.current = value;
    return () => {
      latestHookValue.current = null;
    };
  }, [value]);

  return null;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useDashboardSnapshot", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
    latestHookValue.current = null;
    useAuthQueryMock.mockReset();
    readDashboardSnapshotCacheMock.mockReset();
    writeDashboardSnapshotCacheMock.mockReset();
    clearDashboardSnapshotCacheMock.mockReset();
    getDashboardSnapshotCacheInvalidationSignalKeyMock.mockReset();
  });

  it("keeps the cached snapshot reference stable across parent rerenders", async () => {
    useAuthQueryMock.mockReturnValue(undefined);
    getDashboardSnapshotCacheInvalidationSignalKeyMock.mockReturnValue("dashboard:invalidate");
    readDashboardSnapshotCacheMock.mockImplementation(() => ({
      snapshot: createCachedSnapshot(),
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(HookHarness, { userId: "user_1" }));
    });

    const firstSnapshot = latestHookValue.current?.snapshot;

    await act(async () => {
      root?.render(React.createElement(HookHarness, { userId: "user_1" }));
    });

    const secondSnapshot = latestHookValue.current?.snapshot;

    expect(latestHookValue.current?.source).toBe("cache");
    expect(firstSnapshot).toBe(secondSnapshot);
  });
});
