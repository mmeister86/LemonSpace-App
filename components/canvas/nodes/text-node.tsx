"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type TextNodeData = {
  content?: string;
};

export type TextNode = Node<TextNodeData, "text">;

export default function TextNode({ data, selected }: NodeProps<TextNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-64 p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Text</div>
      <p className="min-h-[2rem] whitespace-pre-wrap text-sm">{data.content || "Text eingeben..."}</p>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
