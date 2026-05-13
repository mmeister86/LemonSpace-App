/**
 * Framework-light helpers for finite repeating Canvas input handles.
 *
 * These helpers keep slot assignment display-only. Persisted edges can still use
 * legacy handles such as `image-in`; React Flow receives compact handle ids.
 */

import {
  isAiImageReferenceSourceType,
  MAX_AI_IMAGE_REFERENCES,
} from "@/lib/ai-image-references";
import {
  isAgentContextSourceType,
  MAX_AGENT_CONTEXT_INPUTS,
} from "@/lib/canvas-connection-policy";

export type RepeatingInputEdgeLike = {
  id?: string;
  source: string;
  target: string;
  targetHandle?: string | null;
  className?: string;
};

export type RepeatingInputHandleSlot = {
  handleId: string;
  topPercent: number;
  isOccupied: boolean;
  edgeId?: string;
};

type NodeTypeLookup = ReadonlyMap<string, string | undefined>;

const PROMPT_REPEATING_INPUT_BASE_HANDLE_ID = "image-in";
const PROMPT_MAX_TEXT_INPUTS = 1;
const PROMPT_TEXT_SOURCE_TYPES = new Set(["text", "ai-text-output"]);
const AGENT_REPEATING_INPUT_BASE_HANDLE_ID = "agent-in";

type RepeatingInputConfig = {
  nodeType: string;
  baseHandleId: string;
  maxSlots: number;
};

const PROMPT_REPEATING_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "prompt",
  baseHandleId: PROMPT_REPEATING_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AI_IMAGE_REFERENCES + PROMPT_MAX_TEXT_INPUTS,
};

const AGENT_REPEATING_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "agent",
  baseHandleId: AGENT_REPEATING_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AGENT_CONTEXT_INPUTS,
};

function getRepeatingInputConfig(nodeType: string | undefined): RepeatingInputConfig | null {
  if (nodeType === PROMPT_REPEATING_INPUT_CONFIG.nodeType) {
    return PROMPT_REPEATING_INPUT_CONFIG;
  }
  if (nodeType === AGENT_REPEATING_INPUT_CONFIG.nodeType) {
    return AGENT_REPEATING_INPUT_CONFIG;
  }
  return null;
}

function nodeTypeForId(nodeTypeById: NodeTypeLookup, nodeId: string): string {
  return nodeTypeById.get(nodeId) ?? "";
}

function isPromptTextSourceType(sourceType: string): boolean {
  return PROMPT_TEXT_SOURCE_TYPES.has(sourceType);
}

function isPromptRepeatingSourceType(sourceType: string): boolean {
  return isAiImageReferenceSourceType(sourceType) || isPromptTextSourceType(sourceType);
}

function isRepeatingSourceForTarget(sourceType: string, targetType: string): boolean {
  if (targetType === "prompt") {
    return isPromptRepeatingSourceType(sourceType);
  }
  if (targetType === "agent") {
    return isAgentContextSourceType(sourceType);
  }
  return false;
}

function isVisibleEdge(edge: RepeatingInputEdgeLike): boolean {
  return edge.className !== "temp";
}

function roundHandleTopPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildRepeatingInputHandleId(baseHandleId: string, index: number): string {
  if (index <= 0) {
    return baseHandleId;
  }
  return `${baseHandleId}-${index + 1}`;
}

export function resolveRepeatingInputHandleTopPercent(index: number, count: number): number {
  if (count <= 1) {
    return 50;
  }

  return roundHandleTopPercent(20 + (60 * (index + 1)) / (count + 1));
}

