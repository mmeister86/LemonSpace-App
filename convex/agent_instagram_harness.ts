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
  INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
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
  | "altText"
  | "visualPrompt";

type InstagramPostPackagePersistedFieldRole =
  | "caption"
  | "hashtags"
  | "cta"
  | "alt-text"
  | "visual-prompt";

export type InstagramPostPackageFieldArtifact = {
  role: InstagramPostPackageFieldRole;
  persistedRole: InstagramPostPackagePersistedFieldRole;
  type: "text" | "prompt";
  targetHandle:
    | typeof INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_CTA_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE
    | typeof INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE;
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
  visualBinding: {
    sourceNodeId: string;
    targetHandle: typeof INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE;
  } | null;
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

function findFirstConnectedImage(
  context: InstagramConnectedContextResult,
): { nodeId: string; imageUrl: string; storageId?: string } | null {
  for (const node of context.nodes) {
    if (!["image", "asset", "render", "ai-image", "agent-output"].includes(node.type)) {
      continue;
    }

    const imageUrl = trimText(node.fields.url) || trimText(node.fields.imageUrl);
    if (!imageUrl) {
      continue;
    }

    const storageId = trimText(node.fields.storageId);
    return {
      nodeId: node.nodeId,
      imageUrl,
      ...(storageId ? { storageId } : {}),
    };
  }

  return null;
}

export function resolveInstagramPostPackageArgs(
  raw: Record<string, unknown>,
  context: InstagramConnectedContextResult,
): Record<string, unknown> {
  const connectedImage = findFirstConnectedImage(context);
  const explicitImageUrl = trimText(raw.imageUrl);
  const sourceNodeIds = normalizeStringList(raw.sourceNodeIds);
  const syntheticPreviewFields = normalizeStringList(raw.syntheticPreviewFields);
  const imageUrl = explicitImageUrl || connectedImage?.imageUrl || "";
  const selectedImageNodeId =
    trimText(raw.selectedImageNodeId) || connectedImage?.nodeId || "";
  const selectedImageStorageId =
    trimText(raw.selectedImageStorageId) || connectedImage?.storageId || "";

  return {
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
    ...(trimText(raw.profileImageUrl)
      ? { profileImageUrl: trimText(raw.profileImageUrl) }
      : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(selectedImageNodeId ? { selectedImageNodeId } : {}),
    ...(selectedImageStorageId ? { selectedImageStorageId } : {}),
    ...(numberFromRecord(raw, "likesCount") !== undefined
      ? { likesCount: numberFromRecord(raw, "likesCount") }
      : {}),
  };
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
  const profileImageUrl = trimText(args.data.profileImageUrl);
  const selectedImageNodeId = trimText(args.data.selectedImageNodeId);
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
    {
      role: "visualPrompt",
      persistedRole: "visual-prompt",
      type: "prompt",
      targetHandle: INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
      data: {
        ...baseFieldData,
        instagramFieldRole: "visual-prompt",
        prompt: visualPrompt,
        aspectRatio: trimText(args.data.aspectRatio) || "1:1",
        model: "google/gemini-2.5-flash-image",
      },
    },
  ];

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
    visualBinding: selectedImageNodeId
      ? {
          sourceNodeId: selectedImageNodeId,
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
      "Create one editable Instagram post package: field nodes, visual prompt, live mockup node, and bindings.",
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
