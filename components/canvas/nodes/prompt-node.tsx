"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { DEFAULT_MODEL_ID } from "@/lib/ai-models";
import { Sparkles, Loader2 } from "lucide-react";

type PromptNodeData = {
  prompt?: string;
  model?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type PromptNode = Node<PromptNodeData, "prompt">;

export default function PromptNode({
  id,
  data,
  selected,
}: NodeProps<PromptNode>) {
  const nodeData = data as PromptNodeData;
  const { getEdges, getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(nodeData.prompt ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(nodeData.prompt ?? "");
  }, [nodeData.prompt]);

  const dataRef = useRef(data);
  dataRef.current = data;

  const updateData = useMutation(api.nodes.updateData);
  const createNode = useMutation(api.nodes.create);
  const generateImage = useAction(api.ai.generateImage);

  const debouncedSave = useDebouncedCallback((value: string) => {
    const raw = dataRef.current as Record<string, unknown>;
    const { _status, _statusMessage, ...rest } = raw;
    void _status;
    void _statusMessage;
    updateData({
      nodeId: id as Id<"nodes">,
      data: { ...rest, prompt: value },
    });
  }, 500);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedSave(value);
    },
    [debouncedSave]
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) throw new Error("Missing canvasId on node");

      const edges = getEdges();
      const incomingEdges = edges.filter((e) => e.target === id);
      let referenceStorageId: Id<"_storage"> | undefined;

      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (sourceNode?.type === "image") {
          const srcData = sourceNode.data as { storageId?: string };
          if (srcData.storageId) {
            referenceStorageId = srcData.storageId as Id<"_storage">;
            break;
          }
        }
      }

      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 280) + 32;
      const posX = (currentNode?.position?.x ?? 0) + offsetX;
      const posY = currentNode?.position?.y ?? 0;

      const aiNodeId = await createNode({
        canvasId,
        type: "ai-image",
        positionX: posX,
        positionY: posY,
        width: 320,
        height: 320,
        data: {
          prompt,
          model: DEFAULT_MODEL_ID,
          modelTier: "standard",
          canvasId,
        },
      });

      await generateImage({
        canvasId,
        nodeId: aiNodeId,
        prompt,
        referenceStorageId,
        model: DEFAULT_MODEL_ID,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [
    prompt,
    isGenerating,
    nodeData.canvasId,
    id,
    getEdges,
    getNode,
    createNode,
    generateImage,
  ]);

  return (
    <BaseNodeWrapper
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[240px] border-violet-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="flex flex-col gap-2 p-3">
        <div className="text-xs font-medium text-violet-600 dark:text-violet-400">
          ✨ Prompt
        </div>
        <textarea
          value={prompt}
          onChange={handlePromptChange}
          placeholder="Describe what you want to generate…"
          rows={4}
          className="nodrag nowheel w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
        />

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={!prompt.trim() || isGenerating}
          className="nodrag flex items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Image
            </>
          )}
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="prompt-out"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
