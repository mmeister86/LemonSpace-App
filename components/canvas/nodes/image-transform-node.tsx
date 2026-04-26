"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Position, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useTranslations } from "next-intl";
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
  type StyleTransferEngine,
  type StyleTransferFlavor,
  type StyleTransferPortraitBeautifier,
  type StyleTransferPortraitStyle,
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

const STYLE_TRANSFER_FLAVORS: StyleTransferFlavor[] = [
  "faithful",
  "gen_z",
  "psychedelia",
  "detaily",
  "clear",
  "donotstyle",
  "donotstyle_sharp",
];
const STYLE_TRANSFER_ENGINES: StyleTransferEngine[] = [
  "balanced",
  "definio",
  "illusio",
  "3d_cartoon",
  "colorful_anime",
  "caricature",
  "real",
  "super_real",
  "softy",
];
const STYLE_TRANSFER_PORTRAIT_STYLES: StyleTransferPortraitStyle[] = [
  "standard",
  "pop",
  "super_pop",
];
const STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS: StyleTransferPortraitBeautifier[] = [
  "none",
  "beautify_face",
  "beautify_face_max",
];

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
        styleStrength: 100,
        structureStrength: 50,
        flavor: "faithful",
        engine: "balanced",
        fixedGeneration: false,
        isPortrait: false,
        portraitStyle: "standard",
        portraitBeautifier: "none",
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
      styleStrength:
        typeof parameters.styleStrength === "number" ? parameters.styleStrength : 100,
      structureStrength:
        typeof parameters.structureStrength === "number"
          ? parameters.structureStrength
          : 50,
      flavor: STYLE_TRANSFER_FLAVORS.includes(parameters.flavor as StyleTransferFlavor)
        ? (parameters.flavor as StyleTransferFlavor)
        : "faithful",
      engine: STYLE_TRANSFER_ENGINES.includes(parameters.engine as StyleTransferEngine)
        ? (parameters.engine as StyleTransferEngine)
        : "balanced",
      fixedGeneration:
        typeof parameters.fixedGeneration === "boolean"
          ? parameters.fixedGeneration
          : false,
      isPortrait:
        typeof parameters.isPortrait === "boolean" ? parameters.isPortrait : false,
      portraitStyle: STYLE_TRANSFER_PORTRAIT_STYLES.includes(
        parameters.portraitStyle as StyleTransferPortraitStyle,
      )
        ? (parameters.portraitStyle as StyleTransferPortraitStyle)
        : "standard",
      portraitBeautifier: STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS.includes(
        parameters.portraitBeautifier as StyleTransferPortraitBeautifier,
      )
        ? (parameters.portraitBeautifier as StyleTransferPortraitBeautifier)
        : "none",
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
  targetHandle?: string;
  edges: Array<{ source: string; target: string; targetHandle?: string | null }>;
  nodes: Array<{ id: string; type?: string; data?: unknown }>;
}): { url: string; width?: number; height?: number } | null {
  const incoming = args.edges.find((edge) => {
    if (edge.target !== args.nodeId) return false;
    if (!args.targetHandle) return true;
    const handle =
      edge.targetHandle === undefined || edge.targetHandle === null || edge.targetHandle === ""
        ? "image"
        : edge.targetHandle;
    return handle === args.targetHandle;
  });
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

export function hasStyleTransferReferenceInput(args: {
  nodeId: string;
  edges: Array<{ target: string; targetHandle?: string | null } & Record<string, unknown>>;
}): boolean {
  return args.edges.some((edge) => {
    if (edge.target !== args.nodeId) return false;
    return edge.targetHandle === "reference";
  });
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
  const t = useTranslations("imageTransformNode");
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
    () =>
      getSourcePreviewMeta({
        nodeId: id,
        targetHandle: operationType === "style-transfer" ? "image" : undefined,
        edges,
        nodes,
      }),
    [edges, id, nodes, operationType],
  );
  const referencePreview = useMemo(
    () =>
      operationType === "style-transfer"
        ? getSourcePreviewMeta({
            nodeId: id,
            targetHandle: "reference",
            edges,
            nodes,
          })
        : null,
    [edges, id, nodes, operationType],
  );
  const sourceAspectRatio =
    sourcePreview?.width && sourcePreview.height
      ? `${sourcePreview.width} / ${sourcePreview.height}`
      : undefined;
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
      toast.warning(t("offlineTitle"), t("offlineDescription"));
      return;
    }
    if (!nodeData.canvasId) {
      setLocalError(t("errors.missingCanvas"));
      return;
    }
    if (
      operation.type === "style-transfer" &&
      !hasStyleTransferReferenceInput({ nodeId: id, edges })
    ) {
      setLocalError(t("errors.missingReference"));
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
          loading: t("toasts.loading"),
          success: t("toasts.success"),
          error: t("toasts.error"),
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
    edges,
    status.isOffline,
    t,
  ]);

  return (
    <BaseNodeWrapper
      nodeType={operationType}
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[280px] border-teal-500/30"
    >
      {operationType === "style-transfer" ? (
        <>
          <CanvasHandle
            nodeId={id}
            nodeType={operationType}
            type="target"
            position={Position.Left}
            id="image"
            style={{ top: "34%" }}
            className="!h-3 !w-3 !border-2 !border-background"
          />
          <CanvasHandle
            nodeId={id}
            nodeType={operationType}
            type="target"
            position={Position.Left}
            id="reference"
            style={{ top: "56%" }}
            className="!h-3 !w-3 !border-2 !border-background"
          />
        </>
      ) : (
        <CanvasHandle
          nodeId={id}
          nodeType={operationType}
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
        />
      )}

      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">
            <Icon className="h-3.5 w-3.5" />
            {t(`labels.${operationType}`)}
          </div>
          <div className="text-[10px] text-muted-foreground">{creditCost} Cr</div>
        </div>

        {operation.type === "style-transfer" ? (
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "image" as const, preview: sourcePreview },
              { key: "reference" as const, preview: referencePreview },
            ].map(({ key, preview }) => (
              <div key={key} className="space-y-1">
                <div className="text-[10px] font-medium uppercase text-muted-foreground">
                  {t(`inputs.${key}`)}
                </div>
                <div className="relative h-24 overflow-hidden rounded-md border border-border bg-muted/40">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt=""
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                      {t(`emptyInputs.${key}`)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
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
                {t("emptyInputs.image")}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          {t(`descriptions.${operationType}`)}
        </p>

        {operation.type === "upscale" ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              {t("controls.scale")}
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
              {t("controls.format")}
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
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                <span>{t("controls.styleStrength")}</span>
                <span className="text-[10px] text-muted-foreground">
                  {operation.styleStrength}
                </span>
              </span>
              <input
                className="nodrag nowheel"
                type="range"
                min={0}
                max={100}
                value={operation.styleStrength}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    styleStrength: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                <span>{t("controls.structureStrength")}</span>
                <span className="text-[10px] text-muted-foreground">
                  {operation.structureStrength}
                </span>
              </span>
              <input
                className="nodrag nowheel"
                type="range"
                min={0}
                max={100}
                value={operation.structureStrength}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    structureStrength: Number(event.target.value),
                  })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                {t("controls.flavor")}
                <select
                  className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                  value={operation.flavor}
                  onChange={(event) =>
                    saveOperation({
                      ...operation,
                      flavor: event.target.value as StyleTransferFlavor,
                    })
                  }
                >
                  {STYLE_TRANSFER_FLAVORS.map((flavor) => (
                    <option key={flavor} value={flavor}>
                      {t(`flavors.${flavor}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {t("controls.engine")}
                <select
                  className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                  value={operation.engine}
                  onChange={(event) =>
                    saveOperation({
                      ...operation,
                      engine: event.target.value as StyleTransferEngine,
                    })
                  }
                >
                  {STYLE_TRANSFER_ENGINES.map((engine) => (
                    <option key={engine} value={engine}>
                      {t(`engines.${engine}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
              <span>{t("controls.fixedGeneration")}</span>
              <input
                className="nodrag"
                type="checkbox"
                checked={operation.fixedGeneration}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    fixedGeneration: event.target.checked,
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
              <span>{t("controls.isPortrait")}</span>
              <input
                className="nodrag"
                type="checkbox"
                checked={operation.isPortrait}
                onChange={(event) =>
                  saveOperation({
                    ...operation,
                    isPortrait: event.target.checked,
                  })
                }
              />
            </label>
            {operation.isPortrait ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  {t("controls.portraitStyle")}
                  <select
                    className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                    value={operation.portraitStyle}
                    onChange={(event) =>
                      saveOperation({
                        ...operation,
                        portraitStyle: event.target.value as StyleTransferPortraitStyle,
                      })
                    }
                  >
                    {STYLE_TRANSFER_PORTRAIT_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {t(`portraitStyles.${style}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  {t("controls.portraitBeautifier")}
                  <select
                    className="nodrag nowheel h-8 rounded-md border bg-background px-2"
                    value={operation.portraitBeautifier}
                    onChange={(event) =>
                      saveOperation({
                        ...operation,
                        portraitBeautifier:
                          event.target.value as StyleTransferPortraitBeautifier,
                      })
                    }
                  >
                    {STYLE_TRANSFER_PORTRAIT_BEAUTIFIERS.map((beautifier) => (
                      <option key={beautifier} value={beautifier}>
                        {t(`portraitBeautifiers.${beautifier}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
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
                {t(`faceModes.${mode}`)}
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
          {nodeData._status === "error" ? t("retryButton") : t("runButton")}
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
