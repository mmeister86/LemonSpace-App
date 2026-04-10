"use client";

import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/use-auth-query";
import {
  clearDashboardSnapshotCache,
  getDashboardSnapshotCacheInvalidationSignalKey,
  readDashboardSnapshotCache,
  writeDashboardSnapshotCache,
} from "@/lib/dashboard-snapshot-cache";

export type DashboardSnapshot = FunctionReturnType<typeof api.dashboard.getSnapshot>;

export function useDashboardSnapshot(userId?: string | null): {
  snapshot: DashboardSnapshot | undefined;
  source: "live" | "cache" | "none";
} {
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const liveSnapshot = useAuthQuery(api.dashboard.getSnapshot, userId ? {} : "skip");
  const cachedSnapshot = useMemo(() => {
    if (!userId || cacheEpoch < 0) {
      return null;
    }

    return readDashboardSnapshotCache<DashboardSnapshot>(userId)?.snapshot ?? null;
  }, [userId, cacheEpoch]);

  useEffect(() => {
    if (!userId || !liveSnapshot) return;
    writeDashboardSnapshotCache(userId, liveSnapshot);
  }, [userId, liveSnapshot]);

  useEffect(() => {
    if (userId) return;
    if (typeof window === "undefined") return;

    const previousUserId = window.sessionStorage.getItem("ls-last-dashboard-user");
    if (previousUserId) {
      clearDashboardSnapshotCache(previousUserId);
      window.sessionStorage.removeItem("ls-last-dashboard-user");
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("ls-last-dashboard-user", userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;

    const signalKey = getDashboardSnapshotCacheInvalidationSignalKey();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== signalKey) {
        return;
      }
      clearDashboardSnapshotCache(userId);
      setCacheEpoch((value) => value + 1);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  return useMemo(() => {
    if (liveSnapshot) {
      return { snapshot: liveSnapshot, source: "live" as const };
    }

    if (cachedSnapshot) {
      return { snapshot: cachedSnapshot, source: "cache" as const };
    }

    return { snapshot: undefined, source: "none" as const };
  }, [cachedSnapshot, liveSnapshot]);
}
