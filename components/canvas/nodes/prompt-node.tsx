"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas prompt node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Position,
  useReactFlow,
  useStore,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  DEFAULT_MODEL_ID,
  getAvailableImageModels,
  getModel,
} from "@/lib/ai-models";
import {
  DEFAULT_ASPECT_RATIO,
  getAiImageNodeOuterSize,
  getImageViewportSize,
  IMAGE_FORMAT_GROUP_LABELS,
  IMAGE_FORMAT_PRESETS,
} from "@/lib/image-formats";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Coins } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { classifyError } from "@/lib/ai-errors";
import { normalizePublicTier } from "@/lib/tier-credits";
import CanvasHandle from "@/components/canvas/canvas-handle";

type PromptNodeData = {
  prompt?: string;
  aspectRatio?: string;
  model?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type PromptNode = Node<PromptNodeData, "prompt">;

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

export default function PromptNode({
  id,
  data,
  selected,
}: NodeProps<PromptNode>) {
  const t = useTranslations('toasts');
  const nodeData = data as PromptNodeData;
  const router = useRouter();
  const { getEdges, getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(nodeData.prompt ?? "");
  const [modelId, setModelId] = useState(nodeData.model ?? DEFAULT_MODEL_ID);
  const [aspectRatio, setAspectRatio] = useState(
    nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);

  const promptRef = useRef(prompt);
  const modelIdRef = useRef(modelId);
  const aspectRatioRef = useRef(aspectRatio);
  promptRef.current = prompt;
  modelIdRef.current = modelId;
  aspectRatioRef.current = aspectRatio;

  useEffect(() => {
    setPrompt(nodeData.prompt ?? "");
  }, [nodeData.prompt]);

  useEffect(() => {
    setModelId(nodeData.model ?? DEFAULT_MODEL_ID);
  }, [nodeData.model]);

  useEffect(() => {
    setAspectRatio(nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO);
  }, [nodeData.aspectRatio]);

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

  const dataRef = useRef(data);
  dataRef.current = data;

  const balance = useAuthQuery(api.credits.getBalance);
  const subscription = useAuthQuery(api.credits.getSubscription);
  const userTier = normalizePublicTier(subscription?.tier ?? "free");
  const availableModels = useMemo(
    () => getAvailableImageModels(userTier),
    [userTier],
  );

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }

    if (!availableModels.some((model) => model.id === modelId)) {
      setModelId(availableModels[0]!.id);
    }
  }, [availableModels, modelId]);

  const selectedModel =
    getModel(modelId) ??
    availableModels[0] ??
    getModel(DEFAULT_MODEL_ID);
  const resolvedModelId = selectedModel?.id ?? DEFAULT_MODEL_ID;
  const creditCost = selectedModel?.creditCost ?? 4;

  const availableCredits =
    balance !== undefined ? balance.balance - balance.reserved : null;
  const hasEnoughCredits =
    availableCredits !== null && availableCredits >= creditCost;

  const { queueNodeDataUpdate, status } = useCanvasSync();
  const generateImage = useAction(api.ai.generateImage);
  const { createNodeConnectedFromSource } = useCanvasPlacement();

  const debouncedSave = useDebouncedCallback(() => {
    const raw = dataRef.current as Record<string, unknown>;
    const { _status, _statusMessage, ...rest } = raw;
    void _status;
    void _statusMessage;
    void queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
        data: {
          ...rest,
          prompt: promptRef.current,
          model: modelIdRef.current,
          aspectRatio: aspectRatioRef.current,
        },
      });
  }, 500);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedSave();
    },
    [debouncedSave]
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      setAspectRatio(value);
      debouncedSave();
    },
    [debouncedSave]
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setModelId(value);
      debouncedSave();
    },
    [debouncedSave],
  );

  const handleGenerate = useCallback(async () => {
    if (!effectivePrompt.trim() || isGenerating) return;
    if (status.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstützt",
        "KI-Generierung benötigt eine aktive Verbindung.",
      );
      return;
    }

    if (availableCredits !== null && !hasEnoughCredits) {
      toast.action(t('ai.insufficientCreditsTitle'), {
        description: t('ai.insufficientCreditsDesc', { needed: creditCost, available: availableCredits }),
        label: t('billing.topUp'),
        onClick: () => router.push("/settings/billing"),
        type: "warning",
      });
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) throw new Error("Canvas-ID fehlt in der Node");

      const currentEdges = getEdges();
      const incomingEdges = currentEdges.filter((e) => e.target === id);
      let connectedTextPrompt: string | undefined;
      let referenceStorageId: Id<"_storage"> | undefined;
      let referenceImageUrl: string | undefined;

      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (sourceNode?.type === "text" || sourceNode?.type === "ai-text-output") {
          const textValue = getSourceTextValue(sourceNode);
          if (textValue.trim().length > 0) {
            connectedTextPrompt = textValue;
          }
        }
        if (sourceNode?.type === "image") {
          const srcData = sourceNode.data as { storageId?: string };
          if (srcData.storageId) {
            referenceStorageId = srcData.storageId as Id<"_storage">;
          }
        }
        if (sourceNode?.type === "asset") {
          const srcData = sourceNode.data as { previewUrl?: string; url?: string };
          referenceImageUrl = srcData.url ?? srcData.previewUrl;
        }
      }

      const promptToUse = (connectedTextPrompt ?? prompt).trim();
      if (!promptToUse) return;

      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 280) + 32;
      const posX = (currentNode?.position?.x ?? 0) + offsetX;
      const posY = currentNode?.position?.y ?? 0;

      const viewport = getImageViewportSize(aspectRatio);
      const outer = getAiImageNodeOuterSize(viewport);

      const clientRequestId = crypto.randomUUID();

      const aiNodeId = await createNodeConnectedFromSource({
        type: "ai-image",
        position: { x: posX, y: posY },
        width: outer.width,
        height: outer.height,
        data: {
          prompt: promptToUse,
          model: resolvedModelId,
          modelTier: selectedModel?.tier ?? "standard",
          canvasId,
          aspectRatio,
          outputWidth: viewport.width,
          outputHeight: viewport.height,
        },
        clientRequestId,
        sourceNodeId: id as Id<"nodes">,
        sourceHandle: "prompt-out",
        targetHandle: "prompt-in",
      });

      await toast.promise(
        generateImage({
          canvasId,
          nodeId: aiNodeId,
          prompt: promptToUse,
          referenceStorageId,
          referenceImageUrl,
          model: resolvedModelId,
          aspectRatio,
        }),
        {
          loading: t('ai.generating'),
          success: t('ai.generationQueued'),
          error: t('ai.generationFailed'),
          description: {
            success: t('ai.generationQueuedDesc'),
            error: t('ai.creditsNotCharged'),
          },
        },
      );
    } catch (err) {
      const classified = classifyError(err);

      if (classified.type === "dailyCap") {
        toast.error(
          t('billing.dailyLimitReachedTitle'),
          "Morgen stehen wieder Generierungen zur Verfügung.",
        );
      } else if (classified.type === "concurrency") {
        toast.warning(
          t('ai.concurrentLimitReachedTitle'),
          t('ai.concurrentLimitReachedDesc'),
        );
      } else {
        setError(classified.rawMessage || t('ai.generationFailed'));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
    prompt,
    effectivePrompt,
    aspectRatio,
    resolvedModelId,
    isGenerating,
    nodeData.canvasId,
    id,
    getEdges,
    getNode,
    createNodeConnectedFromSource,
    generateImage,
    selectedModel?.tier,
    creditCost,
    availableCredits,
    hasEnoughCredits,
    router,
    status.isOffline,
    t,
  ]);

  return (
    <BaseNodeWrapper
      nodeType="prompt"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[240px] border-violet-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="prompt"
        type="target"
        position={Position.Left}
        id="image-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
          KI-Bild
        </div>
        {inputMeta.hasTextInput ? (
          <div className="flex-1 overflow-auto rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
            <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
              Prompt aus verbundener Text-Node
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {inputMeta.textPrompt.trim() || "(Verbundene Text-Node ist leer)"}
            </p>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Beschreibe, was du generieren willst…"
            className="nodrag nowheel min-h-[72px] w-full flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`prompt-model-${id}`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Modell
          </Label>
          <Select value={resolvedModelId} onValueChange={handleModelChange}>
            <SelectTrigger
              id={`prompt-model-${id}`}
              className="nodrag nowheel w-full"
              size="sm"
            >
              <SelectValue placeholder="Modell" />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`prompt-format-${id}`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Format
          </Label>
          <Select
            value={aspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger
              id={`prompt-format-${id}`}
              className="nodrag nowheel w-full"
              size="sm"
            >
              <SelectValue placeholder="Seitenverhältnis" />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {(["square", "landscape", "portrait"] as const).map((group) => {
                const presets = IMAGE_FORMAT_PRESETS.filter(
                  (p) => p.group === group
                );
                if (presets.length === 0) return null;
                return (
                  <SelectGroup key={group}>
                    <SelectLabel>{IMAGE_FORMAT_GROUP_LABELS[group]}</SelectLabel>
                    {presets.map((p) => (
                      <SelectItem key={p.aspectRatio} value={p.aspectRatio}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={
              !effectivePrompt.trim() || isGenerating || balance === undefined
            }
            className={`nodrag flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
              availableCredits !== null && !hasEnoughCredits
                ? "bg-amber-600/90 text-white hover:bg-amber-600"
                : "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generiere…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Bild generieren
                <span className="inline-flex items-center gap-1 text-xs opacity-90">
                  <Coins className="h-3 w-3" />
                  {creditCost} Cr
                </span>
              </>
            )}
          </button>
          {availableCredits !== null && !hasEnoughCredits && (
            <p className="text-center text-xs text-destructive">
              Not enough credits ({availableCredits} available, {creditCost}{" "}
              needed)
            </p>
          )}
        </div>
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="prompt"
        type="source"
        position={Position.Right}
        id="prompt-out"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
