"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { AlertCircle, Box, ImageIcon, Loader2, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  collectMediaStorageIdsForResolution,
  resolveMediaPreviewUrl,
} from "@/components/media/media-preview-utils";

const DEFAULT_PAGE_SIZE = 8;

export type MediaLibraryMetadataItem = {
  kind: "image" | "video" | "asset";
  source: "upload" | "ai-image" | "ai-video" | "freepik-asset" | "pexels-video";
  storageId?: Id<"_storage">;
  previewStorageId?: Id<"_storage">;
  previewUrl?: string;
  originalUrl?: string;
  sourceUrl?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  durationSeconds?: number;
  sourceCanvasId?: Id<"canvases">;
  sourceNodeId?: Id<"nodes">;
  createdAt: number;
};

export type MediaLibraryItem = MediaLibraryMetadataItem & {
  url?: string;
};

export type MediaLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick?: (item: MediaLibraryItem) => void | Promise<void>;
  title?: string;
  description?: string;
  pageSize?: number;
  kindFilter?: "image" | "video" | "asset";
  pickCtaLabel?: string;
};

type MediaLibraryResponse = {
  items: MediaLibraryMetadataItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
};

function formatDimensions(width: number | undefined, height: number | undefined): string | null {
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  return `${width} x ${height}px`;
}

function formatMediaMeta(
  item: MediaLibraryItem,
  tCommon: ReturnType<typeof useTranslations>,
): string {
  if (item.kind === "video") {
    if (typeof item.durationSeconds === "number" && Number.isFinite(item.durationSeconds)) {
      return `${Math.max(1, Math.round(item.durationSeconds))}s`;
    }
    return tCommon("videoFile");
  }

  return formatDimensions(item.width, item.height) ?? tCommon("unknownSize");
}

function getItemKey(item: MediaLibraryItem): string {
  if (item.storageId) {
    return item.storageId;
  }

  if (item.originalUrl) {
    return `url:${item.originalUrl}`;
  }

  if (item.previewUrl) {
    return `preview:${item.previewUrl}`;
  }

  if (item.sourceUrl) {
    return `source:${item.sourceUrl}`;
  }

  return `${item.kind}:${item.createdAt}:${item.filename ?? "unnamed"}`;
}

function getItemLabel(
  item: MediaLibraryItem,
  tCommon: ReturnType<typeof useTranslations>,
): string {
  if (item.filename) {
    return item.filename;
  }

  if (item.kind === "video") {
    return tCommon("untitledVideo");
  }

  if (item.kind === "asset") {
    return tCommon("untitledAsset");
  }

  return tCommon("untitledImage");
}

