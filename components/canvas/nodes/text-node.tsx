"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";

type TextNodeData = {
  content?: string;
  _status?: string;
  _statusMessage?: string;
};

export type TextNode = Node<TextNodeData, "text">;

export default function TextNode({ id, data, selected }: NodeProps<TextNode>) {
  const { setNodes } = useReactFlow();
  const updateData = useMutation(api.nodes.updateData);
  const [content, setContent] = useState(data.content ?? "");
  const [isEditing, setIsEditing] = useState(false);

  // Sync von außen (Convex-Update) wenn nicht gerade editiert wird
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent(data.content ?? "");
    }
  }, [data.content, isEditing]);

  // Debounced Save — 500ms nach letztem Tastendruck
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
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: newContent,
                },
              }
            : node,
        ),
      );
      saveContent(newContent);
    },
    [id, saveContent, setNodes],
  );

  return (
    <BaseNodeWrapper
      nodeType="text"
      selected={selected}
      status={data._status}
      className="relative"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />

      <div className="w-full p-3">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          📝 Text
        </div>
        {isEditing ? (
          <textarea
            value={content}
            onChange={handleChange}
            onBlur={() => setIsEditing(false)}
            autoFocus
            className="nodrag nowheel w-full resize-none rounded-md border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 min-h-[3rem] overflow-hidden"
            placeholder="Text eingeben…"
            rows={3}
          />
        ) : (
          <div
            onDoubleClick={() => setIsEditing(true)}
            className="min-h-[2rem] cursor-text text-sm whitespace-pre-wrap overflow-wrap-break-word"
          >
            {content || (
              <span className="text-muted-foreground">
                Doppelklick zum Bearbeiten
              </span>
            )}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
