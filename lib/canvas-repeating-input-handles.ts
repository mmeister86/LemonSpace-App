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
  isAiTextDraftSourceType,
  isAiTextInstructionSourceType,
  isAiTextInputSourceType,
  isAgentContextSourceType,
  MAX_AI_TEXT_DRAFT_INPUTS,
  MAX_AI_TEXT_INSTRUCTION_INPUTS,
  MAX_AGENT_CONTEXT_INPUTS,
  MAX_PROMPT_TEXT_INPUTS,
} from "@/lib/canvas-connection-policy";
import {
  MAX_MIXER_LAYERS,
  MIXER_LAYER_HANDLE_BASE_ID,
  MIXER_SOURCE_NODE_TYPES,
} from "@/lib/canvas-mixer-normalization";

export type RepeatingInputEdgeLike = {
  id?: string;
  source: string;
  target: string;
  targetHandle?: string | null;
  className?: string | null;
};

export type RepeatingInputHandleSlot = {
  handleId: string;
  topPercent: number;
  isOccupied: boolean;
  edgeId?: string;
};

type NodeTypeLookup = ReadonlyMap<string, string | undefined>;

const PROMPT_REPEATING_INPUT_BASE_HANDLE_ID = "image-in";
const PROMPT_TEXT_SOURCE_TYPES = new Set(["text", "ai-text-output"]);
const AGENT_REPEATING_INPUT_BASE_HANDLE_ID = "agent-in";
const AI_TEXT_DRAFT_INPUT_BASE_HANDLE_ID = "ai-text-in";
const AI_TEXT_INSTRUCTION_INPUT_BASE_HANDLE_ID = "ai-text-instruction-in";
const MIXER_REPEATING_INPUT_BASE_HANDLE_ID = MIXER_LAYER_HANDLE_BASE_ID;

type RepeatingInputConfig = {
  nodeType: string;
  baseHandleId: string;
  maxSlots: number;
  topRange?: readonly [number, number];
  defaultForBodyDrop?: boolean;
};

const PROMPT_REPEATING_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "prompt",
  baseHandleId: PROMPT_REPEATING_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AI_IMAGE_REFERENCES + MAX_PROMPT_TEXT_INPUTS,
};

const AGENT_REPEATING_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "agent",
  baseHandleId: AGENT_REPEATING_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AGENT_CONTEXT_INPUTS,
};

const AI_TEXT_INSTRUCTION_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "ai-text",
  baseHandleId: AI_TEXT_INSTRUCTION_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AI_TEXT_INSTRUCTION_INPUTS,
  topRange: [18, 42],
};

const AI_TEXT_DRAFT_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "ai-text",
  baseHandleId: AI_TEXT_DRAFT_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_AI_TEXT_DRAFT_INPUTS,
  topRange: [58, 82],
  defaultForBodyDrop: true,
};

const MIXER_REPEATING_INPUT_CONFIG: RepeatingInputConfig = {
  nodeType: "mixer",
  baseHandleId: MIXER_REPEATING_INPUT_BASE_HANDLE_ID,
  maxSlots: MAX_MIXER_LAYERS,
};

