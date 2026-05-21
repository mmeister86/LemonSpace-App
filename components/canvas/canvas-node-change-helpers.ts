/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas node change helpers. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { Node as RFNode, NodeChange } from "@xyflow/react";

import {
  AI_IMAGE_NODE_FOOTER_PX,
  AI_IMAGE_NODE_HEADER_PX,
  DEFAULT_ASPECT_RATIO,
  parseAspectRatioString,
} from "@/lib/image-formats";
import { readNodeCollapsed } from "@/lib/canvas-node-favorite";
import { resolveMediaAspectRatio } from "@/lib/canvas-utils";
import { clampNodeDimensionsToMinimum } from "./canvas-node-size-helpers";

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

      return clampGenericNodeDimensionsChange(change, node);
    })
    .filter((change): change is NodeChange => change !== null);
}
