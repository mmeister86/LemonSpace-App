import {
  collectPipeline,
  getSourceImage,
  hashPipeline,
  type PipelineStep,
} from "@/lib/image-pipeline/contracts";

export type RenderPreviewGraphNode = {
  id: string;
  type: string;
  data?: unknown;
};

export type RenderPreviewGraphEdge = {
  source: string;
  target: string;
};

export type RenderPreviewInput = {
  sourceUrl: string;
  steps: PipelineStep[];
};

type RenderResolutionOption = "original" | "2x" | "custom";
type RenderFormatOption = "png" | "jpeg" | "webp";

const DEFAULT_OUTPUT_RESOLUTION: RenderResolutionOption = "original";
const DEFAULT_FORMAT: RenderFormatOption = "png";
const DEFAULT_JPEG_QUALITY = 90;
const MIN_CUSTOM_DIMENSION = 1;
const MAX_CUSTOM_DIMENSION = 16_384;

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

const SOURCE_NODE_TYPES = new Set(["image", "ai-image", "asset"]);

export const RENDER_PREVIEW_PIPELINE_TYPES = new Set([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

export function resolveRenderFingerprint(data: unknown): {
  resolution: RenderResolutionOption;
  customWidth?: number;
  customHeight?: number;
  format: RenderFormatOption;
  jpegQuality?: number;
} {
  const record = (data ?? {}) as Record<string, unknown>;
  const resolution: RenderResolutionOption =
    record.outputResolution === "2x" || record.outputResolution === "custom"
      ? record.outputResolution
      : DEFAULT_OUTPUT_RESOLUTION;

  const format: RenderFormatOption =
    record.format === "jpeg" || record.format === "webp"
      ? record.format
      : DEFAULT_FORMAT;

  const jpegQuality =
    typeof record.jpegQuality === "number" && Number.isFinite(record.jpegQuality)
      ? Math.max(1, Math.min(100, Math.round(record.jpegQuality)))
      : DEFAULT_JPEG_QUALITY;

  return {
    resolution,
    customWidth: resolution === "custom" ? sanitizeDimension(record.customWidth) : undefined,
    customHeight: resolution === "custom" ? sanitizeDimension(record.customHeight) : undefined,
    format,
    jpegQuality: format === "jpeg" ? jpegQuality : undefined,
  };
}

export function resolveRenderPipelineHash(args: {
  sourceUrl: string | null;
  steps: PipelineStep[];
  data: unknown;
}): string | null {
  if (!args.sourceUrl) {
    return null;
  }

  return hashPipeline(
    { sourceUrl: args.sourceUrl, render: resolveRenderFingerprint(args.data) },
    args.steps,
  );
}

export function resolveNodeImageUrl(data: unknown): string | null {
  const record = (data ?? {}) as Record<string, unknown>;
  const directUrl = typeof record.url === "string" ? record.url : null;
  if (directUrl && directUrl.length > 0) {
    return directUrl;
  }

  const previewUrl =
    typeof record.previewUrl === "string" ? record.previewUrl : null;
  if (previewUrl && previewUrl.length > 0) {
    return previewUrl;
  }

  return null;
}

export function resolveRenderPreviewInput(args: {
  nodeId: string;
  nodes: readonly RenderPreviewGraphNode[];
  edges: readonly RenderPreviewGraphEdge[];
}): { sourceUrl: string | null; steps: PipelineStep[] } {
  const sourceUrl = getSourceImage({
    nodeId: args.nodeId,
    nodes: args.nodes,
    edges: args.edges,
    isSourceNode: (node) => SOURCE_NODE_TYPES.has(node.type ?? ""),
    getSourceImageFromNode: (node) => resolveNodeImageUrl(node.data),
  });

  const steps = collectPipeline({
    nodeId: args.nodeId,
    nodes: args.nodes,
    edges: args.edges,
    isPipelineNode: (node) => RENDER_PREVIEW_PIPELINE_TYPES.has(node.type ?? ""),
  }) as PipelineStep[];

  return {
    sourceUrl,
    steps,
  };
}