export function MediaLibraryDialog({
  open,
  onOpenChange,
  onPick,
  title,
  description,
  pageSize = DEFAULT_PAGE_SIZE,
  kindFilter,
  pickCtaLabel,
}: MediaLibraryDialogProps) {
  const tDialog = useTranslations("mediaLibrary.dialog");
  const tCommon = useTranslations("mediaLibrary.common");
  const [page, setPage] = useState(1);
  const normalizedPageSize = useMemo(() => {
    if (typeof pageSize !== "number" || !Number.isFinite(pageSize)) {
      return DEFAULT_PAGE_SIZE;
    }

    return Math.max(1, Math.floor(pageSize));
  }, [pageSize]);

  useEffect(() => {
    if (!open) {
      setPage(1);
    }
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [kindFilter]);

  const metadata = useAuthQuery(
    api.dashboard.listMediaLibrary,
    open
      ? {
          page,
          pageSize: normalizedPageSize,
          ...(kindFilter ? { kindFilter } : {}),
        }
      : "skip",
  ) as MediaLibraryResponse | undefined;
  const resolveUrls = useMutation(api.storage.batchGetUrlsForUserMedia);

  const [urlMap, setUrlMap] = useState<Record<string, string | undefined>>({});
  const [isResolvingUrls, setIsResolvingUrls] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingPickItemKey, setPendingPickItemKey] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function run() {
      if (!open) {
        setUrlMap({});
        setUrlError(null);
        setIsResolvingUrls(false);
        return;
      }

      if (!metadata) {
        return;
      }

      const storageIds = collectMediaStorageIdsForResolution(metadata.items);
      if (storageIds.length === 0) {
        setUrlMap({});
        setUrlError(null);
        setIsResolvingUrls(false);
        return;
      }

      setIsResolvingUrls(true);
      setUrlError(null);

      try {
        const resolved = await resolveUrls({ storageIds });
        if (isCancelled) {
          return;
        }
        setUrlMap(resolved);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        setUrlMap({});
        setUrlError(error instanceof Error ? error.message : tDialog("urlResolveError"));
      } finally {
        if (!isCancelled) {
          setIsResolvingUrls(false);
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [metadata, open, resolveUrls, tDialog]);

  const items: MediaLibraryItem[] = useMemo(() => {
    if (!metadata) {
      return [];
    }

    return metadata.items.map((item) => ({
      ...item,
      url: resolveMediaPreviewUrl(item, urlMap),
    }));
  }, [metadata, urlMap]);

  const visibleItems = useMemo(
    () => items.slice(0, normalizedPageSize),
    [items, normalizedPageSize],
  );

  const isMetadataLoading = open && metadata === undefined;
  const isInitialLoading = isMetadataLoading || (metadata !== undefined && isResolvingUrls);
  const isPreviewMode = typeof onPick !== "function";
  const effectiveTitle = title ?? tDialog("title");
  const effectivePickCtaLabel = pickCtaLabel ?? tDialog("pick");
  const effectiveDescription =
    description ??
    (kindFilter === "image"
      ? tDialog("descriptionImage")
      : kindFilter === "video"
        ? tDialog("descriptionVideo")
        : kindFilter === "asset"
          ? tDialog("descriptionAsset")
          : tDialog("descriptionDefault"));

  async function handlePick(item: MediaLibraryItem): Promise<void> {
    if (!onPick || pendingPickItemKey) {
      return;
    }

    setPendingPickItemKey(getItemKey(item));
    try {
      await onPick(item);
    } finally {
      setPendingPickItemKey(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{effectiveTitle}</DialogTitle>
          <DialogDescription>{effectiveDescription}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[320px] overflow-y-auto pr-1">
          {isInitialLoading ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
               {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, index) => (
                 <div key={index} className="overflow-hidden rounded-lg border">
                  <div className="aspect-square animate-pulse bg-muted" />
                  <div className="space-y-1 p-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : urlError ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-medium">{tDialog("errorTitle")}</p>
              <p className="max-w-md text-xs text-muted-foreground">{urlError}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">{tDialog("emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {tDialog("emptyDescription")}
              </p>
            </div>
          ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
               {visibleItems.map((item) => {
                const itemKey = getItemKey(item);
                const isPickingThis = pendingPickItemKey === itemKey;
                const itemLabel = getItemLabel(item, tCommon);
                const metaLabel = formatMediaMeta(item, tCommon);

                return (
                  <div
                    key={itemKey}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-card"
                  >
                    <div className="relative aspect-square bg-muted/50">
                      {item.url && item.kind === "video" ? (
                        <video
                          src={item.url}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : item.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={itemLabel}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          {item.kind === "video" ? (
                            <Video className="h-6 w-6" />
                          ) : item.kind === "asset" ? (
                            <Box className="h-6 w-6" />
                          ) : (
                            <ImageIcon className="h-6 w-6" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-2">
                      <p className="truncate text-xs font-medium" title={itemLabel}>
                        {itemLabel}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {metaLabel}
                      </p>

                      {isPreviewMode ? (
                        <p className="mt-auto text-[11px] text-muted-foreground">{tDialog("previewOnly")}</p>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2 h-7"
                          onClick={() => void handlePick(item)}
                          disabled={Boolean(pendingPickItemKey)}
                        >
                          {isPickingThis ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              {tDialog("pickLoading")}
                            </>
                          ) : (
                            effectivePickCtaLabel
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {metadata && !isInitialLoading && !urlError && items.length > 0 ? (
          <div className="flex shrink-0 items-center justify-center gap-2 border-t px-5 py-3" aria-live="polite">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              {tDialog("previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {tDialog("pageOf", { page: metadata.page, totalPages: metadata.totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(metadata.totalPages, current + 1))}
              disabled={page >= metadata.totalPages}
            >
              {tDialog("next")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
