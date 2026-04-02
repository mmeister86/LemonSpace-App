"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { AlertCircle, ArrowDown, CheckCircle2, CloudUpload, Loader2 } from "lucide-react";
import { useConvex, useMutation } from "convex/react";

import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import { SliderRow } from "@/components/canvas/nodes/adjustment-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { api } from "@/convex/_generated/api";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import { resolveMediaAspectRatio } from "@/lib/canvas-utils";
import { parseAspectRatioString } from "@/lib/image-formats";
import {
  collectPipeline,
  getSourceImage,
  hashPipeline,
  type PipelineStep,
} from "@/lib/image-pipeline/contracts";
import { bridge } from "@/lib/image-pipeline/bridge";
import type { Id } from "@/convex/_generated/dataModel";

type RenderResolutionOption = "original" | "2x" | "custom";
type RenderFormatOption = "png" | "jpeg" | "webp";
type SourceNodeDescriptor = {
  id: string;
  type: string;
  data?: unknown;
};

type RenderNodeData = {
  outputResolution?: RenderResolutionOption;
  customWidth?: number;
  customHeight?: number;
  format?: RenderFormatOption;
  jpegQuality?: number;
  lastRenderedAt?: number;
  lastRenderedHash?: string;
  lastRenderWidth?: number;
  lastRenderHeight?: number;
  lastRenderFormat?: RenderFormatOption;
  lastRenderMimeType?: string;
  lastRenderSizeBytes?: number;
  lastRenderQuality?: number | null;
  lastRenderSourceWidth?: number;
  lastRenderSourceHeight?: number;
  lastRenderWasSizeClamped?: boolean;
  lastRenderError?: string;
  lastRenderErrorHash?: string;
  storageId?: string;
  url?: string;
  lastUploadedAt?: number;
  lastUploadedHash?: string;
  lastUploadStorageId?: string;
  lastUploadUrl?: string;
  lastUploadMimeType?: string;
  lastUploadSizeBytes?: number;
  lastUploadFilename?: string;
  lastUploadError?: string;
  lastUploadErrorHash?: string;
  _status?: string;
  _statusMessage?: string;
};

export type RenderNodeType = Node<RenderNodeData, "render">;

type RenderState = "idle" | "rendering" | "done" | "error";

type PersistedRenderData = {
  outputResolution: RenderResolutionOption;
  customWidth?: number;
  customHeight?: number;
  format: RenderFormatOption;
  jpegQuality: number;
  lastRenderedAt?: number;
  lastRenderedHash?: string;
  lastRenderWidth?: number;
  lastRenderHeight?: number;
  lastRenderFormat?: RenderFormatOption;
  lastRenderMimeType?: string;
  lastRenderSizeBytes?: number;
  lastRenderQuality?: number | null;
  lastRenderSourceWidth?: number;
  lastRenderSourceHeight?: number;
  lastRenderWasSizeClamped?: boolean;
  lastRenderError?: string;
  lastRenderErrorHash?: string;
  storageId?: string;
  url?: string;
  lastUploadedAt?: number;
  lastUploadedHash?: string;
  lastUploadStorageId?: string;
  lastUploadUrl?: string;
  lastUploadMimeType?: string;
  lastUploadSizeBytes?: number;
  lastUploadFilename?: string;
  lastUploadError?: string;
  lastUploadErrorHash?: string;
};

const DEFAULT_OUTPUT_RESOLUTION: RenderResolutionOption = "original";
const DEFAULT_FORMAT: RenderFormatOption = "png";
const DEFAULT_JPEG_QUALITY = 90;
const MIN_CUSTOM_DIMENSION = 1;
const MAX_CUSTOM_DIMENSION = 16_384;
const RENDER_MIN_WIDTH = 260;
const RENDER_MIN_HEIGHT = 300;
const ASPECT_RATIO_TOLERANCE = 0.015;
const SIZE_TOLERANCE_PX = 1;

