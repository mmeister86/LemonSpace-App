"use client";

/**
 * Onboarding note:
 * Dashboard data hook that combines the bundled Convex snapshot query with local cache fallback and logout invalidation.
 */

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

function isDashboardSnapshotShapeCompatible(snapshot: unknown): snapshot is DashboardSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const value = snapshot as { mediaPreview?: unknown };
  if (!Array.isArray(value.mediaPreview)) {
    return false;
  }

  return value.mediaPreview.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const kind = (item as { kind?: unknown }).kind;
    return kind === "image" || kind === "video" || kind === "asset";
  });
}

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

    const cached = readDashboardSnapshotCache<DashboardSnapshot>(userId)?.snapshot ?? null;
    if (!cached) {
      return null;
    }

    return isDashboardSnapshotShapeCompatible(cached) ? cached : null;
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
