"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type CompareNodeData = {
  leftUrl?: string;
  rightUrl?: string;
};

export type CompareNode = Node<CompareNodeData, "compare">;

export default function CompareNode({ data, selected }: NodeProps<CompareNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-[500px] p-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Vergleich</div>
      <div className="flex h-40 gap-2">
        <div className="flex flex-1 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          {data.leftUrl ? (
            <img src={data.leftUrl} alt="Bild A" className="h-full w-full rounded object-cover" />
          ) : (
            "Bild A"
          )}
        </div>
        <div className="flex flex-1 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          {data.rightUrl ? (
            <img src={data.rightUrl} alt="Bild B" className="h-full w-full rounded object-cover" />
          ) : (
            "Bild B"
          )}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        style={{ top: "40%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="right"
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        style={{ top: "60%" }}
      />
    </BaseNodeWrapper>
  );
}
