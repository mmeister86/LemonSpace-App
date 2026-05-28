"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas ai image node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Position, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { DEFAULT_MODEL_ID, getModel } from "@/lib/ai-models";
import { classifyError, type ErrorType } from "@/lib/ai-errors";
import { DEFAULT_ASPECT_RATIO } from "@/lib/image-formats";
import { toast } from "@/lib/toast";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  ImageIcon,
  Coins,
  Clock3,
  ShieldAlert,
  WifiOff,
  Maximize2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { MediaBacklight } from "./media-backlight";
import {
  isAiImageReferenceSourceType,
  MAX_AI_IMAGE_REFERENCES,
  type AiImageReferenceInput,
} from "@/lib/ai-image-references";

type AiImageNodeData = {
  storageId?: string;
  url?: string;
  previewUrl?: string;
  imageUrl?: string;
  lastUploadStorageId?: string;
  lastUploadUrl?: string;
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
  referenceImages?: AiImageReferenceInput[];
  referenceStorageId?: string;
  referenceImageUrl?: string;
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

function getImageReferenceFromNode(
  node: {
    id?: string;
    type?: string;
    data?: unknown;
    position?: { x?: number; y?: number };
  } | undefined,
  label: string,
): AiImageReferenceInput | null {
  if (!node || !node.data || typeof node.data !== "object") {
    return null;
  }

  if (node.type === "image") {
    const data = node.data as { storageId?: string; url?: string };
    if (data.storageId) {
      return {
        sourceNodeId: node.id ?? "",
        sourceType: "image",
        label,
        storageId: data.storageId,
      };
    }
    return data.url
      ? {
          sourceNodeId: node.id ?? "",
          sourceType: "image",
          label,
          imageUrl: data.url,
        }
      : null;
  }

  if (node.type === "asset") {
    const data = node.data as { previewUrl?: string; url?: string };
    const imageUrl = data.url ?? data.previewUrl;
    return imageUrl
      ? {
          sourceNodeId: node.id ?? "",
          sourceType: "asset",
          label,
          imageUrl,
        }
      : null;
  }

  if (node.type === "ai-image") {
    const data = node.data as { storageId?: string; url?: string };
    if (data.storageId) {
      return {
        sourceNodeId: node.id ?? "",
        sourceType: "ai-image",
        label,
        storageId: data.storageId,
      };
    }
    return data.url
      ? {
          sourceNodeId: node.id ?? "",
          sourceType: "ai-image",
          label,
          imageUrl: data.url,
        }
      : null;
  }

  if (node.type === "render") {
    const data = node.data as {
      storageId?: string;
      url?: string;
      lastUploadStorageId?: string;
      lastUploadUrl?: string;
      lastUploadedHash?: string;
    };
    const storageId = data.storageId ?? data.lastUploadStorageId;
    const imageUrl = data.url ?? data.lastUploadUrl;
    if (!storageId && !imageUrl) {
      return null;
    }
    return {
      sourceNodeId: node.id ?? "",
      sourceType: "render",
      label,
      ...(storageId ? { storageId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(data.lastUploadedHash ? { renderPipelineHash: data.lastUploadedHash } : {}),
    };
  }

  return null;
}

type RegenerateSourceNode = {
  id: string;
  type?: string;
  data?: unknown;
  position?: { x?: number; y?: number };
};

function compareRegenerateSourceNodes(
  left: RegenerateSourceNode,
  right: RegenerateSourceNode,
): number {
  const leftY = typeof left.position?.y === "number" ? left.position.y : 0;
  const rightY = typeof right.position?.y === "number" ? right.position.y : 0;
  if (leftY !== rightY) return leftY - rightY;

  const leftX = typeof left.position?.x === "number" ? left.position.x : 0;
  const rightX = typeof right.position?.x === "number" ? right.position.x : 0;
  if (leftX !== rightX) return leftX - rightX;

  return left.id.localeCompare(right.id);
}

function buildLegacyReferenceImage(data: AiImageNodeData): AiImageReferenceInput[] {
  if (Array.isArray(data.referenceImages) && data.referenceImages.length > 0) {
    return data.referenceImages.slice(0, MAX_AI_IMAGE_REFERENCES);
  }

  if (data.referenceStorageId) {
    return [
      {
        sourceNodeId: "legacy-reference",
        sourceType: "image",
        label: "Ref 1",
        storageId: data.referenceStorageId,
      },
    ];
  }

  if (data.referenceImageUrl) {
    return [
      {
        sourceNodeId: "legacy-reference",
        sourceType: "image",
        label: "Ref 1",
        imageUrl: data.referenceImageUrl,
      },
    ];
  }

  return [];
}

function resolveStoragePreviewUrl(storageId: string | undefined): string | undefined {
  if (!storageId) return undefined;

  const convexBaseUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexBaseUrl) return undefined;

  try {
    return new URL(`/api/storage/${storageId}`, convexBaseUrl).toString();
  } catch {
    return undefined;
  }
}

function readPreviewString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function buildPreviewUrlCandidates(data: AiImageNodeData): string[] {
  const candidates = [
    readPreviewString(data.url),
    readPreviewString(data.previewUrl),
    readPreviewString(data.lastUploadUrl),
    readPreviewString(data.imageUrl),
    resolveStoragePreviewUrl(data.storageId ?? data.lastUploadStorageId),
  ].filter((candidate): candidate is string => candidate !== undefined);

  return [...new Set(candidates)];
}

export default function AiImageNode({
  id,
  data,
  selected,
}: NodeProps<AiImageNode>) {
  const t = useTranslations('toasts');
  const nodeData = data as AiImageNodeData;
  const { getEdges, getNode } = useReactFlow();
  const { status: syncStatus } = useCanvasSync();
  const router = useRouter();

  const [isGenerating, setIsGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isOutputFullscreenOpen, setIsOutputFullscreenOpen] = useState(false);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState<Set<string>>(
    () => new Set(),
  );

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
  const previewUrlCandidates = useMemo(
    () =>
      buildPreviewUrlCandidates({
        imageUrl: nodeData.imageUrl,
        lastUploadStorageId: nodeData.lastUploadStorageId,
        lastUploadUrl: nodeData.lastUploadUrl,
        previewUrl: nodeData.previewUrl,
        storageId: nodeData.storageId,
        url: nodeData.url,
      }),
    [
      nodeData.imageUrl,
      nodeData.lastUploadStorageId,
      nodeData.lastUploadUrl,
      nodeData.previewUrl,
      nodeData.storageId,
      nodeData.url,
    ],
  );
  const previewUrlCandidateKey = previewUrlCandidates.join("\n");
  useEffect(() => {
    setFailedPreviewUrls((current) => {
      if (current.size === 0) return current;
      const currentCandidates = new Set(previewUrlCandidates);
      const next = new Set(
        [...current].filter((url) => currentCandidates.has(url)),
      );
      return next.size === current.size ? current : next;
    });
  }, [previewUrlCandidateKey, previewUrlCandidates]);
  const previewUrl =
    previewUrlCandidates.find((candidate) => !failedPreviewUrls.has(candidate)) ??
    undefined;
  const hasResolvableStoragePreview = Boolean(
    nodeData.storageId ?? nodeData.lastUploadStorageId,
  );
  const isResolvingGeneratedImage =
    status === "done" && hasResolvableStoragePreview && !previewUrl;
  const markPreviewUrlFailed = useCallback((url: string) => {
    setFailedPreviewUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (isLoading) return;
    if (syncStatus.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstützt",
        "KI-Generierung benötigt eine aktive Verbindung.",
      );
      return;
    }
    setLocalError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) throw new Error("Missing canvasId");

      const prompt = nodeData.prompt;
      if (!prompt) throw new Error("No prompt — Generierung vom Prompt-Knoten aus starten");

      const edges = getEdges();
      const incomingEdges = edges.filter((e) => e.target === id);
      const sourceNodes: RegenerateSourceNode[] = [];

      for (const edge of incomingEdges) {
        const src = getNode(edge.source) as RegenerateSourceNode | undefined;
        if (src?.type && isAiImageReferenceSourceType(src.type)) {
          sourceNodes.push(src);
        }

        if (src?.type === "prompt") {
          const promptIncomingEdges = edges.filter((candidate) => candidate.target === src.id);
          for (const promptEdge of promptIncomingEdges) {
            const promptSource = getNode(promptEdge.source) as RegenerateSourceNode | undefined;
            if (promptSource?.type && isAiImageReferenceSourceType(promptSource.type)) {
              sourceNodes.push(promptSource);
            }
          }
        }
      }

      const referenceImages = sourceNodes
        .sort(compareRegenerateSourceNodes)
        .slice(0, MAX_AI_IMAGE_REFERENCES)
        .map((sourceNode, index) =>
          getImageReferenceFromNode(sourceNode, `Ref ${index + 1}`),
        )
        .filter((reference): reference is AiImageReferenceInput => reference !== null);
      const resolvedReferenceImages =
        referenceImages.length > 0 ? referenceImages : buildLegacyReferenceImage(nodeData);

      const modelId = nodeData.model ?? DEFAULT_MODEL_ID;

      await toast.promise(
        generateImage({
          canvasId,
          nodeId: id as Id<"nodes">,
          prompt,
          referenceImages: resolvedReferenceImages,
          model: modelId,
          aspectRatio: nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO,
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
      setLocalError(err instanceof Error ? err.message : t('ai.generationFailed'));
    } finally {
      setIsGenerating(false);
    }
  }, [isLoading, syncStatus.isOffline, nodeData, id, getEdges, getNode, generateImage, t]);

  const modelName =
    getModel(nodeData.model ?? DEFAULT_MODEL_ID)?.name ?? "AI";

  const renderErrorIcon = (type: ErrorType) => {
    switch (type) {
      case "insufficientCredits":
        return <Coins className="h-8 w-8 text-amber-500" />;
      case "rateLimited":
      case "timeout":
        return <Clock3 className="h-8 w-8 text-amber-500" />;
      case "contentPolicy":
        return <ShieldAlert className="h-8 w-8 text-destructive" />;
      case "networkError":
        return <WifiOff className="h-8 w-8 text-destructive" />;
      default:
        return <AlertCircle className="h-8 w-8 text-destructive" />;
    }
  };
  const mediaBacklight =
    previewUrl && !isLoading ? (
      <MediaBacklight>
        {/* eslint-disable-next-line @next/next/no-img-element -- Backlight halo mirrors the generated image preview */}
        <img
          src={previewUrl}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
          draggable={false}
          onError={() => markPreviewUrlFailed(previewUrl)}
        />
      </MediaBacklight>
    ) : undefined;

  return (
    <BaseNodeWrapper
      nodeType="ai-image"
      selected={selected}
      toolbarActions={[
        {
          id: "fullscreen-output",
          label: "Fullscreen",
          icon: <Maximize2 size={14} />,
          onClick: () => setIsOutputFullscreenOpen(true),
          disabled: !previewUrl,
        },
      ]}
      className="flex h-full w-full min-h-0 min-w-0 flex-col"
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      backlight={mediaBacklight}
      dataOnboarding="canvas-output-node"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="ai-image"
        type="target"
        position={Position.Left}
        id="prompt-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <ImageIcon className="h-3.5 w-3.5" />
          Bildausgabe
        </div>
      </div>

      <div className="group relative min-h-0 flex-1 overflow-hidden bg-muted">
        {status === "idle" && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-30" />
            <p className="px-6 text-center text-xs opacity-60">
              Verbinde einen Prompt-Knoten und starte die Generierung dort.
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

        {isResolvingGeneratedImage && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
            <div className="absolute inset-0 overflow-hidden">
              <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <Loader2 className="relative z-10 h-8 w-8 animate-spin text-violet-500" />
            <p className="relative z-10 px-4 text-center text-xs text-muted-foreground">
              Bildvorschau wird geladen…
            </p>
            <p className="relative z-10 text-[10px] text-muted-foreground/60">
              {modelName}
            </p>
          </div>
        )}

        {status === "error" && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
            {renderErrorIcon(classifiedError.type)}
            <p className="px-4 text-center text-xs font-medium text-destructive">
              {classifiedError.rawMessage}
            </p>
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

        {previewUrl && !isLoading && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={nodeData.prompt ?? "AI generated image"}
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
              onError={() => markPreviewUrlFailed(previewUrl)}
            />
          </>
        )}

        {status === "done" && previewUrl && !isLoading && (
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

      <CanvasHandle
        nodeId={id}
        nodeType="ai-image"
        type="source"
        position={Position.Right}
        id="image-out"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <Dialog
        open={isOutputFullscreenOpen}
        onOpenChange={setIsOutputFullscreenOpen}
      >
        <DialogContent
          className="inset-0 left-0 top-0 h-screen w-screen max-w-none -translate-x-0 -translate-y-0 place-items-center gap-0 rounded-none border-none bg-transparent p-0 ring-0 shadow-none sm:max-w-none"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">KI-Bildausgabe</DialogTitle>
          <button
            type="button"
            onClick={() => setIsOutputFullscreenOpen(false)}
            aria-label="Close image preview"
            className="absolute right-6 top-6 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white/90 transition-colors hover:bg-black/30"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex h-full w-full items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={nodeData.prompt ?? "AI generated image"}
                className="h-auto max-h-[80vh] w-auto max-w-[80vw] rounded-xl object-contain shadow-2xl"
                draggable={false}
                onError={() => markPreviewUrlFailed(previewUrl)}
              />
            ) : (
              <div className="rounded-lg bg-popover/95 px-4 py-3 text-sm text-muted-foreground shadow-lg">
                Keine Bildausgabe verfügbar
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </BaseNodeWrapper>
  );
}
