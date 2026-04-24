"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Position, type NodeProps, type Node } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  MediaLibraryDialog,
  type MediaLibraryItem,
} from "@/components/media/media-library-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { computeMediaNodeSize } from "@/lib/canvas-utils";
import {
  emitDashboardSnapshotCacheInvalidationSignal,
  invalidateDashboardSnapshotForLastSignedInUser,
} from "@/lib/dashboard-snapshot-cache";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useMutation } from "convex/react";
import { Progress } from "@/components/ui/progress";
import {
  createCompressedImagePreview,
  getImageDimensions,
} from "@/components/canvas/canvas-media-utils";
import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";
import CanvasHandle from "@/components/canvas/canvas-handle";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OPTIMISTIC_NODE_PREFIX = "optimistic_";

type ImageNodeData = {
  canvasId?: string;
  storageId?: string;
  previewStorageId?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  _uploadState?: "uploading" | "resolving-url";
  _status?: string;
  _statusMessage?: string;
};

export type ImageNode = Node<ImageNodeData, "image">;

export default function ImageNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ImageNode>) {
  const t = useTranslations('toasts');
  const tMedia = useTranslations("mediaLibrary.imageNode");
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerUploadedImageMedia = useMutation(api.storage.registerUploadedImageMedia);
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "syncing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingUploadStorageId, setPendingUploadStorageId] = useState<string | null>(
    null,
  );
  const [mediaLibraryPhase, setMediaLibraryPhase] = useState<
    "idle" | "applying" | "syncing"
  >("idle");
  const [pendingMediaLibraryStorageId, setPendingMediaLibraryStorageId] = useState<
    string | null
  >(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const hasAutoSizedRef = useRef(false);
  const canvasId = data.canvasId as Id<"canvases"> | undefined;
  const isOptimisticNodeId =
    typeof id === "string" && id.startsWith(OPTIMISTIC_NODE_PREFIX);
  const isNodeStable = !isOptimisticNodeId;

  const registerUploadInMediaLibrary = useCallback(
    (args: {
      storageId: string;
      filename?: string;
      mimeType?: string;
      width?: number;
      height?: number;
      nodeId?: Id<"nodes">;
    }) => {
      if (!canvasId) {
        return;
      }

      void registerUploadedImageMedia({
        canvasId,
        storageId: args.storageId as Id<"_storage">,
        nodeId: args.nodeId,
        filename: args.filename,
        mimeType: args.mimeType,
        width: args.width,
        height: args.height,
      }).catch((error: unknown) => {
        console.warn("[ImageNode] registerUploadedImageMedia failed", error);
      });
    },
    [canvasId, registerUploadedImageMedia],
  );

  const isPendingUploadSynced =
    pendingUploadStorageId !== null &&
    data.storageId === pendingUploadStorageId &&
    typeof data.url === "string" &&
    data.url.length > 0;
  const isWaitingForCanvasSync = pendingUploadStorageId !== null && !isPendingUploadSynced;
  const isPendingMediaLibrarySynced =
    pendingMediaLibraryStorageId !== null &&
    data.storageId === pendingMediaLibraryStorageId &&
    typeof data.url === "string" &&
    data.url.length > 0;
  const isWaitingForMediaLibrarySync =
    pendingMediaLibraryStorageId !== null && !isPendingMediaLibrarySynced;
  const dropUploadState =
    data._uploadState === "uploading" || data._uploadState === "resolving-url"
      ? data._uploadState
      : undefined;
  const hasResolvedImageUrl = typeof data.url === "string" && data.url.length > 0;
  const isDropUploadPending = dropUploadState !== undefined && !hasResolvedImageUrl;
  const isUploading = uploadPhase !== "idle" || isWaitingForCanvasSync;
  const isApplyingMediaLibrary =
    mediaLibraryPhase !== "idle" || isWaitingForMediaLibrarySync;
  const isNodeLoading = isUploading || isApplyingMediaLibrary || isDropUploadPending;

  useEffect(() => {
    if (!isPendingUploadSynced) {
      return;
    }

    setPendingUploadStorageId(null);
    setUploadPhase("idle");
  }, [isPendingUploadSynced]);

  useEffect(() => {
    if (!isPendingMediaLibrarySynced) {
      return;
    }

    setPendingMediaLibraryStorageId(null);
    setMediaLibraryPhase("idle");
  }, [isPendingMediaLibrarySynced]);

  useEffect(() => {
    if (typeof id === "string" && id.startsWith(OPTIMISTIC_NODE_PREFIX)) {
      return;
    }

    if (typeof data.width !== "number" || typeof data.height !== "number") {
      return;
    }

    if (hasAutoSizedRef.current) return;
    const targetSize = computeMediaNodeSize("image", {
      intrinsicWidth: data.width,
      intrinsicHeight: data.height,
    });
    const currentWidth = typeof width === "number" ? width : 0;
    const currentHeight = typeof height === "number" ? height : 0;
    const hasMeasuredSize = currentWidth > 0 && currentHeight > 0;
    if (!hasMeasuredSize) {
      return;
    }

    const isAtTargetSize = currentWidth === targetSize.width && currentHeight === targetSize.height;
    const isAtDefaultSeedSize = currentWidth === 280 && currentHeight === 200;
    const shouldRunInitialAutoSize = isAtDefaultSeedSize && !isAtTargetSize;

    if (!shouldRunInitialAutoSize) {
      hasAutoSizedRef.current = true;
      return;
    }

    hasAutoSizedRef.current = true;
    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [data.height, data.width, height, id, queueNodeResize, width]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (isUploading) return;
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        toast.error(
          t('canvas.uploadFailed'),
          t('canvas.uploadFormatError', { format: file.type || file.name.split(".").pop() || "—" }),
        );
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(
          t('canvas.uploadFailed'),
          t('canvas.uploadSizeError', { maxMb: Math.round(MAX_IMAGE_BYTES / (1024 * 1024)) }),
        );
        return;
      }
      if (status.isOffline) {
        toast.warning(
          "Offline aktuell nicht unterstützt",
          "Bild-Uploads benötigen eine aktive Verbindung.",
        );
        return;
      }

      setUploadPhase("uploading");
      setUploadProgress(0);
      setPendingUploadStorageId(null);

      try {
        let dimensions: { width: number; height: number } | undefined;
        let previewUpload:
          | {
              previewStorageId: string;
              previewWidth: number;
              previewHeight: number;
            }
          | undefined;
        try {
          dimensions = await getImageDimensions(file);
        } catch {
          dimensions = undefined;
        }

        const uploadUrl = await generateUploadUrl();
        const { storageId } = await new Promise<{ storageId: string }>(
          (resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", uploadUrl, true);
            xhr.setRequestHeader("Content-Type", file.type);

            xhr.upload.onprogress = (event) => {
              if (!event.lengthComputable) return;
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percent);
            };

            xhr.onload = async () => {
              if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Upload failed: ${xhr.status}`));
                return;
              }

              try {
                const parsed = JSON.parse(xhr.responseText) as { storageId: string };
                resolve(parsed);
              } catch {
                reject(new Error("Upload fehlgeschlagen"));
              }
            };

            xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
            xhr.send(file);
          },
        );

        try {
          const preview = await createCompressedImagePreview(file);
          const previewUploadUrl = await generateUploadUrl();
          const previewUploadResult = await fetch(previewUploadUrl, {
            method: "POST",
            headers: { "Content-Type": preview.blob.type || "image/webp" },
            body: preview.blob,
          });

          if (!previewUploadResult.ok) {
            throw new Error(`Preview upload failed: ${previewUploadResult.status}`);
          }

          const { storageId: previewStorageId } =
            (await previewUploadResult.json()) as { storageId: string };
          previewUpload = {
            previewStorageId,
            previewWidth: preview.width,
            previewHeight: preview.height,
          };
        } catch (previewError) {
          console.warn("[ImageNode] preview generation/upload failed", previewError);
        }

        setUploadProgress(100);
        setPendingUploadStorageId(storageId);
        setUploadPhase("syncing");

        await queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: preserveNodeFavorite(
            {
              storageId,
              ...(previewUpload ?? {}),
              filename: file.name,
              mimeType: file.type,
              ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
            },
            data,
          ),
        });

        if (dimensions) {
          const targetSize = computeMediaNodeSize("image", {
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          });

          await queueNodeResize({
            nodeId: id as Id<"nodes">,
            width: targetSize.width,
            height: targetSize.height,
          });
        }

        const nodeIdForRegistration =
          typeof id === "string" && !id.startsWith(OPTIMISTIC_NODE_PREFIX)
            ? (id as Id<"nodes">)
            : undefined;

        registerUploadInMediaLibrary({
          storageId,
          filename: file.name,
          mimeType: file.type,
          width: dimensions?.width,
          height: dimensions?.height,
          nodeId: nodeIdForRegistration,
        });
        invalidateDashboardSnapshotForLastSignedInUser();
        emitDashboardSnapshotCacheInvalidationSignal();

        toast.success(t('canvas.imageUploaded'));
        setUploadPhase("idle");
      } catch (err) {
        console.error("Upload failed:", err);
        setPendingUploadStorageId(null);
        toast.error(
          t('canvas.uploadFailed'),
          err instanceof Error ? err.message : undefined,
        );
        setUploadProgress(0);
        setUploadPhase("idle");
      }
    },
    [
      data,
      generateUploadUrl,
      id,
      isUploading,
      queueNodeDataUpdate,
      queueNodeResize,
      registerUploadInMediaLibrary,
      status.isOffline,
      t,
    ],
  );

  const handlePickFromMediaLibrary = useCallback(
    async (item: MediaLibraryItem) => {
      if (isNodeLoading) {
        return;
      }

      if (item.kind !== "image" || !item.storageId) {
        toast.error(t('canvas.uploadFailed'), tMedia("invalidSelection"));
        return;
      }

      setMediaLibraryPhase("applying");
      setPendingMediaLibraryStorageId(item.storageId);

      try {
        await queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: preserveNodeFavorite(
            {
              storageId: item.storageId,
              previewStorageId: item.previewStorageId,
              filename: item.filename,
              mimeType: item.mimeType,
              width: item.width,
              height: item.height,
              previewWidth: item.previewWidth,
              previewHeight: item.previewHeight,
            },
            data,
          ),
        });
        setMediaLibraryPhase("syncing");

        if (typeof item.width === "number" && typeof item.height === "number") {
          const targetSize = computeMediaNodeSize("image", {
            intrinsicWidth: item.width,
            intrinsicHeight: item.height,
          });

          await queueNodeResize({
            nodeId: id as Id<"nodes">,
            width: targetSize.width,
            height: targetSize.height,
          });
        }

        setIsMediaLibraryOpen(false);
      } catch (error) {
        console.error("Failed to apply media library image", error);
        setPendingMediaLibraryStorageId(null);
        setMediaLibraryPhase("idle");
        toast.error(
          t('canvas.uploadFailed'),
          error instanceof Error ? error.message : undefined,
        );
      }
    },
    [data, id, isNodeLoading, queueNodeDataUpdate, queueNodeResize, t, tMedia],
  );

  const handleClick = useCallback(() => {
    if (!data.url && !isNodeLoading) {
      fileInputRef.current?.click();
    }
  }, [data.url, isNodeLoading]);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isNodeLoading) return;
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadFile(file);
      }
    },
    [isNodeLoading, uploadFile]
  );

  const handleReplace = useCallback(() => {
    if (isNodeLoading) return;
    fileInputRef.current?.click();
  }, [isNodeLoading]);

  const showFilename = Boolean(data.filename && (hasResolvedImageUrl || isNodeLoading));
  const showsDeterminateProgress = isUploading || isApplyingMediaLibrary;
  const effectiveUploadProgress = isUploading
    ? isWaitingForCanvasSync
      ? 100
      : uploadProgress
    : 100;
  const uploadingLabel = isUploading
    ? isWaitingForCanvasSync
      ? "100% — wird synchronisiert…"
      : "Wird hochgeladen…"
    : isApplyingMediaLibrary
      ? "Bild wird uebernommen…"
      : dropUploadState === "uploading"
        ? "Bild wird hochgeladen…"
        : "Bild wird geladen…";

  return (
    <>
      <BaseNodeWrapper
        nodeType="image"
        selected={selected}
        status={data._status}
        toolbarActions={[
          {
            id: "fullscreen",
            label: "Fullscreen",
            icon: <Maximize2 size={14} />,
            onClick: () => setIsFullscreenOpen(true),
            disabled: !data.url,
          },
        ]}
      >
      <CanvasHandle
        nodeId={id}
        nodeType="image"
        type="target"
        position={Position.Left}
        className="h-3! w-3! bg-primary! border-2! border-background!"
      />

      <div
        className={`grid h-full min-h-0 w-full grid-cols-1 gap-y-1 p-2 ${
          showFilename
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[auto_minmax(0,1fr)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">🖼️ Bild</div>
          {data.url && (
              <button
                onClick={handleReplace}
                disabled={isNodeLoading}
                className="nodrag text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ersetzen
            </button>
          )}
          {!data.url && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isNodeLoading || !isNodeStable) {
                  return;
                }
                setIsMediaLibraryOpen(true);
              }}
              disabled={isNodeLoading || !isNodeStable}
              className="nodrag inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isNodeStable
                ? tMedia("openButton")
                : tMedia("preparingButton")}
            </button>
          )}
        </div>

        <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted/30">
          {isNodeLoading ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">{uploadingLabel}</span>
                {showsDeterminateProgress ? (
                  <>
                    <div className="w-40">
                      <Progress value={effectiveUploadProgress} className="h-1.5" />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {effectiveUploadProgress}%
                    </span>
                  </>
                ) : (
                  <div className="w-40 overflow-hidden rounded-full bg-muted-foreground/20">
                    <div className="h-1.5 w-2/3 animate-pulse rounded-full bg-primary" />
                  </div>
                )}
              </div>
            </div>
          ) : data.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL, volle Auflösung wie Asset-Node
            <img
              src={data.url}
              alt={data.filename ?? "Bild"}
              className="h-full w-full object-cover object-center"
              draggable={false}
            />
          ) : (
            <div
              onClick={handleClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
              nodrag flex h-full w-full cursor-pointer flex-col items-center justify-center
              border-2 border-dashed text-sm transition-colors
              ${
                isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }
            `}
            >
              <span className="mb-1 text-lg">📁</span>
              <span>Klicken oder hierhin ziehen</span>
              <span className="mt-0.5 text-xs">PNG, JPG, WebP</span>
            </div>
          )}
        </div>

        {showFilename ? (
          <p className="min-h-0 truncate text-xs text-muted-foreground">{data.filename}</p>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={isNodeLoading}
        onChange={handleFileChange}
        className="hidden"
      />

        <CanvasHandle
          nodeId={id}
          nodeType="image"
          type="source"
          position={Position.Right}
          className="h-3! w-3! bg-primary! border-2! border-background!"
        />
      </BaseNodeWrapper>

      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent
          className="inset-0 left-0 top-0 h-screen w-screen max-w-none -translate-x-0 -translate-y-0 place-items-center gap-0 rounded-none border-none bg-transparent p-0 ring-0 shadow-none sm:max-w-none"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{data.filename ?? "Bild"}</DialogTitle>
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(false)}
            aria-label="Close image preview"
            className="absolute right-6 top-6 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/30"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full w-full items-center justify-center">
            {data.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL, volle Auflösung wie Asset-Node
              <img
                src={data.url}
                alt={data.filename ?? "Bild"}
                className="h-auto max-h-[80vh] w-auto max-w-[80vw] rounded-xl object-contain shadow-2xl"
                draggable={false}
              />
            ) : (
              <div className="rounded-lg bg-popover/95 px-4 py-3 text-sm text-muted-foreground shadow-lg">
                Kein Bild verfügbar
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        onOpenChange={setIsMediaLibraryOpen}
        onPick={handlePickFromMediaLibrary}
        kindFilter="image"
        pickCtaLabel={tMedia("pickCta")}
      />
    </>
  );
}
