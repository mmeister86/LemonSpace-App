"use client";

import { useState, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";

type GroupNodeData = {
  label?: string;
  _status?: string;
  _statusMessage?: string;
};

export type GroupNode = Node<GroupNodeData, "group">;

export default function GroupNode({ id, data, selected }: NodeProps<GroupNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const [label, setLabel] = useState(data.label ?? "Gruppe");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLabel(data.label ?? "Gruppe");
    }
  }, [data.label, isEditing]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (label !== data.label) {
      updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          label,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    }
  }, [label, data, id, updateData]);

  return (
    <BaseNodeWrapper
      nodeType="group"
      selected={selected}
      className="min-w-[200px] min-h-[150px] p-3 border-dashed"
    >
      <Handle
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

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
