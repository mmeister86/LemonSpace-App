"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { Film, Upload } from "lucide-react";

import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { getVideoMetadata } from "@/components/canvas/canvas-media-utils";
import {
  MediaLibraryDialog,
  type MediaLibraryItem,
} from "@/components/media/media-library-dialog";
import BaseNodeWrapper from "./base-node-wrapper";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { computeMediaNodeSize } from "@/lib/canvas-utils";
import { preserveNodeFavorite } from "@/lib/canvas-node-favorite";
import {
  emitDashboardSnapshotCacheInvalidationSignal,
  invalidateDashboardSnapshotForLastSignedInUser,
} from "@/lib/dashboard-snapshot-cache";
import { toast } from "@/lib/toast";

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const OPTIMISTIC_NODE_PREFIX = "optimistic_";

type VideoNodeData = {
  canvasId?: string;
  storageId?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  _uploadState?: "uploading" | "resolving-url";
  _status?: string;
};

export type UploadedVideoNode = Node<VideoNodeData, "video">;

function formatDuration(seconds: number | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const rounded = Math.round(seconds);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<UploadedVideoNode>) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const registerUploadedVideoMedia = useMutation(api.storage.registerUploadedVideoMedia);
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSizedRef = useRef(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "syncing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingUploadStorageId, setPendingUploadStorageId] = useState<string | null>(null);
  const [pendingMediaLibraryStorageId, setPendingMediaLibraryStorageId] = useState<string | null>(null);
  const [mediaLibraryPhase, setMediaLibraryPhase] = useState<"idle" | "applying" | "syncing">("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);

  const canvasId = data.canvasId as Id<"canvases"> | undefined;
  const isNodeStable = typeof id !== "string" || !id.startsWith(OPTIMISTIC_NODE_PREFIX);
  const hasResolvedVideoUrl = typeof data.url === "string" && data.url.length > 0;
  const isPendingUploadSynced =
    pendingUploadStorageId !== null &&
    data.storageId === pendingUploadStorageId &&
    hasResolvedVideoUrl;
  const isPendingMediaLibrarySynced =
    pendingMediaLibraryStorageId !== null &&
    data.storageId === pendingMediaLibraryStorageId &&
    hasResolvedVideoUrl;
  const isWaitingForCanvasSync = pendingUploadStorageId !== null && !isPendingUploadSynced;
  const isWaitingForMediaLibrarySync =
    pendingMediaLibraryStorageId !== null && !isPendingMediaLibrarySynced;
  const dropUploadState =
    data._uploadState === "uploading" || data._uploadState === "resolving-url"
      ? data._uploadState
      : undefined;
  const isDropUploadPending = dropUploadState !== undefined && !hasResolvedVideoUrl;
  const isUploading = uploadPhase !== "idle" || isWaitingForCanvasSync;
  const isApplyingMediaLibrary = mediaLibraryPhase !== "idle" || isWaitingForMediaLibrarySync;
  const isNodeLoading = isUploading || isApplyingMediaLibrary || isDropUploadPending;

  useEffect(() => {
    if (!isPendingUploadSynced) return;
    queueMicrotask(() => {
      setPendingUploadStorageId(null);
      setUploadPhase("idle");
    });
  }, [isPendingUploadSynced]);

  useEffect(() => {
    if (!isPendingMediaLibrarySynced) return;
    queueMicrotask(() => {
      setPendingMediaLibraryStorageId(null);
      setMediaLibraryPhase("idle");
    });
  }, [isPendingMediaLibrarySynced]);

  useEffect(() => {
    if (!isNodeStable || hasAutoSizedRef.current) return;
    if (typeof data.width !== "number" || typeof data.height !== "number") return;

    const currentWidth = typeof width === "number" ? width : 0;
    const currentHeight = typeof height === "number" ? height : 0;
    if (currentWidth <= 0 || currentHeight <= 0) return;

    const targetSize = computeMediaNodeSize("video", {
      intrinsicWidth: data.width,
      intrinsicHeight: data.height,
    });

    if (currentWidth !== 320 || currentHeight !== 180) {
      hasAutoSizedRef.current = true;
      return;
    }

    hasAutoSizedRef.current = true;
    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [data.height, data.width, height, id, isNodeStable, queueNodeResize, width]);

  const registerUploadInMediaLibrary = useCallback(
    (args: {
      storageId: string;
      filename?: string;
      mimeType?: string;
      width?: number;
      height?: number;
      durationSeconds?: number;
      nodeId?: Id<"nodes">;
    }) => {
      if (!canvasId) return;

      void registerUploadedVideoMedia({
        canvasId,
        storageId: args.storageId as Id<"_storage">,
        nodeId: args.nodeId,
        filename: args.filename,
        mimeType: args.mimeType,
        width: args.width,
        height: args.height,
        durationSeconds: args.durationSeconds,
      }).catch((error: unknown) => {
        console.warn("[VideoNode] registerUploadedVideoMedia failed", error);
      });
    },
    [canvasId, registerUploadedVideoMedia],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (isNodeLoading) return;

      if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
        toast.error("Upload fehlgeschlagen", `Videoformat nicht unterstützt: ${file.type || file.name}`);
        return;
      }

      if (file.size > MAX_VIDEO_BYTES) {
        toast.error("Upload fehlgeschlagen", "Videos dürfen maximal 100 MB groß sein.");
        return;
      }

      if (status.isOffline) {
        toast.warning(
          "Offline aktuell nicht unterstützt",
          "Video-Uploads benötigen eine aktive Verbindung.",
        );
        return;
      }

      setUploadPhase("uploading");
      setUploadProgress(0);
      setPendingUploadStorageId(null);

      try {
        let metadata: { width: number; height: number; durationSeconds: number } | undefined;
        try {
          metadata = await getVideoMetadata(file);
        } catch {
          metadata = undefined;
        }

        const uploadUrl = await generateUploadUrl();
        const { storageId } = await new Promise<{ storageId: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", uploadUrl, true);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(`Upload failed: ${xhr.status}`));
              return;
            }
            try {
              resolve(JSON.parse(xhr.responseText) as { storageId: string });
            } catch {
              reject(new Error("Upload fehlgeschlagen"));
            }
          };
          xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
          xhr.send(file);
        });

        setUploadProgress(100);
        setPendingUploadStorageId(storageId);
        setUploadPhase("syncing");

        await queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: preserveNodeFavorite(
            {
              storageId,
              filename: file.name,
              mimeType: file.type,
              ...(metadata
                ? {
                    width: metadata.width,
                    height: metadata.height,
                    durationSeconds: metadata.durationSeconds,
                  }
                : {}),
            },
            data,
          ),
        });

        if (metadata) {
          const targetSize = computeMediaNodeSize("video", {
            intrinsicWidth: metadata.width,
            intrinsicHeight: metadata.height,
          });
          await queueNodeResize({
            nodeId: id as Id<"nodes">,
            width: targetSize.width,
            height: targetSize.height,
          });
        }

        registerUploadInMediaLibrary({
          storageId,
          filename: file.name,
          mimeType: file.type,
          width: metadata?.width,
          height: metadata?.height,
          durationSeconds: metadata?.durationSeconds,
          nodeId: isNodeStable ? (id as Id<"nodes">) : undefined,
        });
        invalidateDashboardSnapshotForLastSignedInUser();
        emitDashboardSnapshotCacheInvalidationSignal();
        setUploadPhase("idle");
      } catch (error) {
        console.error("Video upload failed:", error);
        setPendingUploadStorageId(null);
        setUploadProgress(0);
        setUploadPhase("idle");
        toast.error(
          "Upload fehlgeschlagen",
          error instanceof Error ? error.message : undefined,
        );
      }
    },
    [
      data,
      generateUploadUrl,
      id,
      isNodeLoading,
      isNodeStable,
      queueNodeDataUpdate,
      queueNodeResize,
      registerUploadInMediaLibrary,
      status.isOffline,
    ],
  );

  const handlePickFromMediaLibrary = useCallback(
    async (item: MediaLibraryItem) => {
      if (isNodeLoading) return;

      if (item.kind !== "video" || !item.storageId) {
        toast.error("Video konnte nicht übernommen werden", "Bitte wähle ein gespeichertes Video aus.");
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
              filename: item.filename,
              mimeType: item.mimeType,
              width: item.width,
              height: item.height,
              durationSeconds: item.durationSeconds,
            },
            data,
          ),
        });
        setMediaLibraryPhase("syncing");

        if (typeof item.width === "number" && typeof item.height === "number") {
          const targetSize = computeMediaNodeSize("video", {
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
        console.error("Failed to apply media library video", error);
        setPendingMediaLibraryStorageId(null);
        setMediaLibraryPhase("idle");
        toast.error(
          "Video konnte nicht übernommen werden",
          error instanceof Error ? error.message : undefined,
        );
      }
    },
    [data, id, isNodeLoading, queueNodeDataUpdate, queueNodeResize],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void uploadFile(file);
      event.target.value = "";
    },
    [uploadFile],
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file && file.type.startsWith("video/")) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const durationLabel = formatDuration(data.durationSeconds);
  const uploadingLabel = isUploading
    ? isWaitingForCanvasSync
      ? "100% — wird synchronisiert..."
      : "Video wird hochgeladen..."
    : isApplyingMediaLibrary
      ? "Video wird übernommen..."
      : dropUploadState === "uploading"
        ? "Video wird hochgeladen..."
        : "Video wird geladen...";
  const effectiveUploadProgress = isWaitingForCanvasSync ? 100 : uploadProgress;
  const showFilename = Boolean(data.filename && (hasResolvedVideoUrl || isNodeLoading));

  return (
    <>
      <BaseNodeWrapper nodeType="video" selected={selected} status={data._status}>
        <CanvasHandle
          nodeId={id}
          nodeType="video"
          type="target"
          position={Position.Left}
          className="h-3! w-3! border-2! border-background! bg-primary!"
        />

        <div className="grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] p-2">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Film className="h-3.5 w-3.5" />
              Video
            </div>
            <div className="flex items-center gap-2">
              {!hasResolvedVideoUrl ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isNodeLoading && isNodeStable) setIsMediaLibraryOpen(true);
                  }}
                  disabled={isNodeLoading || !isNodeStable}
                  className="nodrag rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isNodeStable ? "Mediathek" : "Mediathek wird vorbereitet"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (!isNodeLoading) fileInputRef.current?.click();
                }}
                disabled={isNodeLoading}
                className="nodrag text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hasResolvedVideoUrl ? "Ersetzen" : "Upload"}
              </button>
            </div>
          </div>

          <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted/30">
            {isNodeLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-muted-foreground">{uploadingLabel}</span>
                  {isUploading || isApplyingMediaLibrary ? (
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
            ) : hasResolvedVideoUrl ? (
              <>
                <video
                  key={data.url}
                  src={data.url}
                  className="nodrag h-full w-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                />
                {durationLabel ? (
                  <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                    {durationLabel}
                  </div>
                ) : null}
              </>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`nodrag flex h-full w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed text-sm transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/5 text-primary"
                    : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Upload className="mb-2 h-5 w-5" />
                <span>Klicken oder hierhin ziehen</span>
                <span className="mt-0.5 text-xs">MP4, WebM, MOV bis 100 MB</span>
              </div>
            )}
          </div>

          <p className="min-h-5 truncate pt-1 text-xs text-muted-foreground">
            {showFilename ? data.filename : "\u00a0"}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={isNodeLoading}
          onChange={handleFileChange}
          className="hidden"
        />

        <CanvasHandle
          nodeId={id}
          nodeType="video"
          type="source"
          position={Position.Right}
          className="h-3! w-3! border-2! border-background! bg-primary!"
        />
      </BaseNodeWrapper>

      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        onOpenChange={setIsMediaLibraryOpen}
        onPick={handlePickFromMediaLibrary}
        kindFilter="video"
        pickCtaLabel="Video verwenden"
      />
    </>
  );
}
