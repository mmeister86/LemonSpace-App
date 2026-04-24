"use client";

import { useState, useCallback, useEffect } from "react";
import { Position, type NodeProps, type Node } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import CanvasHandle from "@/components/canvas/canvas-handle";

type GroupNodeData = {
  label?: string;
  _groupDropTarget?: boolean;
  _status?: string;
  _statusMessage?: string;
};

export type GroupNode = Node<GroupNodeData, "group">;

export default function GroupNode({ id, data, selected }: NodeProps<GroupNode>) {
  const { queueNodeDataUpdate } = useCanvasSync();
  const [label, setLabel] = useState(data.label ?? "Gruppe");
  const [isEditing, setIsEditing] = useState(false);
  const isDropTarget = data._groupDropTarget === true;

  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLabel(data.label ?? "Gruppe");
    }
  }, [data.label, isEditing]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (label !== data.label) {
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          label,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    }
  }, [label, data, id, queueNodeDataUpdate]);

  return (
    <BaseNodeWrapper
      nodeType="group"
      selected={selected}
      className={`min-w-[200px] min-h-[150px] p-3 border-dashed ${
        isDropTarget
          ? "border-primary bg-primary/8 shadow-primary/20 ring-2 ring-primary/35"
          : ""
      }`}
    >
      <CanvasHandle
        nodeId={id}
        nodeType="group"
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-background"
      />

      {isEditing ? (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleBlur()}
          autoFocus
          className="nodrag text-xs font-medium text-muted-foreground bg-transparent border-0 outline-none w-full"
        />
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="text-xs font-medium text-muted-foreground cursor-text"
        >
          📁 {label}
        </div>
      )}

      {isDropTarget && (
        <div className="mt-2 w-fit rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          Ablegen zum Gruppieren
        </div>
      )}

      <CanvasHandle
        nodeId={id}
        nodeType="group"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