const RENDER_PIPELINE_TYPES = new Set(["curves", "color-adjust", "light-adjust", "detail-adjust"]);

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function resolveSourceAspectRatio(sourceNode: SourceNodeDescriptor | null): number | null {
  if (!sourceNode) {
    return null;
  }

  const sourceData = (sourceNode.data ?? {}) as Record<string, unknown>;

  if (sourceNode.type === "image") {
    const sourceWidth = readPositiveNumber(sourceData.width);
    const sourceHeight = readPositiveNumber(sourceData.height);
    if (sourceWidth && sourceHeight) {
      return sourceWidth / sourceHeight;
    }
    return null;
  }

  if (sourceNode.type === "asset") {
    return resolveMediaAspectRatio(
      readPositiveNumber(sourceData.intrinsicWidth) ?? undefined,
      readPositiveNumber(sourceData.intrinsicHeight) ?? undefined,
      typeof sourceData.orientation === "string" ? sourceData.orientation : undefined,
    );
  }

  if (sourceNode.type === "ai-image") {
    const outputWidth = readPositiveNumber(sourceData.outputWidth);
    const outputHeight = readPositiveNumber(sourceData.outputHeight);
    if (outputWidth && outputHeight) {
      return outputWidth / outputHeight;
    }

    const aspectRatioLabel =
      typeof sourceData.aspectRatio === "string" ? sourceData.aspectRatio : null;
    if (!aspectRatioLabel) {
      return null;
    }

    try {
      const parsed = parseAspectRatioString(aspectRatioLabel);
      return parsed.w / parsed.h;
    } catch {
      return null;
    }
  }

  return null;
}

function toRatioConstrainedSize(args: {
  currentWidth: number;
  currentHeight: number;
  aspectRatio: number;
  minWidth: number;
  minHeight: number;
}): { width: number; height: number } {
  const { currentWidth, currentHeight, aspectRatio, minWidth, minHeight } = args;

  const fromWidth = () => {
    let width = Math.max(minWidth, currentWidth);
    let height = width / aspectRatio;
    if (height < minHeight) {
      height = minHeight;
      width = height * aspectRatio;
    }
    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  };

  const fromHeight = () => {
    let height = Math.max(minHeight, currentHeight);
    let width = height * aspectRatio;
    if (width < minWidth) {
      width = minWidth;
      height = width / aspectRatio;
    }
    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  };

  const widthCandidate = fromWidth();
  const heightCandidate = fromHeight();

  const widthDistance =
    Math.abs(widthCandidate.width - currentWidth) +
    Math.abs(widthCandidate.height - currentHeight);
  const heightDistance =
    Math.abs(heightCandidate.width - currentWidth) +
    Math.abs(heightCandidate.height - currentHeight);

  return widthDistance <= heightDistance ? widthCandidate : heightCandidate;
}

function resolveNodeImageUrl(node: Node): string | null {
  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const directUrl = typeof nodeData.url === "string" ? nodeData.url : null;
  if (directUrl && directUrl.length > 0) {
    return directUrl;
  }

  const previewUrl = typeof nodeData.previewUrl === "string" ? nodeData.previewUrl : null;
  if (previewUrl && previewUrl.length > 0) {
    return previewUrl;
  }

  return null;
}

function sanitizeDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_CUSTOM_DIMENSION || rounded > MAX_CUSTOM_DIMENSION) {
    return undefined;
  }
  return rounded;
}

