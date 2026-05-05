export type TextStreamRequest = {
  canvasId: string;
  sourceNodeId: string;
  outputNodeId: string;
  modelId: string;
  instruction?: string;
  inputText?: string;
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
