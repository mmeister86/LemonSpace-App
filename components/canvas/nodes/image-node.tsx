"use client";

import {
  useState,
  useCallback,
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import BaseNodeWrapper from "./base-node-wrapper";

type ImageNodeData = {
  storageId?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  _status?: string;
  _statusMessage?: string;
};

export type ImageNode = Node<ImageNodeData, "image">;

export default function ImageNode({ id, data, selected }: NodeProps<ImageNode>) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const updateData = useMutation(api.nodes.updateData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setIsUploading(true);

      try {
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
          },
        });
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setIsUploading(false);
      }
    },
    [id, generateUploadUrl, updateData]
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
    <BaseNodeWrapper nodeType="image" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="h-3! w-3! bg-primary! border-2! border-background!"
      />

      <div className="p-2">
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

        {isUploading ? (
          <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-muted">
            <div className="flex flex-col items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-xs text-muted-foreground">Wird hochgeladen...</span>
            </div>
          </div>
        ) : data.url ? (
          <div className="relative h-36 w-56 overflow-hidden rounded-lg">
            <Image
              src={data.url}
              alt={data.filename ?? "Bild"}
              fill
              className="object-cover"
              sizes="224px"
              draggable={false}
            />
          </div>
        ) : (
          <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              nodrag flex h-36 w-56 cursor-pointer flex-col items-center justify-center
              rounded-lg border-2 border-dashed text-sm transition-colors
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

        {data.filename && data.url && (
          <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">
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
      />
    </BaseNodeWrapper>
  );
}
