"use client";

import { useState, useCallback, useRef } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
        // 1. Upload-URL generieren
        const uploadUrl = await generateUploadUrl();

        // 2. Datei hochladen
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();

        // 3. Node-Data mit storageId aktualisieren
        //    Die URL wird serverseitig in der nodes.list Query aufgelöst
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
    [id, generateUploadUrl, updateData],
  );

  // Click-to-Upload
  const handleClick = useCallback(() => {
    if (!data.url && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [data.url, isUploading]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  // Drag & Drop auf den Node
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadFile(file);
      }
    },
    [uploadFile],
  );

  // Bild ersetzen
  const handleReplace = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <BaseNodeWrapper selected={selected} status={data._status}>
      <div className="p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-muted-foreground">
            🖼️ Bild
          </div>
          {data.url && (
            <button
              onClick={handleReplace}
              className="nodrag text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ersetzen
            </button>
          )}
        </div>

        {isUploading ? (
          <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-muted">
            <div className="flex flex-col items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-xs text-muted-foreground">
                Wird hochgeladen…
              </span>
            </div>
          </div>
        ) : data.url ? (
          <img
            src={data.url}
            alt={data.filename ?? "Bild"}
            className="rounded-lg object-cover max-w-[260px]"
            draggable={false}
          />
        ) : (
          <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              nodrag flex h-36 w-56 cursor-pointer flex-col items-center justify-center
              rounded-lg border-2 border-dashed text-sm transition-colors
              ${isDragOver ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-primary/50 hover:text-foreground"}
            `}
          >
            <span className="text-lg mb-1">📁</span>
            <span>Klicken oder hierhin ziehen</span>
            <span className="text-xs mt-0.5">PNG, JPG, WebP</span>
          </div>
        )}

        {data.filename && data.url && (
          <p className="mt-1 text-xs text-muted-foreground truncate max-w-[260px]">
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
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
