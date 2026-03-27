"use client";

import { useState, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";

type NoteNodeData = {
  content?: string;
  _status?: string;
  _statusMessage?: string;
};

export type NoteNode = Node<NoteNodeData, "note">;

export default function NoteNode({ id, data, selected }: NodeProps<NoteNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const [content, setContent] = useState(data.content ?? "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent(data.content ?? "");
    }
  }, [data.content, isEditing]);

  const saveContent = useDebouncedCallback(
    (newContent: string) => {
      updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          content: newContent,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    },
    500,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);
      saveContent(newContent);
    },
    [saveContent],
  );

  return (
    <BaseNodeWrapper nodeType="note" selected={selected} className="p-3">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />

      <div className="text-xs font-medium text-muted-foreground mb-1">
        📌 Notiz
      </div>
      {isEditing ? (
        <textarea
          value={content}
          onChange={handleChange}
          onBlur={() => setIsEditing(false)}
          autoFocus
          className="nodrag nowheel w-full resize-none rounded-md border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 min-h-[2rem]"
          placeholder="Notiz eingeben…"
          rows={3}
        />
      ) : (
        <div
          onDoubleClick={() => setIsEditing(true)}
          className="min-h-[2rem] cursor-text whitespace-pre-wrap break-words text-sm"
        >
          {content || (
            <span className="text-muted-foreground">
              Doppelklick zum Bearbeiten
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
