import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { canvasGraphQuery } from "./canvas-graph-query-cache";

type UseCanvasDataParams = {
  canvasId: Id<"canvases">;
  suppressQueries?: boolean;
};

export function useCanvasData({
  canvasId,
  suppressQueries = false,
}: UseCanvasDataParams) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const shouldSkipCanvasQueries =
    suppressQueries || isSessionPending || isAuthLoading || !isAuthenticated;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!isAuthLoading && !isAuthenticated) {
      console.warn("[Canvas debug] mounted without Convex auth", { canvasId });
    }
  }, [canvasId, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (isAuthLoading || isSessionPending) return;

    console.info("[Canvas auth state]", {
      canvasId,
      convex: {
        isAuthenticated,
        shouldSkipCanvasQueries,
      },
      session: {
        hasUser: Boolean(session?.user),
        email: session?.user?.email ?? null,
      },
    });
  }, [
    canvasId,
    isAuthLoading,
    isAuthenticated,
    isSessionPending,
    session?.user,
    shouldSkipCanvasQueries,
  ]);

  const graph = useQuery(
    canvasGraphQuery,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );
  const convexNodes = graph?.nodes;
  const convexEdges = graph?.edges;
  const canvas = useQuery(
    api.canvases.get,
    shouldSkipCanvasQueries ? "skip" : { canvasId },
  );

  const storageIdsForCanvas = useMemo(() => {
    if (!convexNodes) {
      return [] as Id<"_storage">[];
    }

    return [
      ...new Set(
        convexNodes.flatMap((node) => {
          const data = node.data as Record<string, unknown> | undefined;
          return typeof data?.storageId === "string" && data.storageId.length > 0
            ? [data.storageId as Id<"_storage">]
            : [];
        }),
      ),
    ].sort();
  }, [convexNodes]);

  const storageIdsForCanvasKey = storageIdsForCanvas.join(",");
  const requestedStorageIds = useMemo(
    () =>
      storageIdsForCanvasKey.length > 0
        ? (storageIdsForCanvasKey.split(",") as Id<"_storage">[])
        : [],
    [storageIdsForCanvasKey],
  );

  const resolveStorageUrlsForCanvas = useMutation(
    api.storage.batchGetUrlsForCanvas,
  );
  const [resolvedStorageUrlsById, setStorageUrlsById] = useState<
    Record<string, string | undefined> | undefined
  >();

  useEffect(() => {
    if (shouldSkipCanvasQueries || requestedStorageIds.length === 0) {
      return;
    }

    let cancelled = false;

    void resolveStorageUrlsForCanvas({
      canvasId,
      storageIds: requestedStorageIds,
    })
      .then((result) => {
        if (!cancelled) {
          setStorageUrlsById(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[Canvas] failed to resolve storage URLs", {
            canvasId,
            storageIdCount: requestedStorageIds.length,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    canvasId,
    resolveStorageUrlsForCanvas,
    requestedStorageIds,
    shouldSkipCanvasQueries,
  ]);

  const storageUrlsById =
    shouldSkipCanvasQueries || requestedStorageIds.length === 0
      ? undefined
      : resolvedStorageUrlsById;

  return {
    canvas,
    convexEdges,
    convexNodes,
    storageUrlsById,
  };
}
