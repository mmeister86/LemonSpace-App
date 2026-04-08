"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { AlertCircle, ImageIcon, Loader2 } from "lucide-react";

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

const DEFAULT_LIMIT = 200;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;

export type MediaLibraryMetadataItem = {
  storageId: Id<"_storage">;
  previewStorageId?: Id<"_storage">;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  sourceCanvasId: Id<"canvases">;
  sourceNodeId: Id<"nodes">;
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
  limit?: number;
  pickCtaLabel?: string;
};

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(limit)));
}

function formatDimensions(width: number | undefined, height: number | undefined): string | null {
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  return `${width} x ${height}px`;
}

export function MediaLibraryDialog({
  open,
  onOpenChange,
  onPick,
  title = "Mediathek",
  description = "Waehle ein Bild aus deiner LemonSpace-Mediathek.",
  limit,
  pickCtaLabel = "Auswaehlen",
}: MediaLibraryDialogProps) {
  const normalizedLimit = useMemo(() => normalizeLimit(limit), [limit]);
  const metadata = useAuthQuery(
    api.dashboard.listMediaLibrary,
    open ? { limit: normalizedLimit } : "skip",
  );
  const resolveUrls = useMutation(api.storage.batchGetUrlsForUserMedia);

  const [urlMap, setUrlMap] = useState<Record<string, string | undefined>>({});
  const [isResolvingUrls, setIsResolvingUrls] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingPickStorageId, setPendingPickStorageId] = useState<Id<"_storage"> | null>(null);

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

      const storageIds = collectMediaStorageIdsForResolution(metadata);
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
        setUrlError(error instanceof Error ? error.message : "URLs konnten nicht geladen werden.");
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
  }, [metadata, open, resolveUrls]);

  const items: MediaLibraryItem[] = useMemo(() => {
    if (!metadata) {
      return [];
    }

    return metadata.map((item) => ({
      ...item,
      url: resolveMediaPreviewUrl(item, urlMap),
    }));
  }, [metadata, urlMap]);

  const isMetadataLoading = open && metadata === undefined;
  const isInitialLoading = isMetadataLoading || (metadata !== undefined && isResolvingUrls);
  const isPreviewMode = typeof onPick !== "function";

  async function handlePick(item: MediaLibraryItem): Promise<void> {
    if (!onPick || pendingPickStorageId) {
      return;
    }

    setPendingPickStorageId(item.storageId);
    try {
      await onPick(item);
    } finally {
      setPendingPickStorageId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[320px] overflow-y-auto pr-1">
          {isInitialLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 12 }).map((_, index) => (
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
              <p className="text-sm font-medium">Mediathek konnte nicht geladen werden</p>
              <p className="max-w-md text-xs text-muted-foreground">{urlError}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Keine Medien vorhanden</p>
              <p className="text-xs text-muted-foreground">
                Sobald du Bilder hochlaedst oder generierst, erscheinen sie hier.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const dimensions = formatDimensions(item.width, item.height);
                const isPickingThis = pendingPickStorageId === item.storageId;

                return (
                  <div
                    key={item.storageId}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-card"
                  >
                    <div className="relative aspect-square bg-muted/50">
                      {item.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.filename ?? "Mediathek-Bild"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 p-2">
                      <p className="truncate text-xs font-medium" title={item.filename}>
                        {item.filename ?? "Unbenanntes Bild"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {dimensions ?? "Groesse unbekannt"}
                      </p>

                      {isPreviewMode ? (
                        <p className="mt-auto text-[11px] text-muted-foreground">Nur Vorschau</p>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2 h-7"
                          onClick={() => void handlePick(item)}
                          disabled={Boolean(pendingPickStorageId)}
                        >
                          {isPickingThis ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Wird uebernommen...
                            </>
                          ) : (
                            pickCtaLabel
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
      </DialogContent>
    </Dialog>
  );
}
