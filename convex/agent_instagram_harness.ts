import type {
  AgentHarnessParsedToolCall,
  AgentHarnessTool,
  AgentHarnessToolResult,
} from "../lib/agent-harness";

export type InstagramHarnessToolState = {
  instagramOutputCreated: boolean;
  textNodeCreated: boolean;
  promptNodeCreated: boolean;
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
  createInstagramOutput: (args: Record<string, unknown>) => Promise<{ nodeId: string }>;
  createTextNode: (args: Record<string, unknown>) => Promise<{ nodeId: string }>;
  createPromptNode: (args: Record<string, unknown>) => Promise<{ nodeId: string }>;
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

export function resolveInstagramOutputArgs(
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
    ...(trimText(raw.cta) ? { cta: trimText(raw.cta) } : {}),
    ...(trimText(raw.altText) ? { altText: trimText(raw.altText) } : {}),
    ...(numberFromRecord(raw, "likesCount") !== undefined
      ? { likesCount: numberFromRecord(raw, "likesCount") }
      : {}),
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
    name: "create_instagram_output",
    description:
      "Create the single Instagram post preview output node for this run.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["username", "caption", "hashtags"],
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
        sourceNodeIds: { type: "array", items: { type: "string" } },
        syntheticPreviewFields: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "create_text_node",
    description:
      "Create the single supporting text node with caption variants, rationale, or publishing notes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: {
        title: { type: "string" },
        content: { type: "string" },
      },
    },
  },
  {
    name: "create_prompt_node",
    description:
      "Create the single supporting prompt node for a follow-up visual iteration.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        aspectRatio: { type: "string" },
      },
    },
  },
];

export function createInstagramHarnessToolState(): InstagramHarnessToolState {
  return {
    instagramOutputCreated: false,
    textNodeCreated: false,
    promptNodeCreated: false,
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

    case "create_instagram_output": {
      const limitResult = oncePerRun(
        args.state.instagramOutputCreated,
        args.call.name,
      );
      if (limitResult) {
        return limitResult;
      }
      args.state.instagramOutputCreated = true;
      return {
        ok: true,
        result: await args.ops.createInstagramOutput(args.call.arguments),
      };
    }

    case "create_text_node": {
      const limitResult = oncePerRun(args.state.textNodeCreated, args.call.name);
      if (limitResult) {
        return limitResult;
      }
      args.state.textNodeCreated = true;
      return {
        ok: true,
        result: await args.ops.createTextNode(args.call.arguments),
      };
    }

    case "create_prompt_node": {
      const limitResult = oncePerRun(args.state.promptNodeCreated, args.call.name);
      if (limitResult) {
        return limitResult;
      }
      args.state.promptNodeCreated = true;
      return {
        ok: true,
        result: await args.ops.createPromptNode(args.call.arguments),
      };
    }

    default:
      return {
        ok: false,
        error: `Unsupported Instagram harness tool: ${args.call.name}`,
      };
  }
}
