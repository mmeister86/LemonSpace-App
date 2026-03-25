"use client";

import { useState, useCallback, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";

type PromptNodeData = {
  prompt?: string;
  model?: string;
  _status?: string;
  _statusMessage?: string;
};

export type PromptNode = Node<PromptNodeData, "prompt">;

export default function PromptNode({
  id,
  data,
  selected,
}: NodeProps<PromptNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const [prompt, setPrompt] = useState(data.prompt ?? "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setPrompt(data.prompt ?? "");
    }
  }, [data.prompt, isEditing]);

  const savePrompt = useDebouncedCallback(
    (newPrompt: string) => {
      updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          prompt: newPrompt,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    },
    500,
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      setPrompt(newPrompt);
      savePrompt(newPrompt);
    },
    [savePrompt],
  );

  return (
    <BaseNodeWrapper
      selected={selected}
      status={data._status}
      className="border-purple-500/30"
    >
      <div className="w-72 p-3">
        <div className="text-xs font-medium text-purple-500 mb-1">
          ✨ Prompt
        </div>
        {isEditing ? (
          <textarea
            value={prompt}
            onChange={handleChange}
            onBlur={() => setIsEditing(false)}
            autoFocus
            className="nodrag nowheel w-full resize-none rounded-md border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 min-h-[3rem]"
            placeholder="Prompt eingeben…"
            rows={4}
          />
        ) : (
          <div
            onDoubleClick={() => setIsEditing(true)}
            className="min-h-[2rem] cursor-text text-sm whitespace-pre-wrap"
          >
            {prompt || (
              <span className="text-muted-foreground">
                Doppelklick zum Bearbeiten
              </span>
            )}
          </div>
        )}
        {data.model && (
          <div className="mt-2 text-xs text-muted-foreground">
            Modell: {data.model}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-purple-500 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
