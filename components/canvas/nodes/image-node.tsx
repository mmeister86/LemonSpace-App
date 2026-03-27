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
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import { computeMediaNodeSize } from "@/lib/canvas-utils";

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
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasAutoSizedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const footerRef = useRef<HTMLParagraphElement>(null);
  const lastMetricsRef = useRef<string>("");

  useEffect(() => {
    if (typeof data.width !== "number" || typeof data.height !== "number") {
      return;
    }

    if (hasAutoSizedRef.current) return;
    hasAutoSizedRef.current = true;

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

  const showFilename = Boolean(data.filename && data.url);

  useEffect(() => {
    if (!selected) return;
    const rootEl = rootRef.current;
    const headerEl = headerRef.current;
    const previewEl = previewRef.current;
    if (!rootEl || !headerEl || !previewEl) return;

    const rootHeight = rootEl.getBoundingClientRect().height;
    const headerHeight = headerEl.getBoundingClientRect().height;
    const previewHeight = previewEl.getBoundingClientRect().height;
    const footerHeight = footerRef.current?.getBoundingClientRect().height ?? null;
    const imageEl = imageRef.current;
    const rootStyles = window.getComputedStyle(rootEl);
    const imageStyles = imageEl ? window.getComputedStyle(imageEl) : null;
    const rows = rootStyles.gridTemplateRows;
    const imageRect = imageEl?.getBoundingClientRect();
    const previewRect = previewEl.getBoundingClientRect();
    const naturalRatio =
      imageEl && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0
        ? imageEl.naturalWidth / imageEl.naturalHeight
        : null;
    const previewRatio =
      previewRect.width > 0 && previewRect.height > 0
        ? previewRect.width / previewRect.height
        : null;
    let expectedContainWidth: number | null = null;
    let expectedContainHeight: number | null = null;
    if (naturalRatio) {
      const fitByWidthHeight = previewRect.width / naturalRatio;
      if (fitByWidthHeight <= previewRect.height) {
        expectedContainWidth = previewRect.width;
        expectedContainHeight = fitByWidthHeight;
      } else {
        expectedContainHeight = previewRect.height;
        expectedContainWidth = previewRect.height * naturalRatio;
      }
    }
    const signature = `${width}|${height}|${Math.round(rootHeight)}|${Math.round(headerHeight)}|${Math.round(previewHeight)}|${Math.round(footerHeight ?? -1)}|${Math.round(imageRect?.height ?? -1)}|${rows}|${showFilename}`;

    if (lastMetricsRef.current === signature) {
      return;
    }
    lastMetricsRef.current = signature;

    // #region agent log
    fetch('http://127.0.0.1:7733/ingest/db1ec129-24cb-483b-98e2-3e7beef6d9cd',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d48a18'},body:JSON.stringify({sessionId:'d48a18',runId:'run4',hypothesisId:'H15-H16',location:'image-node.tsx:metricsEffect',message:'image contain-fit diagnostics',data:{nodeId:id,width,height,rootHeight,previewWidth:previewRect.width,previewHeight,previewRatio,naturalRatio,headerHeight,footerHeight,imageRenderWidth:imageRect?.width ?? null,imageRenderHeight:imageRect?.height ?? null,expectedContainWidth,expectedContainHeight,imageNaturalWidth:imageEl?.naturalWidth ?? null,imageNaturalHeight:imageEl?.naturalHeight ?? null,imageObjectFit:imageStyles?.objectFit ?? null,imageObjectPosition:imageStyles?.objectPosition ?? null,rows,showFilename},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [height, id, selected, showFilename, width]);

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
      />

      <div
        ref={rootRef}
        className={`grid h-full min-h-0 w-full grid-cols-1 gap-y-1 p-2 ${
          showFilename
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[auto_minmax(0,1fr)]"
        }`}
      >
        <div ref={headerRef} className="flex items-center justify-between">
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

        <div ref={previewRef} className="relative min-h-0 overflow-hidden rounded-lg bg-muted/30">
          {isUploading ? (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs text-muted-foreground">Wird hochgeladen...</span>
              </div>
            </div>
          ) : data.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL, volle Auflösung wie Asset-Node
            <img
              ref={imageRef}
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
          <p ref={footerRef} className="min-h-0 truncate text-xs text-muted-foreground">{data.filename}</p>
        ) : null}
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
      />
    </BaseNodeWrapper>
  );
}
