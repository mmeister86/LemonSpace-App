"use client";

import { useCallback, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { DEFAULT_MODEL_ID, getModel } from "@/lib/ai-models";
import { cn, formatEurFromCents } from "@/lib/utils";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  ImageIcon,
} from "lucide-react";

type AiImageNodeData = {
  storageId?: string;
  url?: string;
  prompt?: string;
  model?: string;
  modelTier?: string;
  generatedAt?: number;
  /** Gebuchte Credits in Euro-Cent (PRD: nach Commit) */
  creditCost?: number;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type AiImageNode = Node<AiImageNodeData, "ai-image">;

type NodeStatus =
  | "idle"
  | "analyzing"
  | "clarifying"
  | "executing"
  | "done"
  | "error";

export default function AiImageNode({
  id,
  data,
  selected,
}: NodeProps<AiImageNode>) {
  const nodeData = data as AiImageNodeData;
  const { getEdges, getNode } = useReactFlow();

  const [isGenerating, setIsGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const generateImage = useAction(api.ai.generateImage);

  const status = (nodeData._status ?? "idle") as NodeStatus;
  const errorMessage = nodeData._statusMessage;

  const isLoading =
    status === "executing" ||
    status === "analyzing" ||
    status === "clarifying" ||
    isGenerating;

  const handleRegenerate = useCallback(async () => {
    if (isLoading) return;
    setLocalError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) throw new Error("Missing canvasId");

      const prompt = nodeData.prompt;
      if (!prompt) throw new Error("No prompt — use Generate from a Prompt node");

      const edges = getEdges();
      const incomingEdges = edges.filter((e) => e.target === id);
      let referenceStorageId: Id<"_storage"> | undefined;
      for (const edge of incomingEdges) {
        const src = getNode(edge.source);
        if (src?.type === "image") {
          const srcData = src.data as { storageId?: string };
          if (srcData.storageId) {
            referenceStorageId = srcData.storageId as Id<"_storage">;
            break;
          }
        }
      }

      await generateImage({
        canvasId,
        nodeId: id as Id<"nodes">,
        prompt,
        referenceStorageId,
        model: nodeData.model ?? DEFAULT_MODEL_ID,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [isLoading, nodeData, id, getEdges, getNode, generateImage]);

  const modelName =
    getModel(nodeData.model ?? DEFAULT_MODEL_ID)?.name ?? "AI";

  return (
    <BaseNodeWrapper selected={selected} className="w-[320px] overflow-hidden">
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="border-b border-border px-3 py-2">
        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          🖼️ AI Image
        </div>
      </div>

      <div className="group relative h-[320px] overflow-hidden bg-muted">
        {status === "idle" && !nodeData.url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
            <p className="px-6 text-center text-xs opacity-60">
              Connect a Prompt node and click Generate
            </p>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
            <div className="absolute inset-0 overflow-hidden">
              <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <Loader2 className="relative z-10 h-8 w-8 animate-spin text-violet-500" />
            <p className="relative z-10 text-xs text-muted-foreground">
              {status === "analyzing" && "Analyzing…"}
              {status === "clarifying" && "Clarifying…"}
              {(status === "executing" || isGenerating) && "Generating…"}
            </p>
            <p className="relative z-10 text-[10px] text-muted-foreground/60">
              {modelName}
            </p>
          </div>
        )}

        {status === "error" && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="px-4 text-center text-xs font-medium text-destructive">
              Generation failed
            </p>
            <p className="px-6 text-center text-[10px] text-muted-foreground">
              {errorMessage ?? localError ?? "Unknown error"} — Credits not
              charged
            </p>
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              className="nodrag mt-1 flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          </div>
        )}

        {nodeData.url && !isLoading && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nodeData.url}
            alt={nodeData.prompt ?? "AI generated image"}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        )}

        {nodeData.creditCost != null &&
          nodeData.url &&
          !isLoading &&
          status !== "error" && (
            <div
              className="pointer-events-none absolute bottom-2 right-2 z-[15] rounded-md border border-border/80 bg-background/85 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground shadow-sm backdrop-blur-sm"
              title="Gebuchte Credits (Cent) für diese Generierung"
            >
              {formatEurFromCents(nodeData.creditCost)}
            </div>
          )}

        {status === "done" && nodeData.url && !isLoading && (
          <div
            className={cn(
              "absolute right-2 z-20 opacity-0 transition-opacity group-hover:opacity-100",
              nodeData.creditCost != null ? "bottom-12" : "bottom-2",
            )}
          >
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              className="nodrag flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-background"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>
        )}
      </div>

      {nodeData.prompt && (
        <div className="border-t border-border px-3 py-2">
          <p className="line-clamp-2 text-[10px] text-muted-foreground">
            {nodeData.prompt}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            {modelName}
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="image-out"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
