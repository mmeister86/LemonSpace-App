"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { computeMediaNodeSize } from "@/lib/canvas-utils";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useMutation } from "convex/react";
import { Progress } from "@/components/ui/progress";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OPTIMISTIC_NODE_PREFIX = "optimistic_";

type ImageNodeData = {
  storageId?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  _status?: string;
  _statusMessage?: string;
};

export type ImageNode = Node<ImageNodeData, "image">;

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(objectUrl);

      if (!width || !height) {
        reject(new Error("Could not read image dimensions"));
        return;
      }

      resolve({ width, height });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image"));
    };

    image.src = objectUrl;
  });
}

export default function ImageNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ImageNode>) {
  const t = useTranslations('toasts');
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "syncing">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingUploadStorageId, setPendingUploadStorageId] = useState<string | null>(
    null,
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const hasAutoSizedRef = useRef(false);

  const isPendingUploadSynced =
    pendingUploadStorageId !== null &&
    data.storageId === pendingUploadStorageId &&
    typeof data.url === "string" &&
    data.url.length > 0;
  const isWaitingForCanvasSync = pendingUploadStorageId !== null && !isPendingUploadSynced;
  const isUploading = uploadPhase !== "idle" || isWaitingForCanvasSync;

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

        setUploadProgress(100);
        setPendingUploadStorageId(storageId);
        setUploadPhase("syncing");

        await queueNodeDataUpdate({
          nodeId: id as Id<"nodes">,
          data: {
            storageId,
            filename: file.name,
            mimeType: file.type,
            ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
          },
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
      generateUploadUrl,
      id,
      isUploading,
      queueNodeDataUpdate,
      queueNodeResize,
      status.isOffline,
      t,
    ],
  );

  const handleClick = useCallback(() => {
    if (!data.url && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [data.url, isUploading]);

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

      if (isUploading) return;
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadFile(file);
      }
    },
    [isUploading, uploadFile]
  );

  const handleReplace = useCallback(() => {
    if (isUploading) return;
    fileInputRef.current?.click();
  }, [isUploading]);

  const showFilename = Boolean(data.filename && data.url);
  const effectiveUploadProgress = isWaitingForCanvasSync ? 100 : uploadProgress;
  const uploadingLabel =
    isWaitingForCanvasSync
      ? "100% — wird synchronisiert…"
      : "Wird hochgeladen…";

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
      <Handle
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
              disabled={isUploading}
              className="nodrag text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ersetzen
            </button>
          )}
        </div>

        <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted/30">
          {isUploading ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">{uploadingLabel}</span>
                <div className="w-40">
                  <Progress value={effectiveUploadProgress} className="h-1.5" />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {effectiveUploadProgress}%
                </span>
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
        disabled={isUploading}
        onChange={handleFileChange}
        className="hidden"
      />

        <Handle
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
    </>
  );
}
