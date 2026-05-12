/**
 * Shared utilities for user-visible AI run progress. These types describe safe
 * operational phases and tool traces, not private model reasoning.
 */

export type AiRunPhase =
  | "preparing"
  | "reading-context"
  | "streaming"
  | "calling-tools"
  | "finalizing"
  | "done"
  | "error";

export type AiRunEventStatus = "pending" | "running" | "success" | "error";

export type AiRunEvent = {
  id: string;
  phase: AiRunPhase;
  message: string;
  createdAt: number;
  status: AiRunEventStatus;
};

export type ToolCallTraceStatus = "running" | "success" | "error";
export type ToolCallTraceCategory = "read" | "create" | "update" | "other";

export type ToolCallTrace = {
  id: string;
  toolName: string;
  category: ToolCallTraceCategory;
  message: string;
  status: ToolCallTraceStatus;
  startedAt: number;
  finishedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
};

const SAFE_PHASES = new Set<AiRunPhase>([
  "preparing",
  "reading-context",
  "streaming",
  "calling-tools",
  "finalizing",
  "done",
  "error",
]);

const SAFE_EVENT_STATUSES = new Set<AiRunEventStatus>([
  "pending",
  "running",
  "success",
  "error",
]);

const SAFE_TOOL_STATUSES = new Set<ToolCallTraceStatus>([
  "running",
  "success",
  "error",
]);

export const MAX_AI_RUN_EVENTS = 12;
export const MAX_TOOL_CALL_TRACES = 12;
export const MAX_TOOL_DETAIL_JSON_CHARS = 600;
export const MAX_TOOL_ERROR_CHARS = 280;
export const MAX_RUN_EVENT_MESSAGE_CHARS = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? truncateString(trimmed, maxLength) : null;
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function summarizeToolName(toolName: string): string {
  const words = toolName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1).toLowerCase()}` : toolName;
}

export function getToolCallCategory(toolName: string): ToolCallTraceCategory {
  if (toolName.startsWith("read_") || toolName.startsWith("get_")) {
    return "read";
  }
  if (toolName.startsWith("create_")) {
    return "create";
  }
  if (toolName.startsWith("update_") || toolName.startsWith("set_")) {
    return "update";
  }
  return "other";
}

export function boundToolDetail(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return undefined;
    }
    if (serialized.length <= MAX_TOOL_DETAIL_JSON_CHARS) {
      return value;
    }
    return {
      truncated: true,
      preview: truncateString(serialized, MAX_TOOL_DETAIL_JSON_CHARS),
    };
  } catch {
    return {
      truncated: true,
      preview: truncateString(String(value), MAX_TOOL_DETAIL_JSON_CHARS),
    };
  }
}

export function createAiRunEvent(args: {
  phase: AiRunPhase;
  message: string;
  createdAt?: number;
  id?: string;
  status?: AiRunEventStatus;
}): AiRunEvent {
  return {
    id: args.id ?? randomId("event"),
    phase: args.phase,
    message: truncateString(args.message.trim(), MAX_RUN_EVENT_MESSAGE_CHARS),
    createdAt: args.createdAt ?? Date.now(),
    status: args.status ?? "running",
  };
}

export function normalizeAiRunEvents(value: unknown): AiRunEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: AiRunEvent[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = normalizeText(item.id, 120);
    const message = normalizeText(item.message, MAX_RUN_EVENT_MESSAGE_CHARS);
    const createdAt = normalizeTimestamp(item.createdAt);
    const phase = item.phase;
    if (!id || !message || createdAt === null || !SAFE_PHASES.has(phase as AiRunPhase)) {
      continue;
    }
    const status = SAFE_EVENT_STATUSES.has(item.status as AiRunEventStatus)
      ? (item.status as AiRunEventStatus)
      : "running";
    events.push({
      id,
      phase: phase as AiRunPhase,
      message,
      createdAt,
      status,
    });
  }

  return events.slice(-MAX_AI_RUN_EVENTS);
}

export function appendAiRunEvent(
  events: readonly AiRunEvent[] | undefined,
  event: Parameters<typeof createAiRunEvent>[0],
): AiRunEvent[] {
  return normalizeAiRunEvents([...(events ?? []), createAiRunEvent(event)]);
}

export function createToolCallTrace(args: {
  id: string;
  toolName: string;
  status?: ToolCallTraceStatus;
  startedAt?: number;
  input?: unknown;
  message?: string;
}): ToolCallTrace {
  const toolName = args.toolName.trim();
  return {
    id: args.id.trim() || randomId("tool"),
    toolName,
    category: getToolCallCategory(toolName),
    message: args.message?.trim() || summarizeToolName(toolName),
    status: args.status ?? "running",
    startedAt: args.startedAt ?? Date.now(),
    input: boundToolDetail(args.input),
  };
}

export function completeToolCallTrace(
  trace: ToolCallTrace,
  args: {
    status: ToolCallTraceStatus;
    finishedAt?: number;
    output?: unknown;
    error?: string;
  },
): ToolCallTrace {
  return {
    ...trace,
    status: args.status,
    finishedAt: args.finishedAt ?? Date.now(),
    output: boundToolDetail(args.output),
    error: args.error ? truncateString(args.error.trim(), MAX_TOOL_ERROR_CHARS) : undefined,
  };
}

export function normalizeToolCallTraces(value: unknown): ToolCallTrace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const traces: ToolCallTrace[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = normalizeText(item.id, 120);
    const toolName = normalizeText(item.toolName, 120);
    const startedAt = normalizeTimestamp(item.startedAt);
    if (!id || !toolName || startedAt === null) {
      continue;
    }
    const status = SAFE_TOOL_STATUSES.has(item.status as ToolCallTraceStatus)
      ? (item.status as ToolCallTraceStatus)
      : "running";
    const finishedAt = normalizeTimestamp(item.finishedAt);
    const message = normalizeText(item.message, 180) ?? summarizeToolName(toolName);
    const error = normalizeText(item.error, MAX_TOOL_ERROR_CHARS) ?? undefined;

    const trace: ToolCallTrace = {
      id,
      toolName,
      category: getToolCallCategory(toolName),
      message,
      status,
      startedAt,
      ...(finishedAt !== null ? { finishedAt } : {}),
      ...(error ? { error } : {}),
    };
    const input = boundToolDetail(item.input);
    const output = boundToolDetail(item.output);
    if (input !== undefined) {
      trace.input = input;
    }
    if (output !== undefined) {
      trace.output = output;
    }
    traces.push(trace);
  }

  return traces.slice(-MAX_TOOL_CALL_TRACES);
}

export function upsertToolCallTrace(
  traces: readonly ToolCallTrace[] | undefined,
  trace: ToolCallTrace,
): ToolCallTrace[] {
  const existing = normalizeToolCallTraces(traces ?? []);
  const index = existing.findIndex((item) => item.id === trace.id);
  const next = index >= 0
    ? existing.map((item, itemIndex) => (itemIndex === index ? trace : item))
    : [...existing, trace];
  return normalizeToolCallTraces(next);
}
