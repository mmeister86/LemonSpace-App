"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Handle, Position, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { DEFAULT_MODEL_ID, getModel } from "@/lib/ai-models";
import { classifyError, type AiErrorCategory } from "@/lib/ai-errors";
import { DEFAULT_ASPECT_RATIO } from "@/lib/image-formats";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  ImageIcon,
  Coins,
  Clock3,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

type AiImageNodeData = {
  storageId?: string;
  url?: string;
  prompt?: string;
  model?: string;
  modelLabel?: string;
  modelTier?: string;
  generatedAt?: number;
  /** Gebuchte Credits in Euro-Cent (PRD: nach Commit) */
  creditCost?: number;
  canvasId?: string;
  /** OpenRouter image_config.aspect_ratio */
  aspectRatio?: string;
  outputWidth?: number;
  outputHeight?: number;
  retryCount?: number;
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
  const router = useRouter();

  const [isGenerating, setIsGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const generateImage = useAction(api.ai.generateImage);

  const status = (nodeData._status ?? "idle") as NodeStatus;
  const errorMessage = nodeData._statusMessage;
  const classifiedError = classifyError(errorMessage ?? localError);

  const executingRetryCount =
    typeof nodeData.retryCount === "number"
      ? nodeData.retryCount
      : classifiedError.retryCount;

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
      let referenceImageUrl: string | undefined;
      for (const edge of incomingEdges) {
        const src = getNode(edge.source);
        if (src?.type === "image") {
          const srcData = src.data as { storageId?: string };
          if (srcData.storageId) {
            referenceStorageId = srcData.storageId as Id<"_storage">;
            break;
          }
        }
        if (src?.type === "asset") {
          const srcData = src.data as { previewUrl?: string; url?: string };
          referenceImageUrl = srcData.url ?? srcData.previewUrl;
        }
      }

      const modelId = nodeData.model ?? DEFAULT_MODEL_ID;
      const regenCreditCost = getModel(modelId)?.creditCost ?? 4;

      await toast.promise(
        generateImage({
          canvasId,
          nodeId: id as Id<"nodes">,
          prompt,
          referenceStorageId,
          referenceImageUrl,
          model: modelId,
          aspectRatio: nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO,
        }),
        {
          loading: msg.ai.generating.title,
          success: msg.ai.generated.title,
          error: msg.ai.generationFailed.title,
          description: {
            success: msg.ai.generatedDesc(regenCreditCost),
            error: msg.ai.creditsNotCharged,
          },
        },
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : msg.ai.generationFailed.title);
    } finally {
      setIsGenerating(false);
    }
  }, [isLoading, nodeData, id, getEdges, getNode, generateImage]);

  const modelName =
    getModel(nodeData.model ?? DEFAULT_MODEL_ID)?.name ?? "AI";

  const renderErrorIcon = (category: AiErrorCategory) => {
    switch (category) {
      case "insufficient_credits":
        return <Coins className="h-8 w-8 text-amber-500" />;
      case "rate_limited":
      case "timeout":
        return <Clock3 className="h-8 w-8 text-amber-500" />;
      case "content_policy":
        return <ShieldAlert className="h-8 w-8 text-destructive" />;
      case "network":
        return <WifiOff className="h-8 w-8 text-destructive" />;
      default:
        return <AlertCircle className="h-8 w-8 text-destructive" />;
    }
  };

  return (
    <BaseNodeWrapper
      nodeType="ai-image"
      selected={selected}
      className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="prompt-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <ImageIcon className="h-3.5 w-3.5" />
          AI Image
        </div>
      </div>

      <div className="group relative min-h-0 flex-1 overflow-hidden bg-muted">
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
            {(status === "executing" || isGenerating) &&
              typeof executingRetryCount === "number" &&
              executingRetryCount > 0 && (
                <p className="relative z-10 text-[10px] text-amber-600 dark:text-amber-400">
                  Retry attempt {executingRetryCount}
                </p>
              )}
            <p className="relative z-10 text-[10px] text-muted-foreground/60">
              {modelName}
            </p>
          </div>
        )}

        {status === "error" && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
            {renderErrorIcon(classifiedError.category)}
            <p className="px-4 text-center text-xs font-medium text-destructive">
              {classifiedError.message}
            </p>
            {classifiedError.detail && (
              <p className="px-6 text-center text-[10px] text-muted-foreground">
                {classifiedError.detail}
              </p>
            )}
            {classifiedError.creditsNotCharged && (
              <p className="px-6 text-center text-[10px] text-muted-foreground">
                Credits not charged
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              {classifiedError.showTopUp && (
                <button
                  type="button"
                  onClick={() => router.push("/settings/billing")}
                  className="nodrag flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
                >
                  <Coins className="h-3 w-3" />
                  Top up credits
                </button>
              )}
              {classifiedError.retryable && (
                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  className="nodrag flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </button>
              )}
            </div>
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

        {status === "done" && nodeData.url && !isLoading && (
          <div
            className="absolute right-2 bottom-2 z-20 opacity-0 transition-opacity group-hover:opacity-100"
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
        <div className="shrink-0 border-t border-border px-3 py-2">
          <p className="line-clamp-2 text-[10px] text-muted-foreground">
            {nodeData.prompt}
          </p>
          {status === "done" && nodeData.creditCost != null ? (
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span
                className="min-w-0 truncate"
                title={nodeData.model ?? DEFAULT_MODEL_ID}
              >
                {nodeData.modelLabel ?? modelName} ·{" "}
                {nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <Coins className="h-3 w-3" />
                {nodeData.creditCost} Cr
              </span>
            </div>
          ) : (
            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
              {modelName} · {nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO}
            </p>
          )}
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
