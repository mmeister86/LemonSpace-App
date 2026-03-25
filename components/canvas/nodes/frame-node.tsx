"use client";

import { type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type FrameNodeData = {
  label?: string;
  exportWidth?: number;
  exportHeight?: number;
};

export type FrameNode = Node<FrameNodeData, "frame">;

export default function FrameNode({ data, selected }: NodeProps<FrameNode>) {
  const resolution =
    data.exportWidth && data.exportHeight
      ? `${data.exportWidth}x${data.exportHeight}`
      : undefined;

  return (
    <BaseNodeWrapper selected={selected} className="min-h-[200px] min-w-[300px] border-blue-500/30 p-3">
      <div className="text-xs font-medium text-blue-500">
        {data.label || "Frame"} {resolution ? `(${resolution})` : ""}
      </div>
    </BaseNodeWrapper>
  );
}
