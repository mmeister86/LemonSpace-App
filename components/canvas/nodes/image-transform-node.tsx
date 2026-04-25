"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Position, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { ImageOff, Loader2, Sparkles, Wand2 } from "lucide-react";

import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import CanvasHandle from "@/components/canvas/canvas-handle";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { toast } from "@/lib/toast";
import { computeMediaNodeSize } from "@/lib/canvas-utils";
import {
  getImageTransformCreditCost,
  type FaceRestoreMode,
  type ImageTransformOperation,
  type ImageTransformType,
  type UpscaleFlavor,
  type UpscaleOutputFormat,
  type UpscaleScale,
} from "@/lib/image-transform-models";

type TransformNodeData = {
  canvasId?: string;
  operation?: ImageTransformType;
  outputNodeId?: string;
  taskId?: string;
  lastError?: string;
  parameters?: Partial<ImageTransformOperation> & Record<string, unknown>;
  _status?: string;
  _statusMessage?: string;
};

export type ImageTransformNodeType = Node<TransformNodeData, ImageTransformType>;

type ImageTransformNodeProps = NodeProps<ImageTransformNodeType> & {
  operationType: ImageTransformType;
};

const LABELS: Record<ImageTransformType, string> = {
  "bg-remove": "BG entfernen",
  upscale: "Upscale",
  "style-transfer": "Style Transfer",
  "face-restore": "Gesicht",
};

const DESCRIPTIONS: Record<ImageTransformType, string> = {
  "bg-remove": "Entfernt den Hintergrund mit Freepik.",
  upscale: "Vergroessert das Bild per Freepik Precision V2.",
  "style-transfer": "Uebertraegt Prompt oder Referenzstil.",
  "face-restore": "Verbessert Portraits mit Skin Enhancer.",
};

function defaultOperation(type: ImageTransformType): ImageTransformOperation {
  switch (type) {
    case "bg-remove":
      return { type };
    case "upscale":
      return {
        type,
        scale: 2,
        outputFormat: "png",
        flavor: "photo",
        sharpen: 7,
        grain: 7,
        ultraDetail: 30,
      };
    case "style-transfer":
      return {
        type,
        prompt: "",
        styleIntensity: 0.7,
        preserveStructure: true,
      };
    case "face-restore":
      return { type, mode: "faithful" };
  }
}

function normalizeOperation(
  type: ImageTransformType,
  parameters: TransformNodeData["parameters"],
): ImageTransformOperation {
  const fallback = defaultOperation(type);
  if (!parameters || parameters.type !== type) {
    return fallback;
  }

  if (type === "upscale") {
    return {
      type,
      scale: [2, 4, 8, 16].includes(parameters.scale as number)
        ? (parameters.scale as UpscaleScale)
        : 2,
      outputFormat: parameters.outputFormat === "jpeg" ? "jpeg" : "png",
      flavor:
        parameters.flavor === "sublime" ||
        parameters.flavor === "photo_denoiser" ||
        parameters.flavor === "photo"
          ? (parameters.flavor as UpscaleFlavor)
          : "photo",
      sharpen: typeof parameters.sharpen === "number" ? parameters.sharpen : 7,
      grain: typeof parameters.grain === "number" ? parameters.grain : 7,
      ultraDetail:
        typeof parameters.ultraDetail === "number" ? parameters.ultraDetail : 30,
    };
  }

  if (type === "style-transfer") {
    return {
      type,
      prompt: typeof parameters.prompt === "string" ? parameters.prompt : "",
      styleReferenceNodeId:
        typeof parameters.styleReferenceNodeId === "string"
          ? (parameters.styleReferenceNodeId as Id<"nodes">)
          : undefined,
      presetId:
        typeof parameters.presetId === "string" ? parameters.presetId : undefined,
      styleIntensity:
        typeof parameters.styleIntensity === "number" ? parameters.styleIntensity : 0.7,
      preserveStructure:
        typeof parameters.preserveStructure === "boolean"
          ? parameters.preserveStructure
          : true,
    };
  }

  if (type === "face-restore") {
    const mode =
      parameters.mode === "creative" || parameters.mode === "flexible" || parameters.mode === "faithful"
        ? (parameters.mode as FaceRestoreMode)
        : "faithful";
    return {
      type,
      mode,
      preset: typeof parameters.preset === "string" ? parameters.preset : undefined,
    };
  }

  return fallback;
}

