"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type ImageNodeData = {
  storageId?: string;
  url?: string;
  originalFilename?: string;
};

export type ImageNode = Node<ImageNodeData, "image">;

export default function ImageNode({ data, selected }: NodeProps<ImageNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="p-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Bild</div>
      {data.url ? (
        <img
          src={data.url}
          alt={data.originalFilename ?? "Bild"}
          className="max-w-[280px] rounded-lg object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          Bild hochladen oder URL einfuegen
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
