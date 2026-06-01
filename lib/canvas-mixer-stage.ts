/**
 * Onboarding note:
 * Shared Mixer V2 stage helpers. Keep this pure so preview, render, and node UI
 * all agree on which layer defines composition size.
 */

import {
  MIXER_LAYER_HANDLE_BASE_ID,
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerLayerHandle,
} from "@/lib/canvas-mixer-normalization";
import { readNodeBypassed } from "@/lib/canvas-node-favorite";
import type {
  CanvasGraphEdgeLike,
  CanvasGraphNodeLike,
  CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";

export type MixerStageSize = {
  width: number;
  height: number;
};

export const MIXER_STAGE_FALLBACK_SIZE: MixerStageSize = {
  width: 360,
  height: 260,
};

const TEXT_STAGE_FALLBACK_SIZE: MixerStageSize = {
  width: 256,
  height: 120,
};

const MIXER_NODE_MIN_WIDTH = 360;
const MIXER_NODE_MIN_HEIGHT = 460;
const MIXER_NODE_EDITOR_MIN_HEIGHT = 260;
const MIXER_NODE_CHROME_HEIGHT = MIXER_NODE_MIN_HEIGHT - MIXER_NODE_EDITOR_MIN_HEIGHT;

function readPositiveDimension(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function readNodeDimension(
  node: CanvasGraphNodeLike,
  key: "width" | "height",
): number | null {
  return (
    readPositiveDimension(node[key]) ??
    readPositiveDimension(node.measured?.[key]) ??
    readPositiveDimension(node.style?.[key])
  );
}

function readSourceDataStage(data: unknown): MixerStageSize | null {
  const record = (data ?? {}) as Record<string, unknown>;
  const width =
    readPositiveDimension(record.intrinsicWidth) ??
    readPositiveDimension(record.outputWidth) ??
    readPositiveDimension(record.width);
  const height =
    readPositiveDimension(record.intrinsicHeight) ??
    readPositiveDimension(record.outputHeight) ??
    readPositiveDimension(record.height);

  if (!width || !height) {
    return null;
  }

  return { width, height };
}

export function resolveMixerSourceStageSize(
  node: CanvasGraphNodeLike | null | undefined,
): MixerStageSize | null {
  if (!node || readNodeBypassed(node.data) || !MIXER_SOURCE_NODE_TYPES.has(node.type)) {
    return null;
  }

  const dataStage = readSourceDataStage(node.data);
  if (dataStage) {
    return dataStage;
  }

  if (node.type !== "text") {
    return null;
  }

  return {
    width: readNodeDimension(node, "width") ?? TEXT_STAGE_FALLBACK_SIZE.width,
    height: readNodeDimension(node, "height") ?? TEXT_STAGE_FALLBACK_SIZE.height,
  };
}

export function resolveMixerBaseStageFromGraph(args: {
  incomingEdges: readonly CanvasGraphEdgeLike[];
  graph: CanvasGraphSnapshot;
}): MixerStageSize | null {
  const baseEdge = args.incomingEdges.find(
    (edge) => normalizeMixerLayerHandle(edge.targetHandle) === MIXER_LAYER_HANDLE_BASE_ID,
  );
  if (!baseEdge) {
    return null;
  }

  return resolveMixerSourceStageSize(args.graph.nodesById.get(baseEdge.source));
}

export function mixerStageSizesEqual(
  left: MixerStageSize | null | undefined,
  right: MixerStageSize | null | undefined,
): boolean {
  return left?.width === right?.width && left?.height === right?.height;
}

export function computeMixerNodeSizeFromStage(stage: MixerStageSize): MixerStageSize {
  const stageWidth = Math.max(1, Math.round(stage.width));
  const stageHeight = Math.max(1, Math.round(stage.height));
  const aspectRatio = stageWidth / stageHeight;

  let editorWidth = MIXER_NODE_MIN_WIDTH;
  let editorHeight = Math.round(editorWidth / aspectRatio);

  if (editorHeight < MIXER_NODE_EDITOR_MIN_HEIGHT) {
    editorHeight = MIXER_NODE_EDITOR_MIN_HEIGHT;
    editorWidth = Math.round(editorHeight * aspectRatio);
  }

  return {
    width: Math.max(MIXER_NODE_MIN_WIDTH, editorWidth),
    height: Math.max(MIXER_NODE_MIN_HEIGHT, editorHeight + MIXER_NODE_CHROME_HEIGHT),
  };
}
