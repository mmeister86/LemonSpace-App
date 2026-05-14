import {
  isAiImageReferenceSourceType,
  type AiImageReferenceSourceType,
} from "@/lib/ai-image-references";
import type { AiTextVisualMode } from "@/lib/ai-stream/text-messages";

export type TextStreamVisualReference = {
  sourceNodeId: string;
  sourceType: AiImageReferenceSourceType;
  label: string;
  storageId?: string;
  imageUrl?: string;
  renderPipelineHash?: string;
};

export type TextStreamRequest = {
  canvasId: string;
  sourceNodeId: string;
  outputNodeId: string;
  modelId: string;
  instruction?: string;
  inputText?: string;
  visualMode?: AiTextVisualMode;
  visualReferences?: TextStreamVisualReference[];
};

export type AgentStreamRequest = {
  canvasId: string;
  nodeId: string;
  modelId: string;
  locale: "de" | "en";
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseVisualMode(value: unknown): AiTextVisualMode | undefined {
  return value === "describe" ? "describe" : value === "context" ? "context" : undefined;
}

function parseVisualReferences(value: unknown): TextStreamVisualReference[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references = value.flatMap((item): TextStreamVisualReference[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const sourceNodeId = optionalString(record.sourceNodeId);
    const sourceTypeRaw = optionalString(record.sourceType);
    const storageId = optionalString(record.storageId);
    const imageUrl = optionalString(record.imageUrl);

    if (!sourceNodeId || !sourceTypeRaw || !isAiImageReferenceSourceType(sourceTypeRaw)) {
      return [];
    }

    if (!storageId && !imageUrl) {
      return [];
    }

    return [
      {
        sourceNodeId,
        sourceType: sourceTypeRaw,
        label: optionalString(record.label) ?? sourceNodeId,
        ...(storageId ? { storageId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(optionalString(record.renderPipelineHash)
          ? { renderPipelineHash: optionalString(record.renderPipelineHash) }
          : {}),
      },
    ];
  });

  return references.length > 0 ? references : undefined;
}

export function parseTextStreamRequest(value: unknown):
  | { ok: true; value: TextStreamRequest }
  | { ok: false; status: 400; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, status: 400, message: "Invalid text stream request" };
  }

  const record = value as Record<string, unknown>;
  const canvasId = optionalString(record.canvasId);
  const sourceNodeId = optionalString(record.sourceNodeId);
  const outputNodeId = optionalString(record.outputNodeId);
  const modelId = optionalString(record.modelId);

  if (!canvasId || !sourceNodeId || !outputNodeId || !modelId) {
    return { ok: false, status: 400, message: "Invalid text stream request" };
  }

  return {
    ok: true,
    value: {
      canvasId,
      sourceNodeId,
      outputNodeId,
      modelId,
      instruction: optionalString(record.instruction),
      inputText: optionalString(record.inputText),
      visualMode: parseVisualMode(record.visualMode),
      visualReferences: parseVisualReferences(record.visualReferences),
    },
  };
}

export function parseAgentStreamRequest(value: unknown):
  | { ok: true; value: AgentStreamRequest }
  | { ok: false; status: 400; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, status: 400, message: "Invalid agent stream request" };
  }

  const record = value as Record<string, unknown>;
  const canvasId = optionalString(record.canvasId);
  const nodeId = optionalString(record.nodeId);
  const modelId = optionalString(record.modelId);
  const locale = record.locale === "en" ? "en" : record.locale === "de" ? "de" : undefined;

  if (!canvasId || !nodeId || !modelId || !locale) {
    return { ok: false, status: 400, message: "Invalid agent stream request" };
  }

  return {
    ok: true,
    value: {
      canvasId,
      nodeId,
      modelId,
      locale,
    },
  };
}
