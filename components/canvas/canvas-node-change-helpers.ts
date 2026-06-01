/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas node change helpers. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Edge as RFEdge, Node as RFNode, NodeChange } from "@xyflow/react";

import {
  AI_IMAGE_NODE_FOOTER_PX,
  AI_IMAGE_NODE_HEADER_PX,
  DEFAULT_ASPECT_RATIO,
  parseAspectRatioString,
} from "@/lib/image-formats";
import { readNodeCollapsed } from "@/lib/canvas-node-favorite";
import { resolveMediaAspectRatio } from "@/lib/canvas-utils";
import {
  RENDER_NODE_HEADER_HEIGHT,
  toRenderNodeAspectSize,
} from "@/components/canvas/nodes/render-node-state";
import {
  clampNodeDimensionsToMinimum,
  getCanvasNodeStaticMinimumSize,
} from "./canvas-node-size-helpers";

const RENDER_RATIO_SOURCE_TYPES = new Set([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "change-camera",
  "render",
]);
const RENDER_RATIO_PIPELINE_TYPES = new Set([
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

function isActiveResizeChange(change: NodeChange): boolean {
  return change.type === "dimensions" &&
    Boolean(change.dimensions) &&
    (change.resizing === true || change.resizing === false);
}

function adjustAssetNodeDimensionsChange(
  change: NodeChange,
  node: RFNode,
  allChanges: NodeChange[],
): NodeChange | null {
  if (change.type !== "dimensions" || !change.dimensions) return change;

  const isActiveResize = isActiveResizeChange(change);
  const nodeResizing = Boolean((node as { resizing?: boolean }).resizing);
  const hasResizingTrueInBatch = allChanges.some(
    (candidate) =>
      candidate.type === "dimensions" &&
      "id" in candidate &&
      candidate.id === change.id &&
      candidate.resizing === true,
  );

  if (!isActiveResize && (nodeResizing || hasResizingTrueInBatch)) {
    return null;
  }
  if (!isActiveResize) {
    return change;
  }

  const nodeData = node.data as {
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    orientation?: string;
  };

  const hasIntrinsicRatioInput =
    typeof nodeData.intrinsicWidth === "number" &&
    nodeData.intrinsicWidth > 0 &&
    typeof nodeData.intrinsicHeight === "number" &&
    nodeData.intrinsicHeight > 0;
  if (!hasIntrinsicRatioInput) {
    return change;
  }

  const targetRatio = resolveMediaAspectRatio(
    nodeData.intrinsicWidth,
    nodeData.intrinsicHeight,
    nodeData.orientation,
  );
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    return change;
  }

  const previousWidth =
    typeof node.style?.width === "number" ? node.style.width : change.dimensions.width;
  const previousHeight =
    typeof node.style?.height === "number" ? node.style.height : change.dimensions.height;

  const widthDelta = Math.abs(change.dimensions.width - previousWidth);
  const heightDelta = Math.abs(change.dimensions.height - previousHeight);

  let constrainedWidth = change.dimensions.width;
  let constrainedHeight = change.dimensions.height;

  const assetChromeHeight = 88;
  const assetMinPreviewHeight = 150;
  const assetMinNodeHeight = assetChromeHeight + assetMinPreviewHeight;
  const assetMinNodeWidth = 200;

  if (heightDelta > widthDelta) {
    const previewHeight = Math.max(1, constrainedHeight - assetChromeHeight);
    constrainedWidth = previewHeight * targetRatio;
    constrainedHeight = assetChromeHeight + previewHeight;
  } else {
    const previewHeight = constrainedWidth / targetRatio;
    constrainedHeight = assetChromeHeight + previewHeight;
  }

  const minWidthFromPreview = assetMinPreviewHeight * targetRatio;
  const minimumAllowedWidth = Math.max(assetMinNodeWidth, minWidthFromPreview);
  const minPreviewFromWidth = minimumAllowedWidth / targetRatio;
  const minimumAllowedHeight = Math.max(
    assetMinNodeHeight,
    assetChromeHeight + minPreviewFromWidth,
  );

  let enforcedWidth = Math.max(constrainedWidth, minimumAllowedWidth);
  let enforcedHeight = assetChromeHeight + enforcedWidth / targetRatio;
  if (enforcedHeight < minimumAllowedHeight) {
    enforcedHeight = minimumAllowedHeight;
    enforcedWidth = (enforcedHeight - assetChromeHeight) * targetRatio;
  }
  enforcedWidth = Math.max(enforcedWidth, minimumAllowedWidth);
  enforcedHeight = assetChromeHeight + enforcedWidth / targetRatio;

  return {
    ...change,
    dimensions: {
      ...change.dimensions,
      width: enforcedWidth,
      height: enforcedHeight,
    },
  };
}

function adjustAiImageNodeDimensionsChange(
  change: NodeChange,
  node: RFNode,
): NodeChange {
  if (change.type !== "dimensions" || !change.dimensions) return change;

  const isActiveResize = isActiveResizeChange(change);
  if (!isActiveResize) {
    return change;
  }

  const nodeData = node.data as { aspectRatio?: string };
  const arLabel =
    typeof nodeData.aspectRatio === "string" && nodeData.aspectRatio.trim()
      ? nodeData.aspectRatio.trim()
      : DEFAULT_ASPECT_RATIO;

  let arW: number;
  let arH: number;
  try {
    const parsed = parseAspectRatioString(arLabel);
    arW = parsed.w;
    arH = parsed.h;
  } catch {
    return change;
  }

  const chrome = AI_IMAGE_NODE_HEADER_PX + AI_IMAGE_NODE_FOOTER_PX;
  const hPerW = arH / arW;

  const previousWidth =
    typeof node.style?.width === "number" ? node.style.width : change.dimensions.width;
  const previousHeight =
    typeof node.style?.height === "number" ? node.style.height : change.dimensions.height;

  const widthDelta = Math.abs(change.dimensions.width - previousWidth);
  const heightDelta = Math.abs(change.dimensions.height - previousHeight);

  let constrainedWidth = change.dimensions.width;
  let constrainedHeight = change.dimensions.height;

  if (heightDelta > widthDelta) {
    const viewportHeight = Math.max(1, constrainedHeight - chrome);
    constrainedWidth = viewportHeight * (arW / arH);
    constrainedHeight = chrome + viewportHeight;
  } else {
    constrainedHeight = chrome + constrainedWidth * hPerW;
  }

  const aiMinViewport = 120;
  const aiMinOuterHeight = chrome + aiMinViewport;
  const aiMinOuterWidthBase = 200;
  const minimumAllowedWidth = Math.max(
    aiMinOuterWidthBase,
    aiMinViewport * (arW / arH),
  );
  const minimumAllowedHeight = Math.max(
    aiMinOuterHeight,
    chrome + minimumAllowedWidth * hPerW,
  );

  let enforcedWidth = Math.max(constrainedWidth, minimumAllowedWidth);
  let enforcedHeight = chrome + enforcedWidth * hPerW;
  if (enforcedHeight < minimumAllowedHeight) {
    enforcedHeight = minimumAllowedHeight;
    enforcedWidth = (enforcedHeight - chrome) * (arW / arH);
  }
  enforcedWidth = Math.max(enforcedWidth, minimumAllowedWidth);
  enforcedHeight = chrome + enforcedWidth * hPerW;

  return {
    ...change,
    dimensions: {
      ...change.dimensions,
      width: enforcedWidth,
      height: enforcedHeight,
    },
  };
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveAspectFromNode(node: RFNode): number | null {
  const data = readRecord(node.data);

  if (node.type === "image") {
    const width = readPositiveNumber(data.width);
    const height = readPositiveNumber(data.height);
    return width && height ? width / height : null;
  }

  if (node.type === "asset") {
    const intrinsicWidth = readPositiveNumber(data.intrinsicWidth);
    const intrinsicHeight = readPositiveNumber(data.intrinsicHeight);
    if (intrinsicWidth && intrinsicHeight) {
      return resolveMediaAspectRatio(
        intrinsicWidth,
        intrinsicHeight,
        typeof data.orientation === "string" ? data.orientation : undefined,
      );
    }
  }

  if (node.type === "ai-image") {
    const outputWidth = readPositiveNumber(data.outputWidth);
    const outputHeight = readPositiveNumber(data.outputHeight);
    if (outputWidth && outputHeight) return outputWidth / outputHeight;

    const aspectRatioLabel =
      typeof data.aspectRatio === "string" ? data.aspectRatio : DEFAULT_ASPECT_RATIO;
    try {
      const parsed = parseAspectRatioString(aspectRatioLabel);
      return parsed.w / parsed.h;
    } catch {
      return null;
    }
  }

  const width =
    readPositiveNumber(data.width) ??
    readPositiveNumber(data.outputWidth) ??
    readPositiveNumber(data.lastRenderWidth);
  const height =
    readPositiveNumber(data.height) ??
    readPositiveNumber(data.outputHeight) ??
    readPositiveNumber(data.lastRenderHeight);
  return width && height ? width / height : null;
}

function resolveCropAspectMultiplier(node: RFNode): number | null {
  const data = readRecord(node.data);
  const crop = readRecord(data.crop);
  const width = readPositiveNumber(crop.width);
  const height = readPositiveNumber(crop.height);
  return width && height ? width / height : null;
}

function findSingleIncomingEdge(nodeId: string, edges: readonly RFEdge[]): RFEdge | null {
  const incoming = edges
    .filter((edge) => edge.target === nodeId && edge.className !== "temp")
    .sort((a, b) => a.id.localeCompare(b.id));
  return incoming[0] ?? null;
}

function resolveRenderTargetAspectRatio(
  renderNode: RFNode,
  nodes: readonly RFNode[],
  edges: readonly RFEdge[],
): number | null {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>([renderNode.id]);
  let currentId = renderNode.id;
  let cropMultiplier = 1;

  for (let index = 0; index < 24; index += 1) {
    const incoming = findSingleIncomingEdge(currentId, edges);
    if (!incoming || visited.has(incoming.source)) {
      return null;
    }

    const sourceNode = nodesById.get(incoming.source);
    if (!sourceNode) {
      return null;
    }

    visited.add(sourceNode.id);
    if (sourceNode.type && RENDER_RATIO_PIPELINE_TYPES.has(sourceNode.type)) {
      if (sourceNode.type === "crop") {
        const cropMultiplierCandidate = resolveCropAspectMultiplier(sourceNode);
        if (cropMultiplierCandidate) {
          cropMultiplier *= cropMultiplierCandidate;
        }
      }
      currentId = sourceNode.id;
      continue;
    }

    if (!sourceNode.type || !RENDER_RATIO_SOURCE_TYPES.has(sourceNode.type)) {
      return null;
    }

    const sourceAspectRatio = resolveAspectFromNode(sourceNode);
    return sourceAspectRatio ? sourceAspectRatio * cropMultiplier : null;
  }

  return null;
}

function adjustRenderNodeDimensionsChange(
  change: NodeChange,
  node: RFNode,
  nodes: readonly RFNode[],
  edges: readonly RFEdge[],
): NodeChange {
  if (change.type !== "dimensions" || !change.dimensions) return change;
  if (!isActiveResizeChange(change)) {
    return clampGenericNodeDimensionsChange(change, node);
  }

  const targetRatio = resolveRenderTargetAspectRatio(node, nodes, edges);
  if (!targetRatio || !Number.isFinite(targetRatio) || targetRatio <= 0) {
    return clampGenericNodeDimensionsChange(change, node);
  }

  const previousWidth =
    typeof node.style?.width === "number" ? node.style.width : change.dimensions.width;
  const previousHeight =
    typeof node.style?.height === "number" ? node.style.height : change.dimensions.height;
  const widthDelta = Math.abs(change.dimensions.width - previousWidth);
  const heightDelta = Math.abs(change.dimensions.height - previousHeight);

  const minimum = getCanvasNodeStaticMinimumSize(node.type);
  const targetSize = toRenderNodeAspectSize({
    currentWidth: heightDelta > widthDelta
      ? Math.max(1, change.dimensions.height - RENDER_NODE_HEADER_HEIGHT) * targetRatio
      : change.dimensions.width,
    currentHeight: heightDelta > widthDelta
      ? change.dimensions.height
      : RENDER_NODE_HEADER_HEIGHT + change.dimensions.width / targetRatio,
    aspectRatio: targetRatio,
    minWidth: minimum.minWidth,
    minHeight: minimum.minHeight,
  });

  return {
    ...change,
    dimensions: {
      ...change.dimensions,
      width: targetSize.width,
      height: targetSize.height,
    },
  };
}

function clampGenericNodeDimensionsChange(
  change: NodeChange,
  node: RFNode,
): NodeChange {
  if (change.type !== "dimensions" || !change.dimensions) return change;

  const clamped = clampNodeDimensionsToMinimum({
    nodeType: node.type,
    width: change.dimensions.width,
    height: change.dimensions.height,
  });

  if (
    clamped.width === change.dimensions.width &&
    clamped.height === change.dimensions.height
  ) {
    return change;
  }

  return {
    ...change,
    dimensions: {
      ...change.dimensions,
      width: clamped.width,
      height: clamped.height,
    },
  };
}

export function adjustNodeDimensionChanges(
  changes: NodeChange[],
  nodes: RFNode[],
  edges: RFEdge[] = [],
): NodeChange[] {
  return changes
    .map((change) => {
      if (change.type !== "dimensions" || !change.dimensions) {
        return change;
      }

      const node = nodes.find((candidate) => candidate.id === change.id);
      if (!node) {
        return change;
      }

      if (readNodeCollapsed(node.data)) {
        return change;
      }

      if (node.type === "asset") {
        return adjustAssetNodeDimensionsChange(change, node, changes);
      }

      if (node.type === "ai-image") {
        return adjustAiImageNodeDimensionsChange(change, node);
      }

      if (node.type === "render") {
        return adjustRenderNodeDimensionsChange(change, node, nodes, edges);
      }

      return clampGenericNodeDimensionsChange(change, node);
    })
    .filter((change): change is NodeChange => change !== null);
}