function sanitizeRenderData(data: RenderNodeData): PersistedRenderData {
  const outputResolution: RenderResolutionOption =
    data.outputResolution === "2x" || data.outputResolution === "custom"
      ? data.outputResolution
      : DEFAULT_OUTPUT_RESOLUTION;

  const format: RenderFormatOption =
    data.format === "jpeg" || data.format === "webp" ? data.format : DEFAULT_FORMAT;

  const jpegQuality =
    typeof data.jpegQuality === "number" && Number.isFinite(data.jpegQuality)
      ? Math.max(1, Math.min(100, Math.round(data.jpegQuality)))
      : DEFAULT_JPEG_QUALITY;

  const next: PersistedRenderData = {
    outputResolution,
    format,
    jpegQuality,
  };

  if (outputResolution === "custom") {
    const width = sanitizeDimension(data.customWidth);
    const height = sanitizeDimension(data.customHeight);
    if (width !== undefined) next.customWidth = width;
    if (height !== undefined) next.customHeight = height;
  }

  if (typeof data.lastRenderedAt === "number" && Number.isFinite(data.lastRenderedAt)) {
    next.lastRenderedAt = data.lastRenderedAt;
  }
  if (typeof data.lastRenderedHash === "string" && data.lastRenderedHash.length > 0) {
    next.lastRenderedHash = data.lastRenderedHash;
  }
  if (typeof data.lastRenderWidth === "number" && Number.isFinite(data.lastRenderWidth)) {
    next.lastRenderWidth = Math.max(1, Math.round(data.lastRenderWidth));
  }
  if (typeof data.lastRenderHeight === "number" && Number.isFinite(data.lastRenderHeight)) {
    next.lastRenderHeight = Math.max(1, Math.round(data.lastRenderHeight));
  }
  if (data.lastRenderFormat === "png" || data.lastRenderFormat === "jpeg" || data.lastRenderFormat === "webp") {
    next.lastRenderFormat = data.lastRenderFormat;
  }
  if (typeof data.lastRenderMimeType === "string" && data.lastRenderMimeType.length > 0) {
    next.lastRenderMimeType = data.lastRenderMimeType;
  }
  if (typeof data.lastRenderSizeBytes === "number" && Number.isFinite(data.lastRenderSizeBytes)) {
    next.lastRenderSizeBytes = Math.max(0, Math.round(data.lastRenderSizeBytes));
  }
  if (
    data.lastRenderQuality === null ||
    (typeof data.lastRenderQuality === "number" && Number.isFinite(data.lastRenderQuality))
  ) {
    next.lastRenderQuality = data.lastRenderQuality;
  }
  if (
    typeof data.lastRenderSourceWidth === "number" &&
    Number.isFinite(data.lastRenderSourceWidth)
  ) {
    next.lastRenderSourceWidth = Math.max(1, Math.round(data.lastRenderSourceWidth));
  }
  if (
    typeof data.lastRenderSourceHeight === "number" &&
    Number.isFinite(data.lastRenderSourceHeight)
  ) {
    next.lastRenderSourceHeight = Math.max(1, Math.round(data.lastRenderSourceHeight));
  }
  if (typeof data.lastRenderWasSizeClamped === "boolean") {
    next.lastRenderWasSizeClamped = data.lastRenderWasSizeClamped;
  }
  if (typeof data.lastRenderError === "string" && data.lastRenderError.length > 0) {
    next.lastRenderError = data.lastRenderError;
  }
  if (typeof data.lastRenderErrorHash === "string" && data.lastRenderErrorHash.length > 0) {
    next.lastRenderErrorHash = data.lastRenderErrorHash;
  }
  if (typeof data.storageId === "string" && data.storageId.length > 0) {
    next.storageId = data.storageId;
  }
  if (typeof data.url === "string" && data.url.length > 0) {
    next.url = data.url;
  }
  if (typeof data.lastUploadedAt === "number" && Number.isFinite(data.lastUploadedAt)) {
    next.lastUploadedAt = data.lastUploadedAt;
  }
  if (typeof data.lastUploadedHash === "string" && data.lastUploadedHash.length > 0) {
    next.lastUploadedHash = data.lastUploadedHash;
  }
  if (typeof data.lastUploadStorageId === "string" && data.lastUploadStorageId.length > 0) {
    next.lastUploadStorageId = data.lastUploadStorageId;
  }
  if (typeof data.lastUploadUrl === "string" && data.lastUploadUrl.length > 0) {
    next.lastUploadUrl = data.lastUploadUrl;
  }
  if (typeof data.lastUploadMimeType === "string" && data.lastUploadMimeType.length > 0) {
    next.lastUploadMimeType = data.lastUploadMimeType;
  }
  if (typeof data.lastUploadSizeBytes === "number" && Number.isFinite(data.lastUploadSizeBytes)) {
    next.lastUploadSizeBytes = Math.max(0, Math.round(data.lastUploadSizeBytes));
  }
  if (typeof data.lastUploadFilename === "string" && data.lastUploadFilename.length > 0) {
    next.lastUploadFilename = data.lastUploadFilename;
  }
  if (typeof data.lastUploadError === "string" && data.lastUploadError.length > 0) {
    next.lastUploadError = data.lastUploadError;
  }
  if (typeof data.lastUploadErrorHash === "string" && data.lastUploadErrorHash.length > 0) {
    next.lastUploadErrorHash = data.lastUploadErrorHash;
  }

  return next;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function extensionForFormat(format: RenderFormatOption): string {
  return format === "jpeg" ? "jpg" : format;
}

function compactHistogram(values: readonly number[], points = 64): number[] {
  if (points <= 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: points }, () => 0);
  }

  const bucket = values.length / points;
  const compacted: number[] = [];
  for (let pointIndex = 0; pointIndex < points; pointIndex += 1) {
    let sum = 0;
    const start = Math.floor(pointIndex * bucket);
    const end = Math.min(values.length, Math.floor((pointIndex + 1) * bucket) || start + 1);
    for (let index = start; index < end; index += 1) {
      sum += values[index] ?? 0;
    }
    compacted.push(sum);
  }
  return compacted;
}

