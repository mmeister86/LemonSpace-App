"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import NextImage from "next/image";
import BaseNodeWrapper from "./base-node-wrapper";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import { computeMediaNodeSize, resolveMediaAspectRatio } from "@/lib/canvas-utils";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const updateData = useMutation(api.nodes.updateData);
  const resizeNode = useMutation(api.nodes.resize);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [handleTop, setHandleTop] = useState<number | undefined>(undefined);

  const aspectRatio = resolveMediaAspectRatio(data.width, data.height);

  useEffect(() => {
    if (typeof data.width !== "number" || typeof data.height !== "number") {
      return;
    }

    const targetSize = computeMediaNodeSize("image", {
      intrinsicWidth: data.width,
      intrinsicHeight: data.height,
    });

    if (width === targetSize.width && height === targetSize.height) {
      return;
    }

    void resizeNode({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [data.height, data.width, height, id, resizeNode, width]);

  useLayoutEffect(() => {
    if (!contentRef.current || !mediaRef.current) return;

    const contentEl = contentRef.current;
    const mediaEl = mediaRef.current;
    let frameId: number | undefined;

    const updateHandleTop = () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        const contentRect = contentEl.getBoundingClientRect();
        const mediaRect = mediaEl.getBoundingClientRect();
        const nextTop = mediaRect.top - contentRect.top + mediaRect.height / 2;
        setHandleTop(nextTop);
      });
    };

    updateHandleTop();

    const observer = new ResizeObserver(updateHandleTop);
    observer.observe(contentEl);
    observer.observe(mediaEl);

    return () => {
      observer.disconnect();
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [aspectRatio, data.filename, data.url, isDragOver, isUploading]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        const { title, desc } = msg.canvas.uploadFormatError(
          file.type || file.name.split(".").pop() || "—",
        );
        toast.error(title, desc);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        const { title, desc } = msg.canvas.uploadSizeError(
          Math.round(MAX_IMAGE_BYTES / (1024 * 1024)),
        );
        toast.error(title, desc);
        return;
      }

      setIsUploading(true);

      try {
        let dimensions: { width: number; height: number } | undefined;
        try {
          dimensions = await getImageDimensions(file);
        } catch {
          dimensions = undefined;
        }

        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = (await result.json()) as { storageId: string };

        await updateData({
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

          await resizeNode({
            nodeId: id as Id<"nodes">,
            width: targetSize.width,
            height: targetSize.height,
          });
        }

        toast.success(msg.canvas.imageUploaded.title);
      } catch (err) {
        console.error("Upload failed:", err);
        toast.error(
          msg.canvas.uploadFailed.title,
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setIsUploading(false);
      }
    },
    [id, generateUploadUrl, resizeNode, updateData]
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

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleReplace = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <BaseNodeWrapper
      nodeType="image"
      selected={selected}
      status={data._status}
      className="overflow-hidden"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-3! w-3! bg-primary! border-2! border-background!"
        style={{ top: handleTop ? `${handleTop}px` : "50%" }}
      />

      <div ref={contentRef} className="p-2">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">🖼️ Bild</div>
          {data.url && (
            <button
              onClick={handleReplace}
              className="nodrag text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ersetzen
            </button>
          )}
        </div>

        <div ref={mediaRef} className="relative w-full overflow-hidden rounded-lg" style={{ aspectRatio }}>
          {isUploading ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs text-muted-foreground">Wird hochgeladen...</span>
              </div>
            </div>
          ) : data.url ? (
            <NextImage
              src={data.url}
              alt={data.filename ?? "Bild"}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 260px"
              draggable={false}
            />
          ) : (
            <div
              onClick={handleClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
              nodrag flex w-full cursor-pointer flex-col items-center justify-center
              h-full border-2 border-dashed text-sm transition-colors
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

        {data.filename && data.url && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {data.filename}
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <Handle
        type="source"
        position={Position.Right}
        className="h-3! w-3! bg-primary! border-2! border-background!"
        style={{ top: handleTop ? `${handleTop}px` : "50%" }}
      />
    </BaseNodeWrapper>
  );
}