function getRepeatingInputConfigs(nodeType: string | undefined): RepeatingInputConfig[] {
  if (nodeType === PROMPT_REPEATING_INPUT_CONFIG.nodeType) {
    return [PROMPT_REPEATING_INPUT_CONFIG];
  }
  if (nodeType === AGENT_REPEATING_INPUT_CONFIG.nodeType) {
    return [AGENT_REPEATING_INPUT_CONFIG];
  }
  if (nodeType === "ai-text") {
    return [AI_TEXT_INSTRUCTION_INPUT_CONFIG, AI_TEXT_DRAFT_INPUT_CONFIG];
  }
  if (nodeType === MIXER_REPEATING_INPUT_CONFIG.nodeType) {
    return [MIXER_REPEATING_INPUT_CONFIG];
  }
  return [];
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
  if (targetType === "ai-text") {
    return isAiTextInputSourceType(sourceType);
  }
  if (targetType === "mixer") {
    return MIXER_SOURCE_NODE_TYPES.has(sourceType);
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

export function resolveRepeatingInputHandleTopPercent(
  index: number,
  count: number,
  range: readonly [number, number] = [20, 80],
): number {
  if (count <= 1) {
    return roundHandleTopPercent((range[0] + range[1]) / 2);
  }

  return roundHandleTopPercent(range[0] + ((range[1] - range[0]) * (index + 1)) / (count + 1));
}

function isInstructionAiTextHandle(handle: string | null | undefined): boolean {
  return typeof handle === "string" && handle.startsWith(AI_TEXT_INSTRUCTION_INPUT_BASE_HANDLE_ID);
}

function isDraftAiTextHandle(handle: string | null | undefined): boolean {
  return (
    handle == null ||
    handle === "" ||
    handle === "null" ||
    (typeof handle === "string" &&
      handle.startsWith(AI_TEXT_DRAFT_INPUT_BASE_HANDLE_ID) &&
      !isInstructionAiTextHandle(handle))
  );
}

function getRepeatingInputConfigForHandle(args: {
  targetType: string | undefined;
  targetHandle?: string | null;
}): RepeatingInputConfig | null {
  const configs = getRepeatingInputConfigs(args.targetType);
  if (configs.length === 0) {
    return null;
  }

  if (args.targetType === "ai-text") {
    if (isInstructionAiTextHandle(args.targetHandle)) {
      return AI_TEXT_INSTRUCTION_INPUT_CONFIG;
    }
    if (isDraftAiTextHandle(args.targetHandle)) {
      return AI_TEXT_DRAFT_INPUT_CONFIG;
    }
    return null;
  }

  return configs[0] ?? null;
}

function getRepeatingBodyDropConfig(targetType: string | undefined): RepeatingInputConfig | null {
  const configs = getRepeatingInputConfigs(targetType);
  return configs.find((config) => config.defaultForBodyDrop) ?? configs[0] ?? null;
}

function edgeMatchesRepeatingConfig(
  edge: RepeatingInputEdgeLike,
  sourceType: string,
  targetType: string,
  config: RepeatingInputConfig,
): boolean {
  if (targetType !== "ai-text") {
    return true;
  }
  if (config.baseHandleId === AI_TEXT_INSTRUCTION_INPUT_BASE_HANDLE_ID) {
    return isInstructionAiTextHandle(edge.targetHandle) && isAiTextInstructionSourceType(sourceType);
  }
  if (config.baseHandleId === AI_TEXT_DRAFT_INPUT_BASE_HANDLE_ID) {
    return isDraftAiTextHandle(edge.targetHandle) && isAiTextDraftSourceType(sourceType);
  }
  return false;
}

function collectRepeatingInputEdges(args: {
  nodeType: string;
  nodeId: string;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
  config: RepeatingInputConfig;
}): RepeatingInputEdgeLike[] {
  return args.edges.filter((edge) => {
    if (!isVisibleEdge(edge) || edge.target !== args.nodeId) {
      return false;
    }

    const sourceType = nodeTypeForId(args.nodeTypeById, edge.source);
    return (
      isRepeatingSourceForTarget(sourceType, args.nodeType) &&
      edgeMatchesRepeatingConfig(edge, sourceType, args.nodeType, args.config)
    );
  });
}

function canAcceptAiTextSourceForConfig(
  sourceType: string,
  config: RepeatingInputConfig,
): boolean {
  if (config.baseHandleId === AI_TEXT_INSTRUCTION_INPUT_BASE_HANDLE_ID) {
    return isAiTextInstructionSourceType(sourceType);
  }
  if (config.baseHandleId === AI_TEXT_DRAFT_INPUT_BASE_HANDLE_ID) {
    return isAiTextDraftSourceType(sourceType);
  }
  return false;
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
  return visualCount < MAX_AI_IMAGE_REFERENCES || textCount < MAX_PROMPT_TEXT_INPUTS;
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
    return textCount < MAX_PROMPT_TEXT_INPUTS;
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

  const config = getRepeatingBodyDropConfig(args.targetType);
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

  const config = getRepeatingBodyDropConfig(args.targetType);
  if (args.targetType === "ai-text" && config) {
    return (
      canAcceptAiTextSourceForConfig(args.sourceType, config) &&
      args.edges.length < config.maxSlots
    );
  }
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
  const configs = getRepeatingInputConfigs(args.nodeType);
  if (configs.length === 0) {
    return [];
  }

  return configs.flatMap((config) => {
    const occupiedEdges = collectRepeatingInputEdges({ ...args, config }).slice(0, config.maxSlots);
    const includeFreeHandle =
      args.nodeType === "ai-text"
        ? occupiedEdges.length < config.maxSlots
        : canAcceptAnyRepeatingInput({
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
        topPercent: resolveRepeatingInputHandleTopPercent(index, visibleCount, config.topRange),
      };
    });
  });
}

export function resolveNextRepeatingInputHandleId(args: {
  sourceType: string;
  targetType: string;
  targetNodeId: string;
  targetHandle?: string | null;
  edges: readonly RepeatingInputEdgeLike[];
  nodeTypeById: NodeTypeLookup;
}): string | null | undefined {
  const config =
    args.targetHandle !== undefined
      ? getRepeatingInputConfigForHandle({
          targetType: args.targetType,
          targetHandle: args.targetHandle,
        })
      : getRepeatingBodyDropConfig(args.targetType);
  if (!config) {
    return undefined;
  }
  if (
    args.targetType === "ai-text" &&
    !canAcceptAiTextSourceForConfig(args.sourceType, config)
  ) {
    return null;
  }

  const occupiedEdges = collectRepeatingInputEdges({
    nodeType: args.targetType,
    nodeId: args.targetNodeId,
    edges: args.edges,
    nodeTypeById: args.nodeTypeById,
    config,
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
    const config = getRepeatingInputConfigForHandle({
      targetType,
      targetHandle: edge.targetHandle,
    });
    if (!config || !isVisibleEdge(edge)) {
      return;
    }

    const sourceType = nodeTypeForId(nodeTypeById, edge.source);
    if (!isRepeatingSourceForTarget(sourceType, targetType)) {
      return;
    }
    if (targetType === "ai-text" && !canAcceptAiTextSourceForConfig(sourceType, config)) {
      return;
    }

    const groupKey = `${edge.target}:${config.baseHandleId}`;
    const bucket = groupedEdgeIndexesByTarget.get(groupKey);
    if (bucket) {
      bucket.push(index);
    } else {
      groupedEdgeIndexesByTarget.set(groupKey, [index]);
    }
  });

  for (const [groupKey, edgeIndexes] of groupedEdgeIndexesByTarget) {
    const [targetNodeId, baseHandleId] = groupKey.split(":");
    const targetType = nodeTypeForId(nodeTypeById, targetNodeId);
    const config = getRepeatingInputConfigs(targetType).find(
      (candidate) => candidate.baseHandleId === baseHandleId,
    );
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
