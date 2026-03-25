"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type PromptNodeData = {
  content?: string;
  model?: string;
};

export type PromptNode = Node<PromptNodeData, "prompt">;

export default function PromptNode({ data, selected }: NodeProps<PromptNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-72 border-purple-500/30 p-3">
      <div className="mb-1 text-xs font-medium text-purple-500">Prompt</div>
      <p className="min-h-[2rem] whitespace-pre-wrap text-sm">{data.content || "Prompt eingeben..."}</p>
      {data.model ? (
        <div className="mt-2 text-xs text-muted-foreground">Modell: {data.model}</div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-purple-500"
      />
    </BaseNodeWrapper>
  );
}
