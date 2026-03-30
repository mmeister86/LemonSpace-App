import type { Edge, Node } from "@xyflow/react";

export type AdjustmentNodeType =
  | "curves"
  | "color-adjust"
  | "light-adjust"
  | "detail-adjust";

export type PipelineStep = {
  nodeId: string;
  type: AdjustmentNodeType;
  params: Record<string, unknown>;
};

const ADJUSTMENT_TYPES = new Set<AdjustmentNodeType>([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

const IMAGE_SOURCE_TYPES = new Set(["image", "ai-image", "render"]);

export function isAdjustmentNodeType(type: string): type is AdjustmentNodeType {
  return ADJUSTMENT_TYPES.has(type as AdjustmentNodeType);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(record[k])}`).join(",")}}`;
}

function findNode(nodes: Node[], nodeId: string): Node | undefined {
  return nodes.find((node) => node.id === nodeId);
}

function getSingleIncomingEdge(edges: Edge[], nodeId: string): Edge | undefined {
  return edges.find((edge) => edge.target === nodeId);
}

function getSourceUrlFromNode(node: Node): string | null {
  if (!IMAGE_SOURCE_TYPES.has(node.type ?? "")) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return typeof data.url === "string" ? data.url : null;
}

function collectPipelineInternal(
  nodeId: string,
  edges: Edge[],
  nodes: Node[],
  visited: Set<string>,
): PipelineStep[] {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const incomingEdge = getSingleIncomingEdge(edges, nodeId);
  if (!incomingEdge) return [];

  const sourceNode = findNode(nodes, incomingEdge.source);
  if (!sourceNode) return [];

  const upstream = collectPipelineInternal(sourceNode.id, edges, nodes, visited);

  if (sourceNode.type && isAdjustmentNodeType(sourceNode.type)) {
    return [
      ...upstream,
      {
        nodeId: sourceNode.id,
        type: sourceNode.type,
        params: (sourceNode.data ?? {}) as Record<string, unknown>,
      },
    ];
  }

  return upstream;
}

function getSourceImageInternal(
  nodeId: string,
  edges: Edge[],
  nodes: Node[],
  visited: Set<string>,
): string | null {
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);

  const incomingEdge = getSingleIncomingEdge(edges, nodeId);
  if (!incomingEdge) return null;

  const sourceNode = findNode(nodes, incomingEdge.source);
  if (!sourceNode) return null;

  const ownUrl = getSourceUrlFromNode(sourceNode);
  if (ownUrl) return ownUrl;

  return getSourceImageInternal(sourceNode.id, edges, nodes, visited);
}

export function collectPipeline(
  nodeId: string,
  edges: Edge[],
  nodes: Node[],
): PipelineStep[] {
  return collectPipelineInternal(nodeId, edges, nodes, new Set<string>());
}

export function getSourceImage(
  nodeId: string,
  edges: Edge[],
  nodes: Node[],
): string | null {
  return getSourceImageInternal(nodeId, edges, nodes, new Set<string>());
}

export function hashPipeline(
  nodeId: string,
  edges: Edge[],
  nodes: Node[],
): string {
  const payload = {
    sourceUrl: getSourceImage(nodeId, edges, nodes),
    steps: collectPipeline(nodeId, edges, nodes),
  };
  return stableJson(payload);
}