function histogramPolyline(values: readonly number[], maxValue: number, width: number, height: number): string {
  if (values.length === 0) {
    return "";
  }

  const divisor = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = (index / divisor) * width;
      const normalized = maxValue > 0 ? value / maxValue : 0;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

async function uploadBlobToConvex(args: {
  uploadUrl: string;
  blob: Blob;
  mimeType: string;
}): Promise<{ storageId: string }> {
  const response = await fetch(args.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": args.mimeType,
    },
    body: args.blob,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Upload failed: invalid response");
  }

  const storageId = (payload as { storageId?: unknown }).storageId;
  if (typeof storageId !== "string" || storageId.length === 0) {
    throw new Error("Upload failed: missing storageId");
  }

  return { storageId };
}

export default function RenderNode({ id, data, selected, width, height }: NodeProps<RenderNodeType>) {
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const { queueNodeDataUpdate, queueNodeResize, status } = useCanvasSync();
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);

  const [localData, setLocalData] = useState<PersistedRenderData>(() =>
    sanitizeRenderData(data),
  );
  const [isRendering, setIsRendering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const localDataRef = useRef(localData);
  const renderRunIdRef = useRef(0);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedAspectRatioRef = useRef<number | null>(null);

  useEffect(() => {
    localDataRef.current = localData;
  }, [localData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalData(sanitizeRenderData(data));
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [data]);

  const queueSave = useDebouncedCallback(() => {
    void queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
      data: localDataRef.current,
    });
  }, 120);

  const updateLocalData = (updater: (current: PersistedRenderData) => PersistedRenderData) => {
    setLocalData((current) => {
      const next = updater(current);
      localDataRef.current = next;
      queueSave();
      return next;
    });
  };

  const pipelineNodes = useMemo(
    () => nodes.map((node) => ({ id: node.id, type: node.type ?? "", data: node.data })),
    [nodes],
  );

  const pipelineEdges = useMemo(
    () => edges.map((edge) => ({ source: edge.source, target: edge.target })),
    [edges],
  );

  const sourceUrl = useMemo(
    () =>
      getSourceImage({
        nodeId: id,
        nodes: pipelineNodes,
        edges: pipelineEdges,
        isSourceNode: (node) =>
          node.type === "image" || node.type === "ai-image" || node.type === "asset",
        getSourceImageFromNode: (node) => {
          const sourceNode = nodes.find((candidate) => candidate.id === node.id);
          return sourceNode ? resolveNodeImageUrl(sourceNode) : null;
        },
      }),
    [id, nodes, pipelineEdges, pipelineNodes],
  );

  const sourceNode = useMemo<SourceNodeDescriptor | null>(
    () =>
      getSourceImage({
        nodeId: id,
        nodes: pipelineNodes,
        edges: pipelineEdges,
        isSourceNode: (node) =>
          node.type === "image" || node.type === "ai-image" || node.type === "asset",
        getSourceImageFromNode: (node) => node as SourceNodeDescriptor,
      }),
    [id, pipelineEdges, pipelineNodes],
  );

  const steps = useMemo(
    () =>
      collectPipeline({
        nodeId: id,
        nodes: pipelineNodes,
        edges: pipelineEdges,
        isPipelineNode: (node) => RENDER_PIPELINE_TYPES.has(node.type ?? ""),
      }) as PipelineStep[],
    [id, pipelineEdges, pipelineNodes],
  );

  const renderFingerprint = useMemo(
    () => ({
      resolution: localData.outputResolution,
      customWidth: localData.outputResolution === "custom" ? localData.customWidth : undefined,
      customHeight:
        localData.outputResolution === "custom" ? localData.customHeight : undefined,
      format: localData.format,
      jpegQuality: localData.format === "jpeg" ? localData.jpegQuality : undefined,
    }),
    [
      localData.customHeight,
      localData.customWidth,
      localData.format,
      localData.jpegQuality,
      localData.outputResolution,
    ],
  );

  const currentPipelineHash = useMemo(() => {
    if (!sourceUrl) return null;
    return hashPipeline({ sourceUrl, render: renderFingerprint }, steps);
  }, [renderFingerprint, sourceUrl, steps]);

  const isRenderCurrent =
    Boolean(currentPipelineHash) && localData.lastRenderedHash === currentPipelineHash;
  const currentError =
    currentPipelineHash && localData.lastRenderErrorHash === currentPipelineHash
      ? localData.lastRenderError
      : undefined;
  const currentUploadError =
    currentPipelineHash && localData.lastUploadErrorHash === currentPipelineHash
      ? localData.lastUploadError
      : undefined;
  const isUploadCurrent =
    Boolean(currentPipelineHash) && localData.lastUploadedHash === currentPipelineHash;

  const renderState: RenderState = isRendering
    ? "rendering"
    : currentError
      ? "error"
      : isRenderCurrent && typeof localData.lastRenderedAt === "number"
        ? "done"
        : "idle";

  const renderStateLabel: Record<RenderState, string> = {
    idle: "Idle",
    rendering: "Rendering",
    done: "Done",
    error: "Error",
  };

  const hasSource = typeof sourceUrl === "string" && sourceUrl.length > 0;
  const previewNodeWidth = Math.max(260, Math.round(width ?? 320));

  const {
    canvasRef,
    histogram,
    isRendering: isPreviewRendering,
    previewAspectRatio,
    error: previewError,
  } = usePipelinePreview({
    sourceUrl,
    steps,
    nodeWidth: previewNodeWidth,
    previewScale: 0.7,
    maxPreviewWidth: 960,
  });

  const targetAspectRatio = useMemo(() => {
    const sourceAspectRatio = resolveSourceAspectRatio(sourceNode);
    if (sourceAspectRatio && Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0) {
      return sourceAspectRatio;
    }

    if (
      typeof previewAspectRatio === "number" &&
      Number.isFinite(previewAspectRatio) &&
      previewAspectRatio > 0
    ) {
      return previewAspectRatio;
    }

    return null;
  }, [previewAspectRatio, sourceNode]);

  useEffect(() => {
    if (!hasSource || targetAspectRatio === null) {
      return;
    }

    const measuredWidth = typeof width === "number" ? width : 0;
    const measuredHeight = typeof height === "number" ? height : 0;
    if (measuredWidth <= 0 || measuredHeight <= 0) {
      return;
    }

    const currentAspectRatio = measuredWidth / measuredHeight;
    const aspectDelta = Math.abs(currentAspectRatio - targetAspectRatio);
    const lastAppliedAspectRatio = lastAppliedAspectRatioRef.current;
    const hasAspectRatioChanged =
      lastAppliedAspectRatio === null ||
      Math.abs(lastAppliedAspectRatio - targetAspectRatio) > ASPECT_RATIO_TOLERANCE;

    if (aspectDelta <= ASPECT_RATIO_TOLERANCE && !hasAspectRatioChanged) {
      return;
    }

    const targetSize = toRatioConstrainedSize({
      currentWidth: measuredWidth,
      currentHeight: measuredHeight,
      aspectRatio: targetAspectRatio,
      minWidth: RENDER_MIN_WIDTH,
      minHeight: RENDER_MIN_HEIGHT,
    });

    const widthDelta = Math.abs(targetSize.width - measuredWidth);
    const heightDelta = Math.abs(targetSize.height - measuredHeight);
    if (widthDelta <= SIZE_TOLERANCE_PX && heightDelta <= SIZE_TOLERANCE_PX) {
      lastAppliedAspectRatioRef.current = targetAspectRatio;
      return;
    }

    lastAppliedAspectRatioRef.current = targetAspectRatio;
    void queueNodeResize({
      nodeId: id as Id<"nodes">,
      width: targetSize.width,
      height: targetSize.height,
    });
  }, [hasSource, height, id, queueNodeResize, targetAspectRatio, width]);

  const histogramSeries = useMemo(() => {
    const red = compactHistogram(histogram.red, 64);
    const green = compactHistogram(histogram.green, 64);
    const blue = compactHistogram(histogram.blue, 64);
    const rgb = compactHistogram(histogram.rgb, 64);
    const max = Math.max(1, ...red, ...green, ...blue, ...rgb);
    return { red, green, blue, rgb, max };
  }, [histogram.blue, histogram.green, histogram.red, histogram.rgb]);

  const histogramPolylines = useMemo(() => {
    const width = 96;
    const height = 44;
    return {
      red: histogramPolyline(histogramSeries.red, histogramSeries.max, width, height),
      green: histogramPolyline(histogramSeries.green, histogramSeries.max, width, height),
      blue: histogramPolyline(histogramSeries.blue, histogramSeries.max, width, height),
      rgb: histogramPolyline(histogramSeries.rgb, histogramSeries.max, width, height),
    };
  }, [histogramSeries.blue, histogramSeries.green, histogramSeries.max, histogramSeries.red, histogramSeries.rgb]);

  const canRender =
    hasSource &&
    !isRendering &&
    !isUploading &&
    (localData.outputResolution !== "custom" ||
      (typeof localData.customWidth === "number" && typeof localData.customHeight === "number"));
  const canUpload = canRender && !status.isOffline;

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (
        target &&
        (menuButtonRef.current?.contains(target) || menuPanelRef.current?.contains(target))
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isMenuOpen]);

  const persistImmediately = async (next: PersistedRenderData) => {
    localDataRef.current = next;
    setLocalData(next);
    await queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
      data: next,
    });
  };

  const handleRender = async (mode: "download" | "upload") => {
    if (!sourceUrl || !currentPipelineHash) return;

    if (
      localData.outputResolution === "custom" &&
      (localData.customWidth === undefined || localData.customHeight === undefined)
    ) {
      const next = {
        ...localDataRef.current,
        lastRenderError: "Custom width and height are required.",
        lastRenderErrorHash: currentPipelineHash,
      };
      await persistImmediately(next);
      return;
    }

    renderRunIdRef.current += 1;
    const runId = renderRunIdRef.current;
    setIsRendering(true);

    try {
      const activeData = localDataRef.current;
      const renderResult = await bridge.renderFull({
        sourceUrl,
        steps,
        render: {
          resolution: activeData.outputResolution,
          customSize:
            activeData.outputResolution === "custom" &&
            activeData.customWidth !== undefined &&
            activeData.customHeight !== undefined
              ? {
                  width: activeData.customWidth,
                  height: activeData.customHeight,
                }
              : undefined,
          format: activeData.format,
          jpegQuality:
            activeData.format === "jpeg" ? activeData.jpegQuality / 100 : undefined,
        },
      });

      if (runId !== renderRunIdRef.current) return;

      const filename = `lemonspace-render-${Date.now()}.${extensionForFormat(renderResult.format)}`;

      if (mode === "download") {
        const objectUrl = window.URL.createObjectURL(renderResult.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => {
          window.URL.revokeObjectURL(objectUrl);
        }, 30_000);
      }

      const renderNext: PersistedRenderData = {
        ...activeData,
        lastRenderedAt: Date.now(),
        lastRenderedHash: currentPipelineHash,
        lastRenderWidth: renderResult.width,
        lastRenderHeight: renderResult.height,
        lastRenderFormat: renderResult.format,
        lastRenderMimeType: renderResult.mimeType,
        lastRenderSizeBytes: renderResult.sizeBytes,
        lastRenderQuality: renderResult.quality,
        lastRenderSourceWidth: renderResult.sourceWidth,
        lastRenderSourceHeight: renderResult.sourceHeight,
        lastRenderWasSizeClamped: renderResult.wasSizeClamped,
        lastRenderError: undefined,
        lastRenderErrorHash: undefined,
      };

      if (mode === "download") {
        await persistImmediately(renderNext);
        return;
      }

      if (runId !== renderRunIdRef.current) return;
      setIsUploading(true);

      try {
        const uploadUrl = await generateUploadUrl();
        if (runId !== renderRunIdRef.current) return;

        const { storageId } = await uploadBlobToConvex({
          uploadUrl,
          blob: renderResult.blob,
          mimeType: renderResult.mimeType,
        });

        if (runId !== renderRunIdRef.current) return;

        const uploadNext: PersistedRenderData = {
          ...renderNext,
          storageId,
          url: undefined,
          lastUploadedAt: Date.now(),
          lastUploadedHash: currentPipelineHash,
          lastUploadStorageId: storageId,
          lastUploadUrl: undefined,
          lastUploadMimeType: renderResult.mimeType,
          lastUploadSizeBytes: renderResult.sizeBytes,
          lastUploadFilename: filename,
          lastUploadError: undefined,
          lastUploadErrorHash: undefined,
        };

        await persistImmediately(uploadNext);

        if (runId !== renderRunIdRef.current) return;

        try {
          const refreshed = await convex.query(api.nodes.get, { nodeId: id as Id<"nodes"> });
          const refreshedData = refreshed?.data as Record<string, unknown> | undefined;
          const resolvedUrl =
            typeof refreshedData?.url === "string" && refreshedData.url.length > 0
              ? refreshedData.url
              : undefined;

          if (resolvedUrl && runId === renderRunIdRef.current) {
            await persistImmediately({
              ...localDataRef.current,
              url: resolvedUrl,
              lastUploadUrl: resolvedUrl,
            });
          }
        } catch {
          // URL-Aufloesung ist optional; storageId bleibt die persistente Referenz.
        }
      } catch (uploadError: unknown) {
        if (runId !== renderRunIdRef.current) return;

        const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
        await persistImmediately({
          ...renderNext,
          lastUploadError: message,
          lastUploadErrorHash: currentPipelineHash,
        });
      } finally {
        if (runId === renderRunIdRef.current) {
          setIsUploading(false);
        }
      }
    } catch (error: unknown) {
      if (runId !== renderRunIdRef.current) return;

      const message = error instanceof Error ? error.message : "Render failed";
      const next: PersistedRenderData = {
        ...localDataRef.current,
        lastRenderError: message,
        lastRenderErrorHash: currentPipelineHash,
      };
      await persistImmediately(next);
    } finally {
      if (runId === renderRunIdRef.current) {
        setIsRendering(false);
      }
    }
  };

  const statusToneClass =
    renderState === "done"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : renderState === "rendering"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : renderState === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-border bg-muted/40 text-muted-foreground";

  const wrapperStatus = renderState === "rendering" ? "executing" : renderState;

  return (
    <BaseNodeWrapper
      nodeType="render"
      selected={selected}
      status={wrapperStatus}
      statusMessage={currentError ?? data._statusMessage}
      className="flex h-full min-w-[280px] flex-col overflow-hidden border-sky-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="text-xs font-medium text-sky-600 dark:text-sky-400">Bildausgabe</div>
      </div>

      <div className="relative min-h-[300px] flex-1 overflow-hidden bg-muted/40">
        {hasSource ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Verbinde eine Bild-, Asset- oder KI-Bild-Node als Quelle.
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/80" />

        <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
          <div
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide backdrop-blur-sm ${statusToneClass}`}
          >
            {renderStateLabel[renderState]}
          </div>
          {(isPreviewRendering || previewError) && hasSource ? (
            <div className="rounded-full border border-border/80 bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
              {isPreviewRendering ? "Preview..." : "Preview error"}
            </div>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 z-30">
          <button
            ref={menuButtonRef}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen((open) => !open);
            }}
            className="nodrag flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/75 text-foreground shadow-sm backdrop-blur-sm transition hover:bg-background"
            aria-label="Render Actions"
          >
            {isRendering || isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </button>

          {isMenuOpen ? (
            <div
              ref={menuPanelRef}
              onPointerDown={(event) => event.stopPropagation()}
              className="nodrag absolute right-0 top-11 w-64 space-y-2 rounded-xl border border-border/80 bg-popover/95 p-3 shadow-lg backdrop-blur"
            >
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Resolution</div>
                <Select
                  value={localData.outputResolution}
                  onValueChange={(value: RenderResolutionOption) => {
                    updateLocalData((current) => ({
                      ...current,
                      outputResolution: value,
                    }));
                  }}
                >
                  <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                    <SelectValue placeholder="Resolution" />
                  </SelectTrigger>
                  <SelectContent className="nodrag">
                    <SelectItem value="original">Original</SelectItem>
                    <SelectItem value="2x">2x</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {localData.outputResolution === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    <span>Width</span>
                    <input
                      type="number"
                      step={1}
                      min={MIN_CUSTOM_DIMENSION}
                      max={MAX_CUSTOM_DIMENSION}
                      value={localData.customWidth ?? ""}
                      onChange={(event) => {
                        const parsed = sanitizeDimension(Number(event.target.value));
                        updateLocalData((current) => ({
                          ...current,
                          customWidth: parsed,
                        }));
                      }}
                      className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    <span>Height</span>
                    <input
                      type="number"
                      step={1}
                      min={MIN_CUSTOM_DIMENSION}
                      max={MAX_CUSTOM_DIMENSION}
                      value={localData.customHeight ?? ""}
                      onChange={(event) => {
                        const parsed = sanitizeDimension(Number(event.target.value));
                        updateLocalData((current) => ({
                          ...current,
                          customHeight: parsed,
                        }));
                      }}
                      className="nodrag nowheel h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </label>
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Format</div>
                <Select
                  value={localData.format}
                  onValueChange={(value: RenderFormatOption) => {
                    updateLocalData((current) => ({
                      ...current,
                      format: value,
                    }));
                  }}
                >
                  <SelectTrigger className="nodrag h-8 text-xs" size="sm">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent className="nodrag">
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {localData.format === "jpeg" ? (
                <SliderRow
                  label="JPEG Quality"
                  value={localData.jpegQuality}
                  min={1}
                  max={100}
                  onChange={(value) => {
                    updateLocalData((current) => ({
                      ...current,
                      jpegQuality: Math.max(1, Math.min(100, Math.round(value))),
                    }));
                  }}
                />
              ) : null}

              <div className="space-y-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void handleRender("download");
                  }}
                  disabled={!canRender}
                  className="nodrag inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {renderState === "rendering" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Render & Download
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    void handleRender("upload");
                  }}
                  disabled={!canUpload}
                  className="nodrag inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CloudUpload className="h-3 w-3" />
                  )}
                  Render & Upload
                </button>

                {status.isOffline ? (
                  <p className="text-[10px] text-muted-foreground">Upload ist nur online verfuegbar.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-3 left-3 z-20 max-w-[70%] space-y-1.5 text-[11px]">
          {renderState === "idle" && !isRenderCurrent && localData.lastRenderedAt ? (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-background/85 px-2 py-1 text-amber-700 backdrop-blur-sm dark:text-amber-300">
              <AlertCircle className="h-3 w-3" />
              Pipeline geaendert. Bitte erneut rendern.
            </div>
          ) : null}

          {renderState === "done" ? (
            <div className="rounded-md border border-emerald-500/40 bg-background/85 px-2 py-1 text-emerald-700 backdrop-blur-sm dark:text-emerald-300">
              <div className="flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Export abgeschlossen
              </div>
              <div>
                {localData.lastRenderWidth}x{localData.lastRenderHeight} px - {String(localData.lastRenderFormat ?? localData.format).toUpperCase()} - {formatBytes(localData.lastRenderSizeBytes)}
              </div>
              {localData.lastRenderWasSizeClamped ? <div>Ausgabe wurde an Groessenlimits angepasst.</div> : null}
            </div>
          ) : null}

          {renderState === "error" && currentError ? (
            <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">
              {currentError}
            </div>
          ) : null}

          {isUploadCurrent && localData.lastUploadStorageId ? (
            <div className="rounded-md border border-sky-500/40 bg-background/85 px-2 py-1 text-sky-700 backdrop-blur-sm dark:text-sky-300">
              <div className="font-medium">Upload gespeichert</div>
              <div>Storage: {localData.lastUploadStorageId}</div>
              <div>{localData.lastUploadUrl ? "URL aufgeloest" : "URL-Aufloesung ausstehend"}</div>
            </div>
          ) : null}

          {currentUploadError ? (
            <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">
              Upload fehlgeschlagen: {currentUploadError}
            </div>
          ) : null}

          {previewError ? (
            <div className="rounded-md border border-red-500/40 bg-background/90 px-2 py-1 text-red-600 backdrop-blur-sm">
              Preview: {previewError}
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-3 right-3 z-20 w-28 rounded-md border border-border/80 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Gesamt-Histogramm
          </div>
          <svg
            viewBox="0 0 96 44"
            className="h-11 w-full"
            role="img"
            aria-label="Histogramm als RGB-Linienkurven"
          >
            <polyline
              points={histogramPolylines.rgb}
              fill="none"
              stroke="rgba(248, 250, 252, 0.9)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.red}
              fill="none"
              stroke="rgba(248, 113, 113, 0.9)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.green}
              fill="none"
              stroke="rgba(74, 222, 128, 0.85)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={histogramPolylines.blue}
              fill="none"
              stroke="rgba(96, 165, 250, 0.88)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />
    </BaseNodeWrapper>
  );
}
