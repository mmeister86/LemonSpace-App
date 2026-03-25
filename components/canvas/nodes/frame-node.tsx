"use client";

import { useState, useCallback } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";

type FrameNodeData = {
  label?: string;
  resolution?: string;
  _status?: string;
  _statusMessage?: string;
};

export type FrameNode = Node<FrameNodeData, "frame">;

export default function FrameNode({ id, data, selected }: NodeProps<FrameNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

  const displayLabel = data.label ?? "Frame";
  const isEditing = editingLabel !== null;

  const handleDoubleClick = useCallback(() => {
    setEditingLabel(displayLabel);
  }, [displayLabel]);

  const handleBlur = useCallback(() => {
    if (editingLabel !== null && editingLabel !== data.label) {
      updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          label: editingLabel,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    }
    setEditingLabel(null);
  }, [editingLabel, data, id, updateData]);

  return (
    <BaseNodeWrapper
      selected={selected}
      className="min-w-[300px] min-h-[200px] p-3 border-blue-500/30"
    >
      {isEditing ? (
        <input
          value={editingLabel}
          onChange={(e) => setEditingLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleBlur()}
          autoFocus
          className="nodrag text-xs font-medium text-blue-500 bg-transparent border-0 outline-none w-full"
        />
      ) : (
        <div
          onDoubleClick={handleDoubleClick}
          className="text-xs font-medium text-blue-500 cursor-text"
        >
          🖥️ {displayLabel}{" "}
          {data.resolution && (
            <span className="text-muted-foreground">({data.resolution})</span>
          )}
        </div>
      )}
    </BaseNodeWrapper>
  );
}
