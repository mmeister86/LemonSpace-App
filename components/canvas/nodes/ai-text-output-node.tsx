"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas ai text output node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useState } from "react";
import { Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { AlertCircle, Copy, Loader2, RefreshCw, Type } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { classifyError } from "@/lib/ai-errors";
import { getAiTextModel } from "@/lib/ai-text-models";
import { toast } from "@/lib/toast";
import BaseNodeWrapper from "./base-node-wrapper";
import CanvasHandle from "@/components/canvas/canvas-handle";

type AiTextOutputNodeData = {
  instruction?: string;
  inputText?: string;
  outputText?: string;
  modelId?: string;
  creditCost?: number;
  generatedAt?: number;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

type NodeStatus =
  | "idle"
  | "analyzing"
  | "clarifying"
  | "executing"
  | "done"
  | "error";

export type AiTextOutputNodeType = Node<AiTextOutputNodeData, "ai-text-output">;

export default function AiTextOutputNode({
  id,
  data,
  selected,
}: NodeProps<AiTextOutputNodeType>) {
  const t = useTranslations("aiTextOutputNode");
  const nodeData = data as AiTextOutputNodeData;
  const { getEdges, getNode } = useReactFlow();
  const { status: syncStatus } = useCanvasSync();
  const [isRetrying, setIsRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const generateText = useAction(
    (api as unknown as {
      ai: {
        generateText: FunctionReference<
          "action",
          "public",
          {
            canvasId: Id<"canvases">;
            sourceNodeId: Id<"nodes">;
            outputNodeId: Id<"nodes">;
            modelId: string;
            instruction?: string;
            inputText?: string;
          },
          { queued: true; outputNodeId: Id<"nodes"> }
        >;
      };
    }).ai.generateText,
  );

  const status = (nodeData._status ?? "idle") as NodeStatus;
  const isLoading =
    status === "executing" || status === "analyzing" || status === "clarifying" || isRetrying;
  const outputText = typeof nodeData.outputText === "string" ? nodeData.outputText.trim() : "";
  const modelLabel =
    typeof nodeData.modelId === "string"
      ? getAiTextModel(nodeData.modelId)?.label ?? nodeData.modelId
      : "-";
  const classifiedError = classifyError(nodeData._statusMessage ?? localError);

  const handleRetry = useCallback(async () => {
    if (isRetrying) {
      return;
    }

    if (syncStatus.isOffline) {
      toast.warning(t("offlineTitle"), t("offlineDescription"));
      return;
    }

    const incomingEdge = getEdges().find((edge) => edge.target === id);
    if (!incomingEdge) {
      setLocalError(t("errorFallback"));
      return;
    }

    const sourceNode = getNode(incomingEdge.source);
    if (!sourceNode || sourceNode.type !== "ai-text") {
      setLocalError(t("errorFallback"));
      return;
    }

    const sourceData = sourceNode.data as { canvasId?: string } | undefined;
    const canvasId = (nodeData.canvasId ?? sourceData?.canvasId) as
      | Id<"canvases">
      | undefined;
    const modelId = nodeData.modelId;
    if (!canvasId || !modelId) {
      setLocalError(t("errorFallback"));
      return;
    }

    setLocalError(null);
    setIsRetrying(true);
    try {
      await toast.promise(
        generateText({
          canvasId,
          sourceNodeId: incomingEdge.source as Id<"nodes">,
          outputNodeId: id as Id<"nodes">,
          modelId,
          instruction: nodeData.instruction?.trim() || undefined,
          inputText: nodeData.inputText?.trim() || undefined,
        }),
        {
          loading: t("generating"),
          success: t("generationQueuedTitle"),
          error: t("generationFailed"),
        },
      );
    } catch (error) {
      const classified = classifyError(error);
      setLocalError(classified.rawMessage ?? t("generationFailed"));
    } finally {
      setIsRetrying(false);
    }
  }, [
    generateText,
    getEdges,
    getNode,
    id,
    isRetrying,
    nodeData.canvasId,
    nodeData.inputText,
    nodeData.instruction,
    nodeData.modelId,
    syncStatus.isOffline,
    t,
  ]);

  const handleCopy = useCallback(async () => {
    if (!outputText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(outputText);
      toast.success(t("copiedTitle"), t("copiedDescription"));
    } catch {
      toast.error(t("copyFailedTitle"), t("copyFailedDescription"));
    }
  }, [outputText, t]);

  return (
    <BaseNodeWrapper
      nodeType="ai-text-output"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="flex h-full min-h-0 w-full min-w-0 flex-col border-violet-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="ai-text-output"
        type="target"
        position={Position.Left}
        id="ai-text-output-in"
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-600"
      />

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
          <Type className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t("label")}</span>
        </div>
        {outputText ? (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("copyButton")}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            <p className="text-xs text-muted-foreground">{t("generating")}</p>
          </div>
        ) : null}

        {status === "error" && !isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-xs text-destructive">
              {classifiedError.rawMessage ?? t("errorFallback")}
            </p>
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isRetrying}
              className="nodrag inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3${isRetrying ? " animate-spin" : ""}`} />
              {t("retryButton")}
            </button>
          </div>
        ) : null}

        {!isLoading && status !== "error" ? (
          <div className="h-full overflow-auto p-3 text-sm">
            {outputText ? (
              <div className="whitespace-pre-wrap break-words">{outputText}</div>
            ) : (
              <p className="text-muted-foreground">{t("emptyHint")}</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <p className="truncate" title={modelLabel}>
          {t("modelMeta", { model: modelLabel })}
        </p>
        {typeof nodeData.creditCost === "number" ? (
          <p>{t("creditMeta", { credits: nodeData.creditCost })}</p>
        ) : null}
        {nodeData.instruction ? <p className="line-clamp-1">{nodeData.instruction}</p> : null}
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="ai-text-output"
        type="source"
        position={Position.Right}
        id="ai-text-output-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-600"
      />
    </BaseNodeWrapper>
  );
}