export function getSourcePreviewMeta(args: {
  nodeId: string;
  edges: Array<{ source: string; target: string }>;
  nodes: Array<{ id: string; type?: string; data?: unknown }>;
}): { url: string; width?: number; height?: number } | null {
  const incoming = args.edges.find((edge) => edge.target === args.nodeId);
  if (!incoming) return null;
  const source = args.nodes.find((node) => node.id === incoming.source);
  if (!source || !source.data || typeof source.data !== "object") return null;
  const data = source.data as {
    url?: unknown;
    previewUrl?: unknown;
    width?: unknown;
    height?: unknown;
    previewWidth?: unknown;
    previewHeight?: unknown;
  };
  const url = typeof data.url === "string"
    ? data.url
    : typeof data.previewUrl === "string"
      ? data.previewUrl
      : null;
  if (!url) return null;
  const width =
    typeof data.width === "number"
      ? data.width
      : typeof data.previewWidth === "number"
        ? data.previewWidth
        : undefined;
  const height =
    typeof data.height === "number"
      ? data.height
      : typeof data.previewHeight === "number"
        ? data.previewHeight
        : undefined;
  return {
    url,
    ...(width && width > 0 ? { width } : {}),
    ...(height && height > 0 ? { height } : {}),
  };
}

function iconFor(type: ImageTransformType) {
  if (type === "bg-remove") return ImageOff;
  if (type === "face-restore") return Sparkles;
  return Wand2;
}

