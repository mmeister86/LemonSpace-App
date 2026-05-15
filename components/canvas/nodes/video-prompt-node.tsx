"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas video prompt node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useMemo, useState } from "react";
import { Position, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useRouter } from "next/navigation";
import { Coins, Loader2, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModel,
  isVideoModelId,
  type VideoModelDurationSeconds,
  type VideoModelId,
} from "@/lib/ai-video-models";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import { toast } from "@/lib/toast";
import { classifyError } from "@/lib/ai-errors";
import BaseNodeWrapper from "./base-node-wrapper";
import { Label } from "@/components/ui/label";
import { CanvasAiModelSelector } from "@/components/canvas/nodes/canvas-ai-model-selector";
import CanvasHandle from "@/components/canvas/canvas-handle";

type VideoPromptNodeData = {
  prompt?: string;
  modelId?: string;
  durationSeconds?: number;
  hasAudio?: boolean;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type VideoPromptNodeType = Node<VideoPromptNodeData, "video-prompt">;

function normalizeDuration(value: number | undefined): VideoModelDurationSeconds {
  return value === 10 ? 10 : 5;
}

function getSourceTextValue(node: { type?: string; data?: unknown } | undefined): string {
  if (!node || !node.data || typeof node.data !== "object") {
    return "";
  }

  const data = node.data as { content?: string; outputText?: string };
  if (node.type === "ai-text-output") {
    return typeof data.outputText === "string" ? data.outputText : "";
  }

  return typeof data.content === "string" ? data.content : "";
}

export default function VideoPromptNode({
  id,
  data,
  selected,
}: NodeProps<VideoPromptNodeType>) {
  const t = useTranslations("videoPromptNode");
  const tToast = useTranslations("toasts");
  const nodeData = data as VideoPromptNodeData;
  const router = useRouter();
  const { getNode } = useReactFlow();
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const { createNodeConnectedFromSource } = useCanvasPlacement();
  const balance = useAuthQuery(api.credits.getBalance);
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);
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

  const [prompt, setPrompt] = useState(nodeData.prompt ?? "");
  const [modelId, setModelId] = useState<VideoModelId>(
    isVideoModelId(nodeData.modelId ?? "")
      ? (nodeData.modelId as VideoModelId)
      : DEFAULT_VIDEO_MODEL_ID,
  );
  const [durationSeconds, setDurationSeconds] = useState<VideoModelDurationSeconds>(
    normalizeDuration(nodeData.durationSeconds),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputMeta = useMemo(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    let textPrompt: string | undefined;
    let hasTextInput = false;

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (sourceNode?.type !== "text" && sourceNode?.type !== "ai-text-output") continue;
      hasTextInput = true;
      const textValue = getSourceTextValue(sourceNode);
      if (textValue.trim().length > 0) {
        textPrompt = textValue;
        break;
      }
    }

    return {
      hasTextInput,
      textPrompt: textPrompt ?? "",
    };
  }, [edges, id, nodes]);

  const effectivePrompt = inputMeta.hasTextInput ? inputMeta.textPrompt : prompt;
  const selectedModel = getVideoModel(modelId) ?? getVideoModel(DEFAULT_VIDEO_MODEL_ID);
  const creditCost = selectedModel?.creditCost[durationSeconds] ?? 0;
  const availableCredits =
    balance !== undefined ? balance.balance - balance.reserved : null;
  const hasEnoughCredits =
    availableCredits === null ? true : availableCredits >= creditCost;

  const debouncedSave = useDebouncedCallback(
    (
      nextPrompt: string,
      nextModelId: VideoModelId,
      nextDurationSeconds: VideoModelDurationSeconds,
    ) => {
      const raw = data as Record<string, unknown>;
      const { _status, _statusMessage, ...rest } = raw;
      void _status;
      void _statusMessage;

      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...rest,
          prompt: nextPrompt,
          modelId: nextModelId,
          durationSeconds: nextDurationSeconds,
        },
      });
    },
    500,
  );

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setPrompt(value);
      debouncedSave(value, modelId, durationSeconds);
    },
    [debouncedSave, durationSeconds, modelId],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      if (!isVideoModelId(value)) return;
      setModelId(value);
      debouncedSave(prompt, value, durationSeconds);
    },
    [debouncedSave, durationSeconds, prompt],
  );

  const handleDurationChange = useCallback(
    (value: VideoModelDurationSeconds) => {
      setDurationSeconds(value);
      debouncedSave(prompt, modelId, value);
    },
    [debouncedSave, modelId, prompt],
  );

  const generateDisabled =
    !effectivePrompt.trim() || balance === undefined || !hasEnoughCredits || isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!effectivePrompt.trim() || isGenerating) return;

    if (status.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstuetzt",
        "KI-Generierung benoetigt eine aktive Verbindung.",
      );
      return;
    }

    if (availableCredits !== null && !hasEnoughCredits) {
      toast.action(tToast("ai.insufficientCreditsTitle"), {
        description: tToast("ai.insufficientCreditsDesc", {
          needed: creditCost,
          available: availableCredits,
        }),
        label: tToast("billing.topUp"),
        onClick: () => router.push("/settings/billing"),
        type: "warning",
      });
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) {
        throw new Error("Canvas-ID fehlt in der Node");
      }

      const promptToUse = effectivePrompt.trim();
      if (!promptToUse) return;

      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 260) + 32;
      const position = {
        x: (currentNode?.position?.x ?? 0) + offsetX,
        y: currentNode?.position?.y ?? 0,
      };

      const clientRequestId = crypto.randomUUID();
      const outputNodeId = await createNodeConnectedFromSource({
        type: "ai-video",
        position,
        data: {
          prompt: promptToUse,
          modelId,
          durationSeconds,
          creditCost,
          canvasId,
        },
        clientRequestId,
        sourceNodeId: id as Id<"nodes">,
        sourceHandle: "video-prompt-out",
        targetHandle: "video-in",
      });

      await toast.promise(
        generateVideo({
          canvasId,
          sourceNodeId: id as Id<"nodes">,
          outputNodeId,
          prompt: promptToUse,
          modelId,
          durationSeconds,
        }),
        {
          loading: tToast("ai.generating"),
          success: tToast("ai.generationQueued"),
          error: tToast("ai.generationFailed"),
        },
      );
    } catch (err) {
      const classified = classifyError(err);

      if (classified.type === "dailyCap") {
        toast.error(
          tToast("billing.dailyLimitReachedTitle"),
          "Morgen stehen wieder Generierungen zur Verfuegung.",
        );
      } else if (classified.type === "concurrency") {
        toast.warning(
          tToast("ai.concurrentLimitReachedTitle"),
          tToast("ai.concurrentLimitReachedDesc"),
        );
      } else {
        setError(classified.rawMessage || tToast("ai.generationFailed"));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
    availableCredits,
    createNodeConnectedFromSource,
    creditCost,
    durationSeconds,
    effectivePrompt,
    generateVideo,
    getNode,
    hasEnoughCredits,
    id,
    isGenerating,
    modelId,
    nodeData.canvasId,
    router,
    status.isOffline,
    tToast,
  ]);

  return (
    <BaseNodeWrapper
      nodeType="video-prompt"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[260px] border-violet-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="video-prompt"
        type="target"
        position={Position.Left}
        id="video-prompt-in"
        className="!h-3 !w-3 !bg-violet-600 !border-2 !border-background"
      />

      <div data-canvas-node-autosize-content className="flex shrink-0 flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
          <Video className="h-3.5 w-3.5" />
          {t("label")}
        </div>

        {inputMeta.hasTextInput ? (
          <div className="flex-1 overflow-auto rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
            <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
              {t("promptFromTextNode")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {inputMeta.textPrompt.trim() || t("noPromptHint")}
            </p>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={handlePromptChange}
            placeholder={t("promptPlaceholder")}
            className="nodrag nowheel min-h-[72px] w-full flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`video-model-${id}`} className="text-[11px] text-muted-foreground">
            {t("modelLabel")}
          </Label>
          <CanvasAiModelSelector
            kind="video"
            value={modelId}
            onValueChange={handleModelChange}
            durationSeconds={durationSeconds}
            className="w-full"
            placeholder={t("modelLabel")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] text-muted-foreground">{t("durationLabel")}</Label>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => handleDurationChange(5)}
              className={`nodrag rounded-md border px-2 py-1.5 text-xs ${
                durationSeconds === 5
                  ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  : "border-border bg-background"
              }`}
            >
              {t("duration5s")}
            </button>
            <button
              type="button"
              onClick={() => handleDurationChange(10)}
              className={`nodrag rounded-md border px-2 py-1.5 text-xs ${
                durationSeconds === 10
                  ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  : "border-border bg-background"
              }`}
            >
              {t("duration10s")}
            </button>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generateDisabled}
          className="nodrag inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {tToast("ai.generating")}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {t("generateButton")}
              <span className="inline-flex items-center gap-1 text-xs opacity-90">
                <Coins className="h-3 w-3" />
                {creditCost} Cr
              </span>
            </>
          )}
        </button>

        {availableCredits !== null && !hasEnoughCredits ? (
          <p className="text-center text-xs text-destructive">{t("insufficientCredits")}</p>
        ) : null}
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="video-prompt"
        type="source"
        position={Position.Right}
        id="video-prompt-out"
        className="!h-3 !w-3 !bg-violet-600 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
