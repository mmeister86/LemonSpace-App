"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { DashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { collectMediaStorageIdsForResolution } from "@/components/media/media-preview-utils";

export type DashboardMediaPreviewUrls = {
  urlMap: Record<string, string | undefined>;
  isResolving: boolean;
  error: string | null;
};

export function useDashboardMediaPreviewUrls(
  snapshot: DashboardSnapshot | undefined,
  errorFallback: string,
): DashboardMediaPreviewUrls {
  const resolveMediaPreviewUrls = useMutation(api.storage.batchGetUrlsForUserMedia);
  const mediaPreview = snapshot?.mediaPreview;
  const mediaPreviewStorageIds = useMemo(() => {
    return collectMediaStorageIdsForResolution(mediaPreview ?? []);
  }, [mediaPreview]);
  const [urlMap, setUrlMap] = useState<Record<string, string | undefined>>({});
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function run() {
      if (snapshot === undefined) {
        setUrlMap({});
        setError(null);
        setIsResolving(false);
        return;
      }

      if (mediaPreviewStorageIds.length === 0) {
        setUrlMap({});
        setError(null);
        setIsResolving(false);
        return;
      }

      setIsResolving(true);
      setError(null);

      try {
        const resolved = await resolveMediaPreviewUrls({ storageIds: mediaPreviewStorageIds });
        if (isCancelled) {
          return;
        }
        setUrlMap(resolved);
      } catch (caughtError) {
        if (isCancelled) {
          return;
        }
        setUrlMap({});
        setError(caughtError instanceof Error ? caughtError.message : errorFallback);
      } finally {
        if (!isCancelled) {
          setIsResolving(false);
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [errorFallback, mediaPreviewStorageIds, resolveMediaPreviewUrls, snapshot]);

  return { urlMap, isResolving, error };
}