function collectRepeatingInputEdges(args: {
  nodeType: string;
  nodeId: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): RepeatingInputEdgeLike[] {
  const config = getRepeatingInputConfig(args.nodeType);
  if (!config) {
    return [];
  }

  return args.edges.filter((edge) => {
    if (!isVisibleEdge(edge) || edge.target !== args.nodeId) {
      return false;
    }

    const sourceType = nodeTypeForId(args.nodeTypeById, edge.source);
    return isRepeatingSourceForTarget(sourceType, args.nodeType);
  });
}

function countPromptInputs(
  edges: readonly RepeatingInputEdgeLike[],
  nodeTypeById: NodeTypeLookup,
): { visualCount: number; textCount: number } {
  let visualCount = 0;
  let textCount = 0;

  for (const edge of edges) {
    const sourceType = nodeTypeForId(nodeTypeById, edge.source);
    if (isAiImageReferenceSourceType(sourceType)) {
      visualCount += 1;
    } else if (isPromptTextSourceType(sourceType)) {
      textCount += 1;
    }
  }

  return { visualCount, textCount };
}

function canAcceptAnyPromptInput(
  edges: readonly RepeatingInputEdgeLike[],
  nodeTypeById: NodeTypeLookup,
): boolean {
  const { visualCount, textCount } = countPromptInputs(edges, nodeTypeById);
  return visualCount < MAX_AI_IMAGE_REFERENCES || textCount < PROMPT_MAX_TEXT_INPUTS;
}

function canAcceptPromptSourceType(args: {
  sourceType: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): boolean {
  const { visualCount, textCount } = countPromptInputs(args.edges, args.nodeTypeById);
  if (isAiImageReferenceSourceType(args.sourceType)) {
    return visualCount < MAX_AI_IMAGE_REFERENCES;
  }
  if (isPromptTextSourceType(args.sourceType)) {
    return textCount < PROMPT_MAX_TEXT_INPUTS;
  }
  return false;
}

function canAcceptAnyRepeatingInput(args: {
  targetType: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): boolean {
  if (args.targetType === "prompt") {
    return canAcceptAnyPromptInput(args.edges, args.nodeTypeById);
  }

  const config = getRepeatingInputConfig(args.targetType);
  return config ? args.edges.length < config.maxSlots : false;
}

function canAcceptRepeatingSourceType(args: {
  sourceType: string;
  targetType: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): boolean {
  if (args.targetType === "prompt") {
    return canAcceptPromptSourceType({
      sourceType: args.sourceType,
      edges: args.edges,
      nodeTypeById: args.nodeTypeById,
    });
  }

  const config = getRepeatingInputConfig(args.targetType);
  return (
    config !== null &&
    isRepeatingSourceForTarget(args.sourceType, args.targetType) &&
    args.edges.length < config.maxSlots
  );
}

export function resolveVisibleRepeatingInputHandles(args: {
  nodeType: string;
  nodeId: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): RepeatingInputHandleSlot[] {
  const config = getRepeatingInputConfig(args.nodeType);
  if (!config) {
    return [];
  }

  const occupiedEdges = collectRepeatingInputEdges(args).slice(0, config.maxSlots);
  const includeFreeHandle = canAcceptAnyRepeatingInput({
    targetType: args.nodeType,
    edges: occupiedEdges,
    nodeTypeById: args.nodeTypeById,
  });
  const visibleCount = Math.min(
    config.maxSlots,
    occupiedEdges.length + (includeFreeHandle ? 1 : 0),
  );

  return Array.from({ length: visibleCount }, (_, index) => {
    const edge = occupiedEdges[index];
    return {
      ...(edge?.id ? { edgeId: edge.id } : {}),
      handleId: buildRepeatingInputHandleId(config.baseHandleId, index),
      isOccupied: edge !== undefined,
      topPercent: resolveRepeatingInputHandleTopPercent(index, visibleCount),
    };
  });
}

export function resolveNextRepeatingInputHandleId(args: {
  sourceType: string;
  targetType: string;
  targetNodeId: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): string | null | undefined {
  const config = getRepeatingInputConfig(args.targetType);
  if (!config) {
    return undefined;
  }

  const occupiedEdges = collectRepeatingInputEdges({
    nodeType: args.targetType,
    nodeId: args.targetNodeId,
    edges: args.edges,
    nodeTypeById: args.nodeTypeById,
  }).slice(0, config.maxSlots);

  if (
    !canAcceptRepeatingSourceType({
      sourceType: args.sourceType,
      targetType: args.targetType,
      edges: occupiedEdges,
      nodeTypeById: args.nodeTypeById,
    })
  ) {
    return null;
  }

  if (occupiedEdges.length >= config.maxSlots) {
    return null;
  }

  return buildRepeatingInputHandleId(config.baseHandleId, occupiedEdges.length);
}

export function assignDisplayHandlesToRepeatingInputEdges<TEdge extends RepeatingInputEdgeLike>(
  edges: readonly TEdge[],
  nodeTypeById: NodeTypeLookup,
): TEdge[] {
  const nextHandleByEdgeIndex = new Map<number, string>();
  const groupedEdgeIndexesByTarget = new Map<string, number[]>();

  edges.forEach((edge, index) => {
    const targetType = nodeTypeForId(nodeTypeById, edge.target);
    const config = getRepeatingInputConfig(targetType);
    if (!config || !isVisibleEdge(edge)) {
      return;
    }

    const sourceType = nodeTypeForId(nodeTypeById, edge.source);
    if (!isRepeatingSourceForTarget(sourceType, targetType)) {
      return;
    }

    const bucket = groupedEdgeIndexesByTarget.get(edge.target);
    if (bucket) {
      bucket.push(index);
    } else {
      groupedEdgeIndexesByTarget.set(edge.target, [index]);
    }
  });

  for (const [targetNodeId, edgeIndexes] of groupedEdgeIndexesByTarget) {
    const targetType = nodeTypeForId(nodeTypeById, targetNodeId);
    const config = getRepeatingInputConfig(targetType);
    if (!config) {
      continue;
    }

    edgeIndexes.slice(0, config.maxSlots).forEach((edgeIndex, slotIndex) => {
      nextHandleByEdgeIndex.set(
        edgeIndex,
        buildRepeatingInputHandleId(config.baseHandleId, slotIndex),
      );
    });
  }

  if (nextHandleByEdgeIndex.size === 0) {
    return [...edges];
  }

  return edges.map((edge, index) => {
    const nextTargetHandle = nextHandleByEdgeIndex.get(index);
    if (nextTargetHandle === undefined || edge.targetHandle === nextTargetHandle) {
      return edge;
    }

    return {
      ...edge,
      targetHandle: nextTargetHandle,
    };
  });
}