export default function ImageTransformNode({
  id,
  data,
  selected,
  operationType,
}: ImageTransformNodeProps) {
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const { createNodeConnectedFromSource } = useCanvasPlacement();
  const { getNode } = useReactFlow();
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);
  const generateTransform = useAction(
    (api as unknown as {
      image_transforms: {
        generateTransform: FunctionReference<
          "action",
          "public",
          {
            canvasId: Id<"canvases">;
            transformNodeId: Id<"nodes">;
            outputNodeId: Id<"nodes">;
            operation: ImageTransformOperation;
          },
          { queued: true; outputNodeId: Id<"nodes"> }
        >;
      };
    }).image_transforms.generateTransform,
  );

  const nodeData = data as TransformNodeData;
  const [operation, setOperation] = useState<ImageTransformOperation>(() =>
    normalizeOperation(operationType, nodeData.parameters),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const sourcePreview = useMemo(
    () => getSourcePreviewMeta({ nodeId: id, edges, nodes }),
    [edges, id, nodes],
  );
  const sourceAspectRatio =
    sourcePreview?.width && sourcePreview.height
      ? `${sourcePreview.width} / ${sourcePreview.height}`
      : undefined;
  const selectableImageNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.id !== id &&
          (node.type === "image" || node.type === "asset" || node.type === "ai-image"),
      ),
    [id, nodes],
  );

  const Icon = iconFor(operationType);
  const creditCost = getImageTransformCreditCost(operation);
  const isExecuting = isRunning || nodeData._status === "executing";
  const visibleError =
    nodeData._status === "error"
      ? localError ?? nodeData.lastError ?? nodeData._statusMessage
      : localError;

  useEffect(() => {
    if (nodeData._status === "executing" || nodeData._status === "done") {
      setLocalError(null);
    }
  }, [nodeData._status]);

  const saveOperation = useCallback(
    (next: ImageTransformOperation) => {
      setOperation(next);
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...nodeData,
          operation: operationType,
          parameters: next,
        },
      });
    },
    [id, nodeData, operationType, queueNodeDataUpdate],
  );

  const ensureOutputNode = useCallback(async () => {
    const existingOutputId = nodeData.outputNodeId;
    if (existingOutputId && getNode(existingOutputId)) {
      return existingOutputId as Id<"nodes">;
    }

    const currentNode = getNode(id);
    const offsetX = (currentNode?.measured?.width ?? 300) + 32;
    const outputSize =
      sourcePreview?.width && sourcePreview.height
        ? computeMediaNodeSize("image", {
            intrinsicWidth:
              operation.type === "upscale"
                ? sourcePreview.width * operation.scale
                : sourcePreview.width,
            intrinsicHeight:
              operation.type === "upscale"
                ? sourcePreview.height * operation.scale
                : sourcePreview.height,
          })
        : undefined;
    const outputNodeId = await createNodeConnectedFromSource({
      type: "image",
      position: {
        x: (currentNode?.position?.x ?? 0) + offsetX,
        y: currentNode?.position?.y ?? 0,
      },
      data: {
        source: "freepik-transform",
        transform: {
          operation: operationType,
          transformNodeId: id,
          provider: "freepik",
        },
      },
      ...(outputSize ? { width: outputSize.width, height: outputSize.height } : {}),
      clientRequestId: crypto.randomUUID(),
      sourceNodeId: id as Id<"nodes">,
    });
    return outputNodeId;
  }, [
    createNodeConnectedFromSource,
    getNode,
    id,
    nodeData.outputNodeId,
    operation,
    operationType,
    sourcePreview,
  ]);

  const runTransform = useCallback(async () => {
    if (isExecuting) return;
    if (status.isOffline) {
      toast.warning("Offline aktuell nicht unterstuetzt", "Freepik benoetigt eine aktive Verbindung.");
      return;
    }
    if (!nodeData.canvasId) {
      setLocalError("Canvas-ID fehlt in der Node");
      return;
    }

    setIsRunning(true);
    setLocalError(null);
    try {
      const outputNodeId = await ensureOutputNode();
      await toast.promise(
        generateTransform({
          canvasId: nodeData.canvasId as Id<"canvases">,
          transformNodeId: id as Id<"nodes">,
          outputNodeId,
          operation,
        }),
        {
          loading: "Freepik-Job wird gestartet",
          success: "Freepik-Job wurde gestartet",
          error: "Freepik-Job konnte nicht gestartet werden",
        },
      );
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }, [
    ensureOutputNode,
    generateTransform,
    id,
    isExecuting,
    nodeData.canvasId,
    operation,
    status.isOffline,
  ]);

  return (
    <BaseNodeWrapper
      nodeType={operationType}
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[280px] border-teal-500/30"
    >
      <CanvasHandle
        nodeId={id}
        nodeType={operationType}
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
      />

      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">
            <Icon className="h-3.5 w-3.5" />
            {LABELS[operationType]}
          </div>
          <div className="text-[10px] text-muted-foreground">{creditCost} Cr</div>
        </div>

        <div
          className={`relative w-full overflow-hidden rounded-md border border-border bg-muted/40 ${
            sourcePreview ? "" : "h-28"
          }`}
          style={sourceAspectRatio ? { aspectRatio: sourceAspectRatio } : undefined}
        >
          {sourcePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sourcePreview.url}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Bild verbinden
            </div>
          )}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          {DESCRIPTIONS[operationType]}
        </p>

        {operation.type === "upscale" ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Scale
              <select
                className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                value={operation.scale}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    scale: Number(event.target.value) as UpscaleScale,
                  })
                }
              >
                {[2, 4, 8, 16].map((scale) => (
                  <option key={scale} value={scale}>
                    {scale}x
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Format
              <select
                className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                value={operation.outputFormat}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    outputFormat: event.target.value as UpscaleOutputFormat,
                  })
                }
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
          </div>
        ) : null}

        {operation.type === "style-transfer" ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="nodrag nowheel min-h-16 resize-none rounded-md border bg-background px-2 py-1.5 text-xs"
              value={operation.prompt ?? ""}
              placeholder="Prompt-Stil"
              onChange={(event) =>
                saveOperation({ ...operation, prompt: event.target.value })
              }
            />
            <select
              className="nodrag nowheel h-8 rounded-md border bg-background px-2 text-xs"
              value={operation.styleReferenceNodeId ?? ""}
              onChange={(event) =>
                saveOperation({
                  ...operation,
                  styleReferenceNodeId: event.target.value
                    ? (event.target.value as Id<"nodes">)
                    : undefined,
                })
              }
            >
              <option value="">Keine Referenz</option>
              {selectableImageNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.type} {node.id.slice(-4)}
                </option>
              ))}
            </select>
            <select
              disabled
              className="nodrag nowheel h-8 rounded-md border bg-muted px-2 text-xs text-muted-foreground"
              value=""
              onChange={() => undefined}
            >
              <option value="">Presets folgen spaeter</option>
            </select>
          </div>
        ) : null}

        {operation.type === "face-restore" ? (
          <div className="grid grid-cols-3 gap-1">
            {(["faithful", "creative", "flexible"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`nodrag h-8 rounded-md border px-1 text-[11px] ${
                  operation.mode === mode ? "border-teal-500 bg-teal-500/10" : "bg-background"
                }`}
                onClick={() => saveOperation({ ...operation, mode })}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : null}

        {visibleError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
            {visibleError}
          </div>
        )}

        <button
          type="button"
          className="nodrag mt-auto flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isExecuting}
          onClick={runTransform}
        >
          {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {nodeData._status === "error" ? "Retry" : "Ausfuehren"}
        </button>
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType={operationType}
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
      />
    </BaseNodeWrapper>
  );
}
