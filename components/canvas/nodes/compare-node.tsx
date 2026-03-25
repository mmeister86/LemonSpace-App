"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import Image from "next/image";
import BaseNodeWrapper from "./base-node-wrapper";

type CompareNodeData = {
  leftUrl?: string;
  rightUrl?: string;
  _status?: string;
};

export type CompareNode = Node<CompareNodeData, "compare">;

export default function CompareNode({
  data,
  selected,
}: NodeProps<CompareNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-[500px] p-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        🔀 Vergleich
      </div>
      <div className="flex h-40 gap-2">
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded bg-muted">
          {data.leftUrl ? (
            <Image
              src={data.leftUrl}
              alt="Vergleich Bild A"
              fill
              className="object-cover"
              sizes="250px"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Bild A
            </div>
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded bg-muted">
          {data.rightUrl ? (
            <Image
              src={data.rightUrl}
              alt="Vergleich Bild B"
              fill
              className="object-cover"
              sizes="250px"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              Bild B
            </div>
          )}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="h-3! w-3! bg-primary! border-2! border-background!"
        style={{ top: "40%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="right"
        className="h-3! w-3! bg-primary! border-2! border-background!"
        style={{ top: "60%" }}
      />
    </BaseNodeWrapper>
  );
}
