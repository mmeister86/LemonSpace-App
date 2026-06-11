/**
 * Onboarding note:
 * Convex backend module for agent instagram harness. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import type {
  AgentHarnessParsedToolCall,
  AgentHarnessTool,
  AgentHarnessToolResult,
} from "../lib/agent-harness";
import {
  INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
  INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
  INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
  INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
  INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
} from "../lib/instagram-post-mockup";

export type InstagramHarnessToolState = {
  postPackageCreated: boolean;
};

export type InstagramConnectedContextResult = {
  nodes: Array<{
    nodeId: string;
    type: string;
    fields: Record<string, unknown>;
  }>;
};

export type InstagramHarnessToolOps = {
  readConnectedContext: () => Promise<InstagramConnectedContextResult>;
  createInstagramPostPackage: (
    args: Record<string, unknown>,
  ) => Promise<{
    nodeId: string;
    fieldNodeIds: Partial<Record<InstagramPostPackageFieldRole, string>>;
  }>;
};

export type InstagramPostPackageFieldRole =
  | "caption"
  | "hashtags"
  | "cta"
  | "altText";

type InstagramPostPackagePersistedFieldRole =
  | "caption"
  | "hashtags"
  | "cta"
  | "alt-text";

export type InstagramPostPackageFieldArtifact = {
  role: InstagramPostPackageFieldRole;
  persistedRole: InstagramPostPackagePersistedFieldRole;
  type: "text";
  targetHandle:
    | typeof INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_CTA_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE;
  data: Record<string, unknown>;
};

export type InstagramPostPackageCropArtifact = {
  type: "crop";
  data: Record<string, unknown>;
};

export type InstagramPostPackageArtifacts = {
  fieldNodes: InstagramPostPackageFieldArtifact[];
  mockupNode: {
    type: "instagram-post-mockup";
    data: Record<string, unknown>;
  };
  mockupBindings: Array<{
    role: InstagramPostPackageFieldRole;
    targetHandle: InstagramPostPackageFieldArtifact["targetHandle"];
  }>;
  cropNode: InstagramPostPackageCropArtifact | null;
  cropBinding: {
    sourceNodeId: string;
  } | null;
  visualBinding: {
    source: "crop";
    targetHandle: typeof INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE;
  } | null;
};

const INSTAGRAM_FEED_CROP_ASPECT = 4 / 5;
const INSTAGRAM_FEED_CROP_WIDTH = 1080;
const INSTAGRAM_FEED_CROP_HEIGHT = 1350;
const CROP_RATIO_PRECISION = 6;
const VISUAL_SOURCE_PRIORITY: Record<string, number> = {
  render: 50,
  "ai-image": 40,
  asset: 30,
  image: 20,
  "agent-output": 10,
};

type ConnectedImageCandidate = {
  nodeId: string;
  type: string;
  imageUrl?: string;
  storageId?: string;
  width?: number;
  height?: number;
  priority: number;
  contextIndex: number;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromRecord(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumberFromRecord(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = numberFromRecord(record, key);
  return value !== undefined && value > 0 ? value : undefined;
}

function readContextDimension(
  fields: Record<string, unknown>,
  key: "width" | "height",
): number | undefined {
  const direct = positiveNumberFromRecord(fields, key);
  if (direct !== undefined) {
    return direct;
  }

  const intrinsicKey = key === "width" ? "intrinsicWidth" : "intrinsicHeight";
  return positiveNumberFromRecord(fields, intrinsicKey);
}

function connectedImageCandidateFromContextNode(
  node: InstagramConnectedContextResult["nodes"][number],
  contextIndex: number,
): ConnectedImageCandidate | null {
  const priority = VISUAL_SOURCE_PRIORITY[node.type] ?? 0;
  if (priority <= 0) {
    return null;
  }

  const imageUrl = trimText(node.fields.url) || trimText(node.fields.imageUrl);
  const storageId = trimText(node.fields.storageId);
  if (!imageUrl && !storageId && node.type !== "render") {
    return null;
  }

  return {
    nodeId: node.nodeId,
    type: node.type,
    priority,
    contextIndex,
    ...(imageUrl ? { imageUrl } : {}),
    ...(storageId ? { storageId } : {}),
    ...(readContextDimension(node.fields, "width") !== undefined
      ? { width: readContextDimension(node.fields, "width") }
      : {}),
    ...(readContextDimension(node.fields, "height") !== undefined
      ? { height: readContextDimension(node.fields, "height") }
      : {}),
  };
}

function selectBestConnectedImage(
  context: InstagramConnectedContextResult,
  requestedNodeId: string,
): ConnectedImageCandidate | null {
  const candidates = context.nodes
    .map((node, index) => connectedImageCandidateFromContextNode(node, index))
    .filter((candidate): candidate is ConnectedImageCandidate => candidate !== null);

  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const priorityCompare = right.priority - left.priority;
    if (priorityCompare !== 0) {
      return priorityCompare;
    }

    if (requestedNodeId) {
      const leftRequested = left.nodeId === requestedNodeId ? 1 : 0;
      const rightRequested = right.nodeId === requestedNodeId ? 1 : 0;
      const requestedCompare = rightRequested - leftRequested;
      if (requestedCompare !== 0) {
        return requestedCompare;
      }
    }

    return left.contextIndex - right.contextIndex;
  });

  return sorted[0] ?? null;
}

function buildCenteredInstagramCropRect(args: {
  width?: number;
  height?: number;
}): { x: number; y: number; width: number; height: number } {
  if (!args.width || !args.height) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const sourceAspect = args.width / args.height;
  if (!Number.isFinite(sourceAspect) || sourceAspect <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  if (sourceAspect > INSTAGRAM_FEED_CROP_ASPECT) {
    const width = INSTAGRAM_FEED_CROP_ASPECT / sourceAspect;
    return {
      x: roundCropRatio((1 - width) / 2),
      y: 0,
      width: roundCropRatio(width),
      height: 1,
    };
  }

  const height = sourceAspect / INSTAGRAM_FEED_CROP_ASPECT;
  return {
    x: 0,
    y: roundCropRatio((1 - height) / 2),
    width: 1,
    height: roundCropRatio(height),
  };
}

function roundCropRatio(value: number): number {
  return Number(value.toFixed(CROP_RATIO_PRECISION));
}

export function resolveInstagramPostPackageArgs(
  raw: Record<string, unknown>,
  context: InstagramConnectedContextResult,
): Record<string, unknown> {
  const requestedImageNodeId = trimText(raw.selectedImageNodeId);
  const connectedImage = selectBestConnectedImage(context, requestedImageNodeId);
  const sourceNodeIds = normalizeStringList(raw.sourceNodeIds);
  const syntheticPreviewFields = normalizeStringList(raw.syntheticPreviewFields);
  const explicitImageUrl = syntheticPreviewFields.includes("imageUrl")
    ? ""
    : trimText(raw.imageUrl);
  const profileImageUrl = syntheticPreviewFields.includes("profileImageUrl")
    ? ""
    : trimText(raw.profileImageUrl);
  const imageUrl = explicitImageUrl || connectedImage?.imageUrl || "";
  const selectedImageNodeId = connectedImage?.nodeId || "";
  const selectedImageStorageId =
    trimText(raw.selectedImageStorageId) || connectedImage?.storageId || "";
  const selectedImageWidth =
    positiveNumberFromRecord(raw, "selectedImageWidth") ?? connectedImage?.width;
  const selectedImageHeight =
    positiveNumberFromRecord(raw, "selectedImageHeight") ?? connectedImage?.height;

  const normalized: Record<string, unknown> = {
    ...raw,
    username: trimText(raw.username) || "lemonspace",
    caption: trimText(raw.caption),
    hashtags: normalizeStringList(raw.hashtags),
    cta: trimText(raw.cta),
    altText: trimText(raw.altText),
    visualPrompt: trimText(raw.visualPrompt),
    assumptions: normalizeStringList(raw.assumptions),
    syntheticPreviewFields,
    sourceNodeIds:
      sourceNodeIds.length > 0
        ? sourceNodeIds
        : selectedImageNodeId
          ? [selectedImageNodeId]
          : context.nodes.map((node) => node.nodeId),
    ...(trimText(raw.location) ? { location: trimText(raw.location) } : {}),
    ...(profileImageUrl ? { profileImageUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(selectedImageNodeId ? { selectedImageNodeId } : {}),
    ...(selectedImageStorageId ? { selectedImageStorageId } : {}),
    ...(selectedImageWidth ? { selectedImageWidth } : {}),
    ...(selectedImageHeight ? { selectedImageHeight } : {}),
    ...(numberFromRecord(raw, "likesCount") !== undefined
      ? { likesCount: numberFromRecord(raw, "likesCount") }
      : {}),
  };
  if (!imageUrl) {
    delete normalized.imageUrl;
  }
  if (!profileImageUrl) {
    delete normalized.profileImageUrl;
  }
  return normalized;
}

export const resolveInstagramOutputArgs = resolveInstagramPostPackageArgs;

export function buildInstagramPostPackageArtifacts(args: {
  agentNodeId: string;
  runId: string;
  data: Record<string, unknown>;
}): InstagramPostPackageArtifacts {
  const sourceNodeIds = normalizeStringList(args.data.sourceNodeIds);
  const hashtags = normalizeStringList(args.data.hashtags);
  const syntheticPreviewFields = normalizeStringList(args.data.syntheticPreviewFields);
  const assumptions = normalizeStringList(args.data.assumptions);
  const caption = trimText(args.data.caption);
  const cta = trimText(args.data.cta);
  const altText = trimText(args.data.altText);
  const visualPrompt = trimText(args.data.visualPrompt);
  const username = trimText(args.data.username) || "lemonspace";
  const location = trimText(args.data.location) || "Preview location";
  const imageUrl = trimText(args.data.imageUrl);
  const profileImageUrl = syntheticPreviewFields.includes("profileImageUrl")
    ? ""
    : trimText(args.data.profileImageUrl);
  const selectedImageNodeId = trimText(args.data.selectedImageNodeId);
  const cropRect = buildCenteredInstagramCropRect({
    width: positiveNumberFromRecord(args.data, "selectedImageWidth"),
    height: positiveNumberFromRecord(args.data, "selectedImageHeight"),
  });
  const baseFieldData = {
    agentNodeId: args.agentNodeId,
    runId: args.runId,
    sourceNodeIds,
  };
  const fieldNodes: InstagramPostPackageFieldArtifact[] = [
    {
      role: "caption",
      persistedRole: "caption",
      type: "text",
      targetHandle: INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
      data: {
        ...baseFieldData,
        instagramFieldRole: "caption",
        content: caption,
      },
    },
    {
      role: "hashtags",
      persistedRole: "hashtags",
      type: "text",
      targetHandle: INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
      data: {
        ...baseFieldData,
        instagramFieldRole: "hashtags",
        content: hashtags.join(" "),
      },
    },
    {
      role: "cta",
      persistedRole: "cta",
      type: "text",
      targetHandle: INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
      data: {
        ...baseFieldData,
        instagramFieldRole: "cta",
        content: cta,
      },
    },
    {
      role: "altText",
      persistedRole: "alt-text",
      type: "text",
      targetHandle: INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
      data: {
        ...baseFieldData,
        instagramFieldRole: "alt-text",
        content: altText,
      },
    },
  ];
  const cropNode: InstagramPostPackageCropArtifact | null = selectedImageNodeId
    ? {
        type: "crop",
        data: {
          ...baseFieldData,
          instagramFieldRole: "visual-crop",
          crop: cropRect,
          resize: {
            mode: "custom",
            width: INSTAGRAM_FEED_CROP_WIDTH,
            height: INSTAGRAM_FEED_CROP_HEIGHT,
            fit: "cover",
            keepAspect: true,
          },
        },
      }
    : null;

  return {
    fieldNodes,
    mockupNode: {
      type: "instagram-post-mockup",
      data: {
        title: "Instagram post mockup",
        channel: "Instagram Feed",
        agentNodeId: args.agentNodeId,
        runId: args.runId,
        sourceNodeIds,
        selectedImageNodeId,
        syntheticPreviewFields,
        assumptions,
        snapshot: {
          username,
          location,
          ...(profileImageUrl ? { profileImageUrl } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          isLiked: true,
          likesCount: numberFromRecord(args.data, "likesCount") ?? 128,
          caption,
          hashtags,
          cta,
          altText,
          visualPrompt,
        },
      },
    },
    mockupBindings: fieldNodes.map((fieldNode) => ({
      role: fieldNode.role,
      targetHandle: fieldNode.targetHandle,
    })),
    cropNode,
    cropBinding: selectedImageNodeId
      ? {
          sourceNodeId: selectedImageNodeId,
        }
      : null,
    visualBinding: cropNode
      ? {
          source: "crop",
          targetHandle: INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
        }
      : null,
  };
}

export const INSTAGRAM_AGENT_TOOLS: AgentHarnessTool[] = [
  {
    name: "read_connected_context",
    description:
      "Read the directly connected LemonSpace canvas context for this Instagram agent run.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "create_instagram_post_package",
    description:
      "Create one editable Instagram post package: field nodes, optional 4:5 visual crop, live mockup node, and bindings.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["caption", "hashtags", "cta", "altText", "visualPrompt"],
      properties: {
        username: { type: "string" },
        location: { type: "string" },
        profileImageUrl: { type: "string" },
        imageUrl: { type: "string" },
        likesCount: { type: "number" },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
        altText: { type: "string" },
        visualPrompt: { type: "string" },
        aspectRatio: { type: "string" },
        selectedImageNodeId: { type: "string" },
        selectedImageStorageId: { type: "string" },
        selectedImageWidth: { type: "number" },
        selectedImageHeight: { type: "number" },
        sourceNodeIds: { type: "array", items: { type: "string" } },
        syntheticPreviewFields: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
  },
];

export function createInstagramHarnessToolState(): InstagramHarnessToolState {
  return {
    postPackageCreated: false,
  };
}

function oncePerRun(
  alreadyCalled: boolean,
  toolName: string,
): AgentHarnessToolResult | null {
  if (!alreadyCalled) {
    return null;
  }

  return {
    ok: false,
    error: `${toolName} may only be called once per run`,
  };
}

export async function executeInstagramHarnessTool(args: {
  state: InstagramHarnessToolState;
  call: AgentHarnessParsedToolCall;
  ops: InstagramHarnessToolOps;
}): Promise<AgentHarnessToolResult> {
  switch (args.call.name) {
    case "read_connected_context":
      return {
        ok: true,
        result: await args.ops.readConnectedContext(),
      };

    case "create_instagram_post_package": {
      const limitResult = oncePerRun(
        args.state.postPackageCreated,
        args.call.name,
      );
      if (limitResult) {
        return limitResult;
      }
      args.state.postPackageCreated = true;
      return {
        ok: true,
        result: await args.ops.createInstagramPostPackage(args.call.arguments),
      };
    }

    default:
      return {
        ok: false,
        error: `Unsupported Instagram harness tool: ${args.call.name}`,
      };
  }
}
