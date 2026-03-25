"use client";

import { type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type GroupNode = Node<{ label?: string }, "group">;

export default function GroupNode({ data, selected }: NodeProps<GroupNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="min-h-[150px] min-w-[200px] border-dashed p-3">
      <div className="text-xs font-medium text-muted-foreground">{data.label || "Gruppe"}</div>
    </BaseNodeWrapper>
  );
}
