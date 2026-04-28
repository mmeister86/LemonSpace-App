import type { SourcePreviewMeta } from "./image-transform-node-types";

export function getSourcePreviewMeta(args: {
  nodeId: string;
  targetHandle?: string;
  edges: Array<{ source: string; target: string; targetHandle?: string | null }>;
  nodes: Array<{ id: string; type?: string; data?: unknown }>;
}): SourcePreviewMeta | null {
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
