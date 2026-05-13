"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas ai video node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useTranslations } from "next-intl";
import { AlertCircle, Download, Loader2, RefreshCw, Video } from "lucide-react";
import { Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { classifyError } from "@/lib/ai-errors";
import { getVideoModel, type VideoModelDurationSeconds } from "@/lib/ai-video-models";
import { toast } from "@/lib/toast";
import BaseNodeWrapper from "./base-node-wrapper";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { MediaBacklight } from "./media-backlight";

type AiVideoNodeData = {
  prompt?: string;
  modelId?: string;
  durationSeconds?: VideoModelDurationSeconds;
  creditCost?: number;
  canvasId?: string;
  url?: string;
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

export type AiVideoNodeType = Node<AiVideoNodeData, "ai-video">;

export default function AiVideoNode({ id, data, selected }: NodeProps<AiVideoNodeType>) {
  const t = useTranslations("aiVideoNode");
  const tToast = useTranslations("toasts");
  const nodeData = data as AiVideoNodeData;
  const { getEdges, getNode } = useReactFlow();
  const { status: syncStatus } = useCanvasSync();
  const generateVideo = useAction(
    (api as unknown as {
      ai: {
        generateVideo: FunctionReference<
          "action",
          "public",
          {
            canvasId: Id<"canvases">;
            sourceNodeId: Id<"nodes">;
            outputNodeId: Id<"nodes">;
            prompt: string;
            modelId: string;
            durationSeconds: 5 | 10;
          },
          { queued: true; outputNodeId: Id<"nodes"> }
        >;
      };
    }).ai.generateVideo,
  );
  const status = (nodeData._status ?? "idle") as NodeStatus;
  const [isRetrying, setIsRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const classifiedError = classifyError(nodeData._statusMessage ?? localError);
  const isLoading =
    status === "executing" || status === "analyzing" || status === "clarifying" || isRetrying;

  const modelLabel =
    typeof nodeData.modelId === "string"
      ? getVideoModel(nodeData.modelId)?.label ?? nodeData.modelId
      : "-";

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;

    if (syncStatus.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstuetzt",
        "KI-Generierung benoetigt eine aktive Verbindung.",
      );
      return;
    }

    const prompt = nodeData.prompt?.trim();
    const modelId = nodeData.modelId;
    const durationSeconds = nodeData.durationSeconds;

    if (!prompt || !modelId || !durationSeconds) {
      setLocalError(t("errorFallback"));
      return;
    }

    const incomingEdge = getEdges().find((edge) => edge.target === id);
    if (!incomingEdge) {
      setLocalError(t("errorFallback"));
      return;
    }

    const sourceNode = getNode(incomingEdge.source);
    if (!sourceNode || sourceNode.type !== "video-prompt") {
      setLocalError(t("errorFallback"));
      return;
    }

    const sourceData = sourceNode.data as { canvasId?: string } | undefined;
    const canvasId = (nodeData.canvasId ?? sourceData?.canvasId) as Id<"canvases"> | undefined;
    if (!canvasId) {
      setLocalError(t("errorFallback"));
      return;
    }

    setLocalError(null);
    setIsRetrying(true);

    try {
      await toast.promise(
        generateVideo({
          canvasId,
          sourceNodeId: incomingEdge.source as Id<"nodes">,
          outputNodeId: id as Id<"nodes">,
          prompt,
          modelId,
          durationSeconds,
        }),
        {
          loading: tToast("ai.generating"),
          success: tToast("ai.generationQueued"),
          error: tToast("ai.generationFailed"),
        },
      );
    } catch (error) {
      const classified = classifyError(error);
      setLocalError(classified.rawMessage ?? tToast("ai.generationFailed"));
    } finally {
      setIsRetrying(false);
    }
  }, [
    generateVideo,
    getEdges,
    getNode,
    id,
    isRetrying,
    nodeData.canvasId,
    nodeData.durationSeconds,
    nodeData.modelId,
    nodeData.prompt,
    syncStatus.isOffline,
    t,
    tToast,
  ]);
  const mediaBacklight =
    nodeData.url && !isLoading ? (
      <MediaBacklight>
        <video
          src={nodeData.url}
          className="h-full w-full object-contain"
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        />
      </MediaBacklight>
    ) : undefined;

  return (
    <BaseNodeWrapper
      nodeType="ai-video"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="flex h-full w-full min-h-0 min-w-0 flex-col"
      backlight={mediaBacklight}
    >
      <CanvasHandle
        nodeId={id}
        nodeType="ai-video"
        type="target"
        position={Position.Left}
        id="video-in"
        className="!h-3 !w-3 !bg-violet-600 !border-2 !border-background"
      />

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
          <Video className="h-3.5 w-3.5" />
          {t("label")}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        {status === "idle" && !nodeData.url ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground">
            {t("idleHint")}
          </div>
        ) : null}

        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
            <p className="text-xs text-muted-foreground">{t("generating")}</p>
          </div>
        ) : null}

        {status === "error" && !isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
            <AlertCircle className="h-7 w-7 text-destructive" />
            <p className="text-center text-xs text-destructive">
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

        {nodeData.url && !isLoading ? (
          <video
            src={nodeData.url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <p className="truncate" title={modelLabel}>
          {t("modelMeta", { model: modelLabel })}
        </p>
        {typeof nodeData.durationSeconds === "number" ? (
          <p>{t("durationMeta", { duration: nodeData.durationSeconds })}</p>
        ) : null}
        {typeof nodeData.creditCost === "number" ? (
          <p>{t("creditMeta", { credits: nodeData.creditCost })}</p>
        ) : null}
        {nodeData.prompt ? <p className="line-clamp-1">{nodeData.prompt}</p> : null}
        {nodeData.url ? (
          <a
            href={nodeData.url}
            download
            className="nodrag inline-flex items-center gap-1 text-xs text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
          >
            <Download className="h-3 w-3" />
            {t("downloadButton")}
          </a>
        ) : null}
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="ai-video"
        type="source"
        position={Position.Right}
        id="video-out"
        className="!h-3 !w-3 !bg-violet-600 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
