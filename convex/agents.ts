/**
 * Onboarding note:
 * Runs the two-phase agent workflow: analyze connected context, request clarifications when needed, then execute structured deliverables into agent-output nodes.
 */

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";

import {
  action,
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  generateStructuredObjectViaOpenRouter,
  generateToolChatCompletionViaOpenRouter,
} from "./openrouter";
import { getNodeDataRecord } from "./ai_node_data";
import {
  buildNodeDonePatch,
  buildNodeErrorPatch,
  buildNodeExecutingPatch,
  mergeNodeData,
} from "./node_status_helpers";
import { assertNodeBelongsToCanvasOrThrow } from "./authz_helpers";
import {
  commitInternalReservationIfNeeded,
  decrementConcurrencyIfNeeded,
  releaseInternalReservationBestEffort,
  releasePublicReservationBestEffort,
  startPublicJobCreditFlow,
} from "./job_credit_flow";
import {
  errorMessage,
  formatTerminalStatusMessage,
  getErrorCode,
  getErrorSource,
  getProviderStatus,
} from "./ai_errors";
import {
  areClarificationAnswersComplete,
  buildPreflightClarificationQuestions,
  normalizeAgentBriefConstraints,
  normalizeAgentExecutionPlan,
  normalizeAgentLocale,
  normalizeAgentStructuredOutput,
  type AgentLocale,
  type AgentClarificationAnswerMap,
  type AgentClarificationQuestion,
  type AgentExecutionStep,
  type AgentOutputSection,
  type AgentStructuredOutputDraft,
} from "../lib/agent-run-contract";
import {
  buildAnalyzeMessages,
  buildExecuteMessages,
  summarizeIncomingContext,
  type PromptContextNode,
} from "../lib/agent-prompting";
import { AGENT_DOC_SEGMENTS } from "../lib/generated/agent-doc-segments";
import {
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  isAgentModelAvailableForTier,
  type AgentModel,
} from "../lib/agent-models";
import { getAgentDefinition } from "../lib/agent-definitions";
import { normalizePublicTier } from "../lib/tier-credits";
import {
  runAgentHarnessLoop,
  type AgentHarnessMessage,
} from "../lib/agent-harness";
import { assertConnectionPolicyForTypes } from "./nodes/validation";
import {
  appendAiRunEvent,
  normalizeAiRunEvents,
  normalizeToolCallTraces,
  upsertToolCallTrace,
  type ToolCallTrace,
} from "../lib/ai-run-history";
import {
  buildInstagramPostPackageArtifacts,
  createInstagramHarnessToolState,
  executeInstagramHarnessTool,
  INSTAGRAM_AGENT_TOOLS,
  resolveInstagramPostPackageArgs,
  type InstagramConnectedContextResult,
} from "./agent_instagram_harness";

const ANALYZE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["analysisSummary", "clarificationQuestions", "executionPlan"],
  properties: {
    analysisSummary: { type: "string" },
    clarificationQuestions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "prompt", "required"],
        properties: {
          id: { type: "string" },
          prompt: { type: "string" },
          required: { type: "boolean" },
        },
      },
    },
    executionPlan: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "steps"],
      properties: {
        summary: { type: "string" },
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 6,
           items: {
             type: "object",
             additionalProperties: false,
             required: [
               "id",
               "title",
               "channel",
               "outputType",
               "artifactType",
               "goal",
               "requiredSections",
               "qualityChecks",
             ],
             properties: {
               id: { type: "string" },
               title: { type: "string" },
               channel: { type: "string" },
               outputType: { type: "string" },
               artifactType: { type: "string" },
               goal: { type: "string" },
               requiredSections: {
                 type: "array",
                 items: { type: "string" },
               },
               qualityChecks: {
                 type: "array",
                 items: { type: "string" },
               },
             },
           },
         },
       },
    },
  },
};

function buildExecuteSchema(stepIds: string[]): Record<string, unknown> {
  const sectionSchema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "content"],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      content: { type: "string" },
    },
  };

  const metadataEntrySchema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["key", "values"],
    properties: {
      key: { type: "string" },
      values: {
        type: "array",
        items: { type: "string" },
      },
    },
  };

  const stepOutputProperties: Record<string, unknown> = {};
  for (const stepId of stepIds) {
    stepOutputProperties[stepId] = {
      type: "object",
      additionalProperties: false,
        required: [
          "title",
          "channel",
          "artifactType",
          "previewText",
          "sections",
          "metadataEntries",
          "qualityChecks",
        ],
        properties: {
          title: { type: "string" },
          channel: { type: "string" },
        artifactType: { type: "string" },
        previewText: { type: "string" },
          sections: {
            type: "array",
            items: sectionSchema,
          },
          metadataEntries: {
            type: "array",
            items: metadataEntrySchema,
          },
          qualityChecks: {
            type: "array",
            items: { type: "string" },
        },
      },
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "stepOutputs"],
    properties: {
      summary: { type: "string" },
      stepOutputs: {
        type: "object",
        additionalProperties: false,
        required: stepIds,
        properties: stepOutputProperties,
      },
    },
  };
}

type InternalApiShape = {
  canvasGraph: {
    getInternal: FunctionReference<
      "query",
      "internal",
      { canvasId: Id<"canvases">; userId: string },
      {
        canvas: Doc<"canvases">;
        nodes: Doc<"nodes">[];
        edges: Doc<"edges">[];
      }
    >;
  };
  agents: {
    analyzeAgent: FunctionReference<
      "action",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        streamOutputNodeId?: Id<"nodes">;
        modelId: string;
        locale: AgentLocale;
        userId: string;
        reservationId?: Id<"creditTransactions">;
        shouldDecrementConcurrency: boolean;
      },
      unknown
    >;
    executeAgent: FunctionReference<
      "action",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        modelId: string;
        locale: AgentLocale;
        userId: string;
        reservationId?: Id<"creditTransactions">;
        shouldDecrementConcurrency: boolean;
      },
      unknown
    >;
    runToolHarnessAgent: FunctionReference<
      "action",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        streamOutputNodeId?: Id<"nodes">;
        modelId: string;
        locale: AgentLocale;
        userId: string;
        reservationId?: Id<"creditTransactions">;
        shouldDecrementConcurrency: boolean;
      },
      unknown
    >;
    setAgentAnalyzing: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        modelId: string;
        reservationId?: Id<"creditTransactions">;
        shouldDecrementConcurrency: boolean;
      },
      unknown
    >;
    upsertClarificationAnswers: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        clarificationAnswers: AgentClarificationAnswerMap;
      },
      { answers: AgentClarificationAnswerMap; questions: AgentClarificationQuestion[] }
    >;
    setAgentError: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        statusMessage: string;
      },
      unknown
    >;
    setAgentClarifying: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        clarificationQuestions: AgentClarificationQuestion[];
      },
      unknown
    >;
    setAgentExecuting: FunctionReference<
      "mutation",
      "internal",
      { nodeId: Id<"nodes">; statusMessage?: string },
      unknown
    >;
    appendAgentRunToolTrace: FunctionReference<
      "mutation",
      "internal",
      { nodeId: Id<"nodes">; outputNodeId?: Id<"nodes">; trace: ToolCallTrace },
      unknown
    >;
    createExecutionSkeletonOutputs: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        analysisSummary: string;
        executionPlan: { summary: string; steps: AgentExecutionStep[] };
        definitionVersion?: number;
      },
      { outputNodeIds: Id<"nodes">[] }
    >;
    completeExecutionStepOutput: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        outputNodeId: Id<"nodes">;
        stepId: string;
        stepIndex: number;
        stepTotal: number;
        title: string;
        channel: string;
        outputType: string;
        artifactType: string;
        goal: string;
        requiredSections: string[];
        qualityChecks: string[];
        previewText: string;
        sections: AgentOutputSection[];
        metadata: Record<string, string | string[]>;
        metadataLabels: Record<string, string>;
        body: string;
      },
      unknown
    >;
    finalizeAgentSuccessWithOutputs: FunctionReference<
      "mutation",
      "internal",
      {
        nodeId: Id<"nodes">;
        summary: string;
      },
      { outputNodeIds: Id<"nodes">[] }
    >;
    createInstagramHarnessOutput: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        data: Record<string, unknown>;
      },
      { nodeId: Id<"nodes"> }
    >;
    createInstagramHarnessTextNode: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        data: Record<string, unknown>;
      },
      { nodeId: Id<"nodes"> }
    >;
    createInstagramHarnessPromptNode: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        data: Record<string, unknown>;
      },
      { nodeId: Id<"nodes"> }
    >;
    createInstagramHarnessPostPackage: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        data: Record<string, unknown>;
      },
      {
        nodeId: Id<"nodes">;
        fieldNodeIds: Partial<Record<string, Id<"nodes">>>;
        sourceNodeIds: string[];
      }
    >;
  };
  credits: {
    commitInternal: FunctionReference<
      "mutation",
      "internal",
      { transactionId: Id<"creditTransactions">; actualCost: number; openRouterCost?: number },
      unknown
    >;
    releaseInternal: FunctionReference<
      "mutation",
      "internal",
      { transactionId: Id<"creditTransactions"> },
      unknown
    >;
    checkAbuseLimits: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      unknown
    >;
    incrementUsage: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      unknown
    >;
    decrementConcurrency: FunctionReference<
      "mutation",
      "internal",
      { userId?: string },
      unknown
    >;
  };
};

const internalApi = internal as unknown as InternalApiShape;

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRunEventsFromData(value: unknown) {
  return normalizeAiRunEvents(value);
}

function logAgentFailure(stage: string, context: Record<string, unknown>, error: unknown): void {
  const formattedStatus = formatTerminalStatusMessage(error);
  console.error(`[agents][${stage}] failed`, {
    ...context,
    statusMessage: formattedStatus,
    code: getErrorCode(error),
    source: getErrorSource(error),
    providerStatus: getProviderStatus(error),
    message: errorMessage(error),
  });
}

function normalizeAnswerMap(raw: unknown): AgentClarificationAnswerMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const normalized: AgentClarificationAnswerMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = trimText(key);
    if (!id) {
      continue;
    }
    normalized[id] = trimText(value);
  }
  return normalized;
}

function normalizeClarificationQuestions(raw: unknown): AgentClarificationQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seenIds = new Set<string>();
  const questions: AgentClarificationQuestion[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const prompt = trimText(itemRecord.prompt);
    if (!prompt) {
      continue;
    }

    const rawId = trimText(itemRecord.id).replace(/\s+/g, "-").toLowerCase();
    const fallbackId = `q-${index + 1}`;
    const id = rawId || fallbackId;

    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    questions.push({
      id,
      prompt,
      required: itemRecord.required !== false,
    });
  }

  return questions;
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    const value = trimText(item);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeOptionalVersion(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  const normalized = Math.floor(raw);
  return normalized > 0 ? normalized : undefined;
}

function buildSkeletonPreviewPlaceholder(title: string): string {
  const normalizedTitle = trimText(title) || "this output";
  return `Draft pending for ${normalizedTitle}.`;
}

function deriveLegacyBodyFallback(input: {
  title: string;
  previewText: string;
  sections: AgentOutputSection[];
  body: string;
}): string {
  const normalizedBody = trimText(input.body);
  if (normalizedBody) {
    return normalizedBody;
  }

  if (input.sections.length > 0) {
    return input.sections.map((section) => `${section.label}:\n${section.content}`).join("\n\n");
  }

  const normalizedPreview = trimText(input.previewText);
  if (normalizedPreview) {
    return normalizedPreview;
  }

  return trimText(input.title);
}

function resolveExecutionPlanSummary(input: {
  executionPlanSummary: unknown;
  analysisSummary: unknown;
}): string {
  return trimText(input.executionPlanSummary) || trimText(input.analysisSummary);
}

function resolveFinalExecutionSummary(input: {
  executionSummary: unknown;
  modelSummary: unknown;
  executionPlanSummary: unknown;
  analysisSummary: unknown;
}): string {
  return (
    trimText(input.executionSummary) ||
    trimText(input.modelSummary) ||
    trimText(input.executionPlanSummary) ||
    trimText(input.analysisSummary)
  );
}

function getAnalyzeExecutionStepRequiredFields(): string[] {
  const executionPlan = (ANALYZE_SCHEMA.properties as Record<string, unknown>).executionPlan as
    | Record<string, unknown>
    | undefined;
  const steps = (executionPlan?.properties as Record<string, unknown> | undefined)?.steps as
    | Record<string, unknown>
    | undefined;
  const items = steps?.items as Record<string, unknown> | undefined;
  const required = items?.required;
  return Array.isArray(required)
    ? required.filter((value): value is string => typeof value === "string")
    : [];
}

function buildSkeletonOutputData(input: {
  step: AgentExecutionStep;
  stepIndex: number;
  stepTotal: number;
  definitionVersion?: number;
}) {
  const definitionVersion = normalizeOptionalVersion(input.definitionVersion);
  return {
    isSkeleton: true,
    stepId: input.step.id,
    stepIndex: input.stepIndex,
    stepTotal: input.stepTotal,
    title: input.step.title,
    channel: input.step.channel,
    outputType: input.step.outputType,
    artifactType: input.step.artifactType,
    goal: input.step.goal,
    requiredSections: input.step.requiredSections,
    qualityChecks: input.step.qualityChecks,
    previewText: buildSkeletonPreviewPlaceholder(input.step.title),
    sections: [],
    metadata: {},
    metadataLabels: {},
    body: "",
    ...(definitionVersion ? { definitionVersion } : {}),
  };
}

function buildCompletedOutputData(input: {
  step: AgentExecutionStep;
  stepIndex: number;
  stepTotal: number;
  output: {
    title: string;
    channel: string;
    artifactType: string;
    previewText: string;
    sections: AgentOutputSection[];
    metadata: Record<string, string | string[]>;
    metadataLabels: Record<string, string>;
    qualityChecks: string[];
    body: string;
  };
}) {
  const normalizedQualityChecks =
    input.output.qualityChecks.length > 0
      ? normalizeStringList(input.output.qualityChecks)
      : normalizeStringList(input.step.qualityChecks);
  const normalizedSections = Array.isArray(input.output.sections) ? input.output.sections : [];
  const normalizedPreviewText =
    trimText(input.output.previewText) || trimText(normalizedSections[0]?.content);

  return {
    isSkeleton: false,
    stepId: trimText(input.step.id),
    stepIndex: Math.max(0, Math.floor(input.stepIndex)),
    stepTotal: Math.max(1, Math.floor(input.stepTotal)),
    title: trimText(input.output.title) || trimText(input.step.title),
    channel: trimText(input.output.channel) || trimText(input.step.channel),
    outputType: trimText(input.step.outputType),
    artifactType: trimText(input.output.artifactType) || trimText(input.step.artifactType),
    goal: trimText(input.step.goal),
    requiredSections: normalizeStringList(input.step.requiredSections),
    qualityChecks: normalizedQualityChecks,
    previewText: normalizedPreviewText,
    sections: normalizedSections,
    metadata:
      input.output.metadata && typeof input.output.metadata === "object" ? input.output.metadata : {},
    metadataLabels:
      input.output.metadataLabels && typeof input.output.metadataLabels === "object"
        ? input.output.metadataLabels
        : {},
    body: deriveLegacyBodyFallback({
      title: trimText(input.output.title) || trimText(input.step.title),
      previewText: normalizedPreviewText,
      sections: normalizedSections,
      body: input.output.body,
    }),
  };
}

type AgentExecutionStepRuntime = AgentExecutionStep & {
  nodeId: Id<"nodes">;
  stepIndex: number;
  stepTotal: number;
};

function normalizeExecutionSteps(raw: unknown): AgentExecutionStepRuntime[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const steps: AgentExecutionStepRuntime[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const itemRecord = item as Record<string, unknown>;
    const nodeId = trimText(itemRecord.nodeId);
    const stepId = trimText(itemRecord.stepId);
    const title = trimText(itemRecord.title);
    const channel = trimText(itemRecord.channel);
    const outputType = trimText(itemRecord.outputType);
    const artifactType = trimText(itemRecord.artifactType) || outputType;
    const goal = trimText(itemRecord.goal) || "Deliver channel-ready output.";
    const requiredSections = normalizeStringList(itemRecord.requiredSections);
    const qualityChecks = normalizeStringList(itemRecord.qualityChecks);
    const rawStepIndex = itemRecord.stepIndex;
    const rawStepTotal = itemRecord.stepTotal;
    const stepIndex =
      typeof rawStepIndex === "number" && Number.isFinite(rawStepIndex)
        ? Math.max(0, Math.floor(rawStepIndex))
        : -1;
    const stepTotal =
      typeof rawStepTotal === "number" && Number.isFinite(rawStepTotal)
        ? Math.max(0, Math.floor(rawStepTotal))
        : 0;

    if (!nodeId || !stepId || !title || !channel || !outputType || stepIndex < 0 || stepTotal <= 0) {
      continue;
    }

    steps.push({
      id: stepId,
      title,
      channel,
      outputType,
      artifactType,
      goal,
      requiredSections,
      qualityChecks,
      nodeId: nodeId as Id<"nodes">,
      stepIndex,
      stepTotal,
    });
  }

  return steps.sort((a, b) => a.stepIndex - b.stepIndex);
}

function collectIncomingContextNodes(
  graph: { nodes: Doc<"nodes">[]; edges: Doc<"edges">[] },
  agentNodeId: Id<"nodes">,
): PromptContextNode[] {
  const nodeById = new Map(graph.nodes.map((node) => [node._id, node] as const));
  const incomingEdges = graph.edges.filter((edge) => edge.targetNodeId === agentNodeId);

  const nodes: PromptContextNode[] = [];
  for (const edge of incomingEdges) {
    const source = nodeById.get(edge.sourceNodeId);
    if (!source) {
      continue;
    }

    nodes.push({
      nodeId: source._id,
      type: source.type,
      status: source.status,
      data: source.data,
    });
  }

  return nodes;
}

const INSTAGRAM_CONTEXT_FIELD_WHITELIST: Record<string, readonly string[]> = {
  image: ["url", "storageId", "mimeType", "width", "height", "prompt"],
  asset: ["url", "storageId", "mimeType", "width", "height", "title"],
  text: ["content"],
  "ai-text-output": ["instruction", "inputText", "outputText", "modelId"],
  note: ["content", "color"],
  render: ["url", "storageId", "format", "width", "height"],
  "ai-image": ["url", "storageId", "prompt", "model", "modelTier", "width", "height"],
  "agent-output": ["title", "channel", "artifactType", "previewText", "body"],
};

function summarizeValueForInstagramContext(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ").slice(0, 500);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return undefined;
}

async function collectInstagramConnectedContext(
  ctx: { storage: { getUrl: (storageId: Id<"_storage">) => Promise<string | null> } },
  graph: { nodes: Doc<"nodes">[]; edges: Doc<"edges">[] },
  agentNodeId: Id<"nodes">,
): Promise<InstagramConnectedContextResult> {
  const nodeById = new Map(graph.nodes.map((node) => [node._id, node] as const));
  const incomingEdges = graph.edges.filter((edge) => edge.targetNodeId === agentNodeId);
  const nodes: InstagramConnectedContextResult["nodes"] = [];

  for (const edge of incomingEdges) {
    const source = nodeById.get(edge.sourceNodeId);
    if (!source) {
      continue;
    }
    const data = getNodeDataRecord(source.data);
    const fields: Record<string, unknown> = {};
    for (const key of INSTAGRAM_CONTEXT_FIELD_WHITELIST[source.type] ?? []) {
      const value = summarizeValueForInstagramContext(data[key]);
      if (value !== undefined && value !== "") {
        fields[key] = value;
      }
    }

    const storageId = trimText(data.storageId);
    if (!trimText(fields.url) && storageId) {
      const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
      if (url) {
        fields.url = url;
      }
    }
    if (storageId) {
      fields.storageId = storageId;
    }

    nodes.push({
      nodeId: source._id,
      type: source.type,
      fields,
    });
  }

  return { nodes };
}

function getAgentNodeFromGraph(
  graph: { nodes: Doc<"nodes">[] },
  nodeId: Id<"nodes">,
): Doc<"nodes"> {
  const agentNode = graph.nodes.find((node) => node._id === nodeId);
  if (!agentNode) {
    throw new Error("Agent node not found");
  }
  if (agentNode.type !== "agent") {
    throw new Error("Node must be an agent node");
  }
  return agentNode;
}

function getSelectedModelOrThrow(modelId: string): AgentModel {
  const selectedModel = getAgentModel(modelId);
  if (!selectedModel) {
    throw new Error(`Unknown agent model: ${modelId}`);
  }
  return selectedModel;
}

type PreparedAgentRun = {
  canvas: Doc<"canvases">;
  node: Doc<"nodes">;
  definition: ReturnType<typeof getAgentDefinitionOrThrow>;
  selectedModel: AgentModel;
  reservationId?: Id<"creditTransactions">;
  shouldDecrementConcurrency: boolean;
};

function getAgentDefinitionOrThrow(templateId: unknown) {
  const resolvedId = trimText(templateId) || "instagram-post-agent";
  const definition = getAgentDefinition(resolvedId);
  if (!definition) {
    throw new Error(`Unknown agent definition: ${resolvedId}`);
  }
  return definition;
}

function assertAgentModelTier(model: AgentModel, tier: string | undefined): void {
  const normalizedTier = normalizePublicTier(tier);
  if (!isAgentModelAvailableForTier(normalizedTier, model.id)) {
    throw new Error(`Model ${model.id} requires ${model.minTier} tier`);
  }
}

async function prepareAgentRunOrThrow(
  ctx: ActionCtx,
  args: {
    canvasId: Id<"canvases">;
    nodeId: Id<"nodes">;
    modelId: string;
  },
): Promise<PreparedAgentRun> {
  const canvas = await ctx.runQuery(api.canvases.get, {
    canvasId: args.canvasId,
  });
  if (!canvas) {
    throw new Error("Canvas not found");
  }

  const node = await ctx.runQuery(api.nodes.get, {
    nodeId: args.nodeId,
    includeStorageUrl: false,
  });
  if (!node) {
    throw new Error("Node not found");
  }
  assertNodeBelongsToCanvasOrThrow(node, args.canvasId);
  if (node.type !== "agent") {
    throw new Error("Node must be an agent node");
  }

  const nodeData = getNodeDataRecord(node.data);
  const definition = getAgentDefinitionOrThrow(nodeData.templateId);
  const selectedModel = getSelectedModelOrThrow(args.modelId);
  const subscription = await ctx.runQuery(api.credits.getSubscription, {});
  assertAgentModelTier(selectedModel, subscription?.tier);

  const {
    reservationId,
    shouldDecrementConcurrency,
  } = await startPublicJobCreditFlow(ctx, {
    estimatedCost: selectedModel.creditCost,
    description: `Agent-Lauf - ${selectedModel.label}`,
    nodeId: args.nodeId,
    canvasId: args.canvasId,
    model: selectedModel.id,
    provider: "openrouter",
  });

  try {
    await ctx.runMutation(internalApi.agents.setAgentAnalyzing, {
      nodeId: args.nodeId,
      modelId: selectedModel.id,
      reservationId: reservationId ?? undefined,
      shouldDecrementConcurrency,
    });
  } catch (error) {
    await releasePublicReservationBestEffort(ctx, reservationId, "agents");
    await decrementConcurrencyIfNeeded(ctx, shouldDecrementConcurrency, canvas.ownerId);
    throw error;
  }

  return {
    canvas,
    node,
    definition,
    selectedModel,
    reservationId: reservationId ?? undefined,
    shouldDecrementConcurrency,
  };
}

export const setAgentAnalyzing = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    modelId: v.string(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const prev = getNodeDataRecord(node.data);

    await ctx.db.patch(args.nodeId, {
      ...buildNodeExecutingPatch({
        statusMessage: "Step 1/2 - analyzing inputs",
      }),
      status: "analyzing",
      statusMessage: "Step 1/2 - analyzing inputs",
      data: mergeNodeData(prev, {
        modelId: args.modelId,
        reservationId: args.reservationId,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
        analysisSummary: undefined,
        executionPlanSummary: undefined,
        executionSummary: undefined,
        executionSteps: [],
      }),
    });
  },
});

export const setAgentClarifying = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    clarificationQuestions: v.array(
      v.object({
        id: v.string(),
        prompt: v.string(),
        required: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }

    const prev = getNodeDataRecord(node.data);
    const answers = normalizeAnswerMap(prev.clarificationAnswers);

    await ctx.db.patch(args.nodeId, {
      status: "clarifying",
      statusMessage: "Clarification required before execution",
      data: mergeNodeData(prev, {
        clarificationQuestions: args.clarificationQuestions,
        clarificationAnswers: answers,
      }),
    });
  },
});

export const setAgentExecuting = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    statusMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    const prev = getNodeDataRecord(node.data);

    await ctx.db.patch(args.nodeId, {
      ...buildNodeExecutingPatch({
        retryCount: undefined,
        statusMessage: args.statusMessage ?? "Step 2/2 - generating outputs",
      }),
      retryCount: undefined,
      data: mergeNodeData(prev, {
        clarificationQuestions: [],
      }),
    });
  },
});

export const appendAgentRunToolTrace = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    outputNodeId: v.optional(v.id("nodes")),
    trace: v.any(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeToolCallTraces([args.trace]);
    const trace = normalized[0];
    if (!trace) {
      return;
    }

    const now = Date.now();
    const agentNode = await ctx.db.get(args.nodeId);
    if (agentNode) {
      const prev = getNodeDataRecord(agentNode.data);
      const nextToolCalls = upsertToolCallTrace(
        normalizeToolCallTraces(prev.toolCalls),
        trace,
      );
      await ctx.db.patch(args.nodeId, {
        data: mergeNodeData(prev, {
          runStartedAt: typeof prev.runStartedAt === "number" ? prev.runStartedAt : trace.startedAt,
          runFinishedAt: trace.status === "running" ? undefined : now,
          toolCalls: nextToolCalls,
          runEvents: appendAiRunEvent(normalizeRunEventsFromData(prev.runEvents), {
            phase: trace.status === "running" ? "calling-tools" : "finalizing",
            message: trace.status === "running"
              ? `Calling ${trace.message}`
              : `${trace.message} ${trace.status === "success" ? "finished" : "failed"}`,
            createdAt: trace.finishedAt ?? now,
            status: trace.status === "success" ? "success" : trace.status,
          }),
        }),
      });
    }

    if (!args.outputNodeId) {
      return;
    }
    const outputNode = await ctx.db.get(args.outputNodeId);
    if (!outputNode) {
      return;
    }
    const prev = getNodeDataRecord(outputNode.data);
    await ctx.db.patch(args.outputNodeId, {
      data: mergeNodeData(prev, {
        runStartedAt: typeof prev.runStartedAt === "number" ? prev.runStartedAt : trace.startedAt,
        runFinishedAt: trace.status === "running" ? undefined : now,
        toolCalls: upsertToolCallTrace(normalizeToolCallTraces(prev.toolCalls), trace),
        runEvents: appendAiRunEvent(normalizeRunEventsFromData(prev.runEvents), {
          phase: trace.status === "running" ? "calling-tools" : "finalizing",
          message: trace.status === "running"
            ? `Calling ${trace.message}`
            : `${trace.message} ${trace.status === "success" ? "finished" : "failed"}`,
          createdAt: trace.finishedAt ?? now,
          status: trace.status === "success" ? "success" : trace.status,
        }),
      }),
    });
  },
});

export const createExecutionSkeletonOutputs = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    analysisSummary: v.string(),
    definitionVersion: v.optional(v.number()),
    executionPlan: v.object({
      summary: v.string(),
      steps: v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          channel: v.string(),
          outputType: v.string(),
          artifactType: v.string(),
          goal: v.string(),
          requiredSections: v.array(v.string()),
          qualityChecks: v.array(v.string()),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }
    assertNodeBelongsToCanvasOrThrow(
      node,
      args.canvasId,
      "Agent node does not belong to canvas",
    );

    const prev = getNodeDataRecord(node.data);
    const existingOutputNodeIds = Array.isArray(prev.outputNodeIds)
      ? prev.outputNodeIds.filter((value): value is Id<"nodes"> => typeof value === "string")
      : [];

    const baseX = node.positionX + node.width + 120;
    const baseY = node.positionY;
    const stepTotal = args.executionPlan.steps.length;
    const outputNodeIds: Id<"nodes">[] = [];
    const runtimeSteps: Array<{
      stepId: string;
      nodeId: Id<"nodes">;
      stepIndex: number;
      stepTotal: number;
      title: string;
      channel: string;
      outputType: string;
      artifactType: string;
      goal: string;
      requiredSections: string[];
      qualityChecks: string[];
    }> = [];

    for (let index = 0; index < args.executionPlan.steps.length; index += 1) {
      const step = args.executionPlan.steps[index];
      const outputNodeId = await ctx.db.insert("nodes", {
        canvasId: args.canvasId,
        type: "agent-output",
        positionX: baseX,
        positionY: baseY + index * 220,
        width: 360,
        height: 260,
        status: "executing",
        retryCount: 0,
        data: buildSkeletonOutputData({
          step,
          stepIndex: index,
          stepTotal,
          definitionVersion: args.definitionVersion,
        }),
      });

      outputNodeIds.push(outputNodeId);
      runtimeSteps.push({
        stepId: step.id,
        nodeId: outputNodeId,
        stepIndex: index,
        stepTotal,
        title: step.title,
        channel: step.channel,
        outputType: step.outputType,
        artifactType: step.artifactType,
        goal: step.goal,
        requiredSections: step.requiredSections,
        qualityChecks: step.qualityChecks,
      });

      await ctx.db.insert("edges", {
        canvasId: args.canvasId,
        sourceNodeId: args.nodeId,
        targetNodeId: outputNodeId,
        sourceHandle: undefined,
        targetHandle: "agent-output-in",
      });
    }

    await ctx.db.patch(args.nodeId, {
      data: {
        ...prev,
        analysisSummary: trimText(args.analysisSummary),
        executionPlanSummary: resolveExecutionPlanSummary({
          executionPlanSummary: args.executionPlan.summary,
          analysisSummary: args.analysisSummary,
        }),
        executionSteps: runtimeSteps,
        outputNodeIds: [...existingOutputNodeIds, ...outputNodeIds],
      },
    });

    await ctx.db.patch(args.canvasId, {
      updatedAt: Date.now(),
    });

    return {
      outputNodeIds,
    };
  },
});

export const completeExecutionStepOutput = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    stepId: v.string(),
    stepIndex: v.number(),
    stepTotal: v.number(),
    title: v.string(),
    channel: v.string(),
    outputType: v.string(),
    artifactType: v.string(),
    goal: v.string(),
    requiredSections: v.array(v.string()),
    qualityChecks: v.array(v.string()),
    previewText: v.string(),
    sections: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        content: v.string(),
      }),
    ),
    metadata: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
    metadataLabels: v.record(v.string(), v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const outputNode = await ctx.db.get(args.outputNodeId);
    if (!outputNode) {
      throw new Error("Output node not found");
    }
    if (outputNode.type !== "agent-output") {
      throw new Error("Node must be an agent-output node");
    }
    if (outputNode.canvasId !== node.canvasId) {
      throw new Error("Output node does not belong to the same canvas");
    }

    const normalizedOutputData = buildCompletedOutputData({
      step: {
        id: args.stepId,
        title: args.title,
        channel: args.channel,
        outputType: args.outputType,
        artifactType: args.artifactType,
        goal: args.goal,
        requiredSections: args.requiredSections,
        qualityChecks: args.qualityChecks,
      },
      stepIndex: args.stepIndex,
      stepTotal: args.stepTotal,
      output: {
        title: args.title,
        channel: args.channel,
        artifactType: args.artifactType,
        previewText: args.previewText,
        sections: args.sections,
        metadata: args.metadata,
        metadataLabels: args.metadataLabels,
        qualityChecks: args.qualityChecks,
        body: args.body,
      },
    });

    await ctx.db.patch(args.outputNodeId, {
      ...buildNodeDonePatch(),
      data: normalizedOutputData,
    });
  },
});

function stringFromRecord(record: Record<string, unknown>, key: string): string {
  return trimText(record[key]);
}

function stringListFromRecord(record: Record<string, unknown>, key: string): string[] {
  return normalizeStringList(record[key]);
}

function numberFromRecord(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function getAgentNodeForCanvasOrThrow(
  ctx: { db: { get: (id: Id<"nodes">) => Promise<Doc<"nodes"> | null> } },
  nodeId: Id<"nodes">,
  canvasId: Id<"canvases">,
): Promise<Doc<"nodes">> {
  const node = await ctx.db.get(nodeId);
  if (!node) {
    throw new Error("Node not found");
  }
  if (node.type !== "agent") {
    throw new Error("Node must be an agent node");
  }
  assertNodeBelongsToCanvasOrThrow(node, canvasId);
  return node;
}

function buildAgentCreatedNodeEdge<
  TCanvasId extends string,
  TAgentNodeId extends string,
  TTargetNodeId extends string,
>(args: {
  canvasId: TCanvasId;
  agentNodeId: TAgentNodeId;
  targetNodeId: TTargetNodeId;
  targetHandle?: string;
}) {
  return {
    canvasId: args.canvasId,
    sourceNodeId: args.agentNodeId,
    targetNodeId: args.targetNodeId,
    sourceHandle: undefined,
    targetHandle: args.targetHandle,
  };
}

export const createInstagramHarnessOutput = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const node = await getAgentNodeForCanvasOrThrow(ctx, args.nodeId, args.canvasId);
    const prev = getNodeDataRecord(node.data);
    const outputNodeIds = Array.isArray(prev.outputNodeIds)
      ? prev.outputNodeIds.filter((value): value is Id<"nodes"> => typeof value === "string")
      : [];
    const sourceNodeIds = stringListFromRecord(args.data, "sourceNodeIds");
    const syntheticPreviewFields = stringListFromRecord(args.data, "syntheticPreviewFields");
    const assumptions = stringListFromRecord(args.data, "assumptions");
    const hashtags = stringListFromRecord(args.data, "hashtags");
    const caption = stringFromRecord(args.data, "caption");
    const cta = stringFromRecord(args.data, "cta");
    const altText = stringFromRecord(args.data, "altText");
    const username = stringFromRecord(args.data, "username") || "lemonspace";
    const location = stringFromRecord(args.data, "location") || "Preview location";
    const imageUrl = stringFromRecord(args.data, "imageUrl");
    const profileImageUrl = stringFromRecord(args.data, "profileImageUrl");

    const outputNodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: "agent-output",
      positionX: node.positionX + node.width + 120,
      positionY: node.positionY,
      width: 500,
      height: 680,
      status: "done",
      retryCount: 0,
      data: {
        isSkeleton: false,
        title: "Instagram post preview",
        channel: "Instagram Feed",
        outputType: "instagram-post",
        artifactType: "instagram-post",
        previewText: caption,
        instagramPost: {
          username,
          location,
          ...(profileImageUrl ? { profileImageUrl } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          isLiked: true,
          likesCount: numberFromRecord(args.data, "likesCount", 128),
          caption,
          hashtags,
        },
        sections: [
          { id: "caption", label: "Caption", content: caption },
          { id: "hashtags", label: "Hashtags", content: hashtags.join(" ") },
          { id: "cta", label: "CTA", content: cta },
          { id: "alt-text", label: "Alt text", content: altText },
          { id: "assumptions", label: "Assumptions", content: assumptions.join("\n") },
        ].filter((section) => section.content.trim() !== ""),
        metadata: {
          sourceNodeIds,
          syntheticPreviewFields,
        },
        metadataLabels: {
          sourceNodeIds: "Source node IDs",
          syntheticPreviewFields: "Synthetic preview fields",
        },
        qualityChecks: [
          "uses_connected_canvas_context",
          "labels_synthetic_preview_metadata",
          "contains_caption_hashtags_cta",
        ],
        body: caption,
      },
    });

    await ctx.db.insert(
      "edges",
      buildAgentCreatedNodeEdge({
        canvasId: args.canvasId,
        agentNodeId: args.nodeId,
        targetNodeId: outputNodeId,
        targetHandle: "agent-output-in",
      }),
    );

    await ctx.db.patch(args.nodeId, {
      data: mergeNodeData(prev, {
        outputNodeIds: [...outputNodeIds, outputNodeId],
      }),
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    return { nodeId: outputNodeId };
  },
});

export const createInstagramHarnessTextNode = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const node = await getAgentNodeForCanvasOrThrow(ctx, args.nodeId, args.canvasId);
    const content = stringFromRecord(args.data, "content");
    const textNodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: "text",
      positionX: node.positionX + node.width + 120,
      positionY: node.positionY + 720,
      width: 320,
      height: 180,
      status: "idle",
      retryCount: 0,
      data: { content },
    });
    await ctx.db.insert(
      "edges",
      buildAgentCreatedNodeEdge({
        canvasId: args.canvasId,
        agentNodeId: args.nodeId,
        targetNodeId: textNodeId,
      }),
    );
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    return { nodeId: textNodeId };
  },
});

export const createInstagramHarnessPromptNode = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const node = await getAgentNodeForCanvasOrThrow(ctx, args.nodeId, args.canvasId);
    const promptNodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: "prompt",
      positionX: node.positionX + node.width + 480,
      positionY: node.positionY + 720,
      width: 320,
      height: 220,
      status: "idle",
      retryCount: 0,
      data: {
        prompt: stringFromRecord(args.data, "prompt"),
        aspectRatio: stringFromRecord(args.data, "aspectRatio") || "1:1",
        model: "google/gemini-2.5-flash-image",
      },
    });
    await ctx.db.insert(
      "edges",
      buildAgentCreatedNodeEdge({
        canvasId: args.canvasId,
        agentNodeId: args.nodeId,
        targetNodeId: promptNodeId,
        targetHandle: "image-in",
      }),
    );
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });
    return { nodeId: promptNodeId };
  },
});

export const createInstagramHarnessPostPackage = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const node = await getAgentNodeForCanvasOrThrow(ctx, args.nodeId, args.canvasId);
    const prev = getNodeDataRecord(node.data);
    const outputNodeIds = Array.isArray(prev.outputNodeIds)
      ? prev.outputNodeIds.filter((value): value is Id<"nodes"> => typeof value === "string")
      : [];
    const runId = stringFromRecord(args.data, "runId") || `${args.nodeId}:${Date.now()}`;
    const artifacts = buildInstagramPostPackageArtifacts({
      agentNodeId: args.nodeId,
      runId,
      data: args.data,
    });
    const sourceNodeIds = Array.isArray(artifacts.mockupNode.data.sourceNodeIds)
      ? artifacts.mockupNode.data.sourceNodeIds.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [];

    const fieldNodeIds: Partial<Record<string, Id<"nodes">>> = {};
    const createdNodeIds: Id<"nodes">[] = [];
    const baseX = node.positionX + node.width + 120;
    const baseY = node.positionY;

    for (const [index, fieldNode] of artifacts.fieldNodes.entries()) {
      const fieldNodeId = await ctx.db.insert("nodes", {
        canvasId: args.canvasId,
        type: fieldNode.type,
        positionX: baseX,
        positionY: baseY + index * 190,
        width: 320,
        height: fieldNode.type === "prompt" ? 220 : 150,
        status: "idle",
        retryCount: 0,
        data: fieldNode.data,
      });
      fieldNodeIds[fieldNode.role] = fieldNodeId;
      createdNodeIds.push(fieldNodeId);
    }

    const mockupNodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: artifacts.mockupNode.type,
      positionX: baseX + 430,
      positionY: baseY,
      width: 520,
      height: 760,
      status: "done",
      retryCount: 0,
      data: {
        ...artifacts.mockupNode.data,
        fieldNodeIds,
      },
    });
    createdNodeIds.push(mockupNodeId);

    for (const binding of artifacts.mockupBindings) {
      const sourceNodeId = fieldNodeIds[binding.role];
      if (!sourceNodeId) {
        continue;
      }
      const sourceNode = await ctx.db.get(sourceNodeId);
      if (!sourceNode) {
        throw new Error("Instagram field node missing during package binding");
      }
      await assertConnectionPolicyForTypes(ctx, {
        sourceType: sourceNode.type,
        targetType: artifacts.mockupNode.type,
        targetNodeId: mockupNodeId,
        targetHandle: binding.targetHandle,
      });
      await ctx.db.insert("edges", {
        canvasId: args.canvasId,
        sourceNodeId,
        targetNodeId: mockupNodeId,
        sourceHandle: undefined,
        targetHandle: binding.targetHandle,
      });
    }

    if (artifacts.visualBinding) {
      const visualNodeId = artifacts.visualBinding.sourceNodeId as Id<"nodes">;
      const visualNode = await ctx.db.get(visualNodeId);
      if (visualNode && visualNode.canvasId === args.canvasId) {
        await assertConnectionPolicyForTypes(ctx, {
          sourceType: visualNode.type,
          targetType: artifacts.mockupNode.type,
          targetNodeId: mockupNodeId,
          targetHandle: artifacts.visualBinding.targetHandle,
        });
        await ctx.db.insert("edges", {
          canvasId: args.canvasId,
          sourceNodeId: visualNodeId,
          targetNodeId: mockupNodeId,
          sourceHandle: undefined,
          targetHandle: artifacts.visualBinding.targetHandle,
        });
      }
    }

    await ctx.db.patch(args.nodeId, {
      data: mergeNodeData(prev, {
        outputNodeIds: [...outputNodeIds, ...createdNodeIds],
        lastRunPackageNodeId: mockupNodeId,
      }),
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    return {
      nodeId: mockupNodeId,
      fieldNodeIds,
      sourceNodeIds,
    };
  },
});

export const setAgentError = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    statusMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    const prev = getNodeDataRecord(node.data);

    await ctx.db.patch(args.nodeId, {
      ...buildNodeErrorPatch({ statusMessage: args.statusMessage }),
      retryCount: undefined,
      data: mergeNodeData(prev, {
        reservationId: undefined,
        shouldDecrementConcurrency: undefined,
      }),
    });
  },
});

export const upsertClarificationAnswers = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    clarificationAnswers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const prev = getNodeDataRecord(node.data);
    const currentAnswers = normalizeAnswerMap(prev.clarificationAnswers);
    const nextAnswers: AgentClarificationAnswerMap = {
      ...currentAnswers,
      ...normalizeAnswerMap(args.clarificationAnswers),
    };
    const questions = normalizeClarificationQuestions(prev.clarificationQuestions);

    await ctx.db.patch(args.nodeId, {
      data: {
        ...prev,
        clarificationAnswers: nextAnswers,
      },
    });

    return {
      answers: nextAnswers,
      questions,
    };
  },
});

export const finalizeAgentSuccessWithOutputs = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node) {
      throw new Error("Node not found");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const prev = getNodeDataRecord(node.data);
    const existingOutputNodeIds = Array.isArray(prev.outputNodeIds)
      ? prev.outputNodeIds.filter((value): value is Id<"nodes"> => typeof value === "string")
      : [];

    await ctx.db.patch(args.nodeId, {
      ...buildNodeDonePatch(),
      data: mergeNodeData(prev, {
        clarificationQuestions: [],
        outputNodeIds: existingOutputNodeIds,
        executionSummary: resolveFinalExecutionSummary({
          executionSummary: prev.executionSummary,
          modelSummary: args.summary,
          executionPlanSummary: prev.executionPlanSummary,
          analysisSummary: prev.analysisSummary,
        }),
        lastRunSummary: resolveFinalExecutionSummary({
          executionSummary: prev.executionSummary,
          modelSummary: args.summary,
          executionPlanSummary: prev.executionPlanSummary,
          analysisSummary: prev.analysisSummary,
        }),
        reservationId: undefined,
        shouldDecrementConcurrency: undefined,
      }),
    });

    await ctx.db.patch(node.canvasId, {
      updatedAt: Date.now(),
    });

    return {
      outputNodeIds: existingOutputNodeIds,
    };
  },
});

export const analyzeAgent = internalAction({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
    userId: v.string(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
      }

      const graph = await ctx.runQuery(internalApi.canvasGraph.getInternal, {
        canvasId: args.canvasId,
        userId: args.userId,
      });
      const agentNode = getAgentNodeFromGraph(graph, args.nodeId);
      const agentData = getNodeDataRecord(agentNode.data);
      const definition = getAgentDefinitionOrThrow(agentData.templateId);
      const existingAnswers = normalizeAnswerMap(agentData.clarificationAnswers);
      const locale = normalizeAgentLocale(args.locale);
      const briefConstraints = normalizeAgentBriefConstraints(agentData.briefConstraints);
      const incomingContextNodes = collectIncomingContextNodes(graph, args.nodeId);
      const incomingContext = summarizeIncomingContext(incomingContextNodes);
      const incomingContextCount = incomingContextNodes.length;

      const preflightClarificationQuestions = buildPreflightClarificationQuestions({
        briefConstraints,
        incomingContextCount,
      });
      const hasPreflightRequiredGaps = !areClarificationAnswersComplete(
        preflightClarificationQuestions,
        existingAnswers,
      );

      if (preflightClarificationQuestions.length > 0 && hasPreflightRequiredGaps) {
        await ctx.runMutation(internalApi.agents.setAgentClarifying, {
          nodeId: args.nodeId,
          clarificationQuestions: preflightClarificationQuestions,
        });
        return;
      }

      const analysis = await generateStructuredObjectViaOpenRouter<{
        analysisSummary: string;
        clarificationQuestions: AgentClarificationQuestion[];
        executionPlan: unknown;
      }>(apiKey, {
        model: args.modelId,
        schemaName: "agent_analyze_result",
        schema: ANALYZE_SCHEMA,
        messages: buildAnalyzeMessages({
          definition,
          locale,
          briefConstraints,
          clarificationAnswers: existingAnswers,
          incomingContextSummary: incomingContext,
          incomingContextCount,
        }),
      });

      const clarificationQuestions = normalizeClarificationQuestions(
        analysis.clarificationQuestions,
      );
      const executionPlan = normalizeAgentExecutionPlan(analysis.executionPlan);
      if (executionPlan.steps.length === 0) {
        throw new Error("Agent analyze returned an empty execution plan");
      }
      const hasRequiredGaps = !areClarificationAnswersComplete(
        clarificationQuestions,
        existingAnswers,
      );

      if (clarificationQuestions.length > 0 && hasRequiredGaps) {
        await ctx.runMutation(internalApi.agents.setAgentClarifying, {
          nodeId: args.nodeId,
          clarificationQuestions,
        });
        return;
      }

      await ctx.runMutation(internalApi.agents.createExecutionSkeletonOutputs, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        analysisSummary: trimText(analysis.analysisSummary),
        definitionVersion: definition.version,
        executionPlan,
      });

      await ctx.runMutation(internalApi.agents.setAgentExecuting, {
        nodeId: args.nodeId,
      });

      await ctx.scheduler.runAfter(0, internalApi.agents.executeAgent, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        modelId: args.modelId,
        locale,
        userId: args.userId,
        reservationId: args.reservationId,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      });
    } catch (error) {
      logAgentFailure("analyzeAgent", { nodeId: args.nodeId, modelId: args.modelId }, error);
      await releaseInternalReservationBestEffort(ctx, args.reservationId, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
});

export const executeAgent = internalAction({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
    userId: v.string(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
      }

      const selectedModel = getSelectedModelOrThrow(args.modelId);
      const graph = await ctx.runQuery(internalApi.canvasGraph.getInternal, {
        canvasId: args.canvasId,
        userId: args.userId,
      });
      const agentNode = getAgentNodeFromGraph(graph, args.nodeId);
      const agentData = getNodeDataRecord(agentNode.data);
      const definition = getAgentDefinitionOrThrow(agentData.templateId);
      const clarificationAnswers = normalizeAnswerMap(agentData.clarificationAnswers);
      const locale = normalizeAgentLocale(args.locale);
      const briefConstraints = normalizeAgentBriefConstraints(agentData.briefConstraints);
      const incomingContextNodes = collectIncomingContextNodes(graph, args.nodeId);
      const incomingContext = summarizeIncomingContext(incomingContextNodes);
      const executionPlanSummary = resolveExecutionPlanSummary({
        executionPlanSummary: agentData.executionPlanSummary,
        analysisSummary: agentData.analysisSummary,
      });
      const executionSteps = normalizeExecutionSteps(agentData.executionSteps);

      if (executionSteps.length === 0) {
        throw new Error("Agent execute is missing execution steps");
      }

      const executeSchema = buildExecuteSchema(executionSteps.map((step) => step.id));

      console.info("[agents][executeAgent] request context", {
        nodeId: args.nodeId,
        modelId: args.modelId,
        stepCount: executionSteps.length,
        stepIds: executionSteps.map((step) => step.id),
        artifactTypes: executionSteps.map((step) => step.artifactType),
        channels: executionSteps.map((step) => step.channel),
        incomingContextLength: incomingContext.length,
        executionPlanSummaryLength: executionPlanSummary.length,
      });

      const execution = await generateStructuredObjectViaOpenRouter<{
        summary: string;
        stepOutputs: Record<string, AgentStructuredOutputDraft>;
      }>(apiKey, {
        model: args.modelId,
        schemaName: "agent_execute_result",
        schema: executeSchema,
        messages: buildExecuteMessages({
          definition,
          locale,
          briefConstraints,
          clarificationAnswers,
          incomingContextSummary: incomingContext,
          executionPlan: {
            summary: executionPlanSummary,
            steps: executionSteps.map((step) => ({
              id: step.id,
              title: step.title,
              channel: step.channel,
              outputType: step.outputType,
              artifactType: step.artifactType,
              goal: step.goal,
              requiredSections: step.requiredSections,
              qualityChecks: step.qualityChecks,
            })),
          },
        }),
      });

      const stepOutputs =
        execution.stepOutputs && typeof execution.stepOutputs === "object"
          ? execution.stepOutputs
          : {};

      for (let index = 0; index < executionSteps.length; index += 1) {
        const step = executionSteps[index];
        await ctx.runMutation(internalApi.agents.setAgentExecuting, {
          nodeId: args.nodeId,
          statusMessage: `Generating ${step.title} ${step.stepIndex + 1}/${step.stepTotal}`,
        });

        const rawOutput = stepOutputs[step.id];
        if (!rawOutput || typeof rawOutput !== "object") {
          throw new Error(`Missing execution output for step ${step.id}`);
        }

        const normalized = normalizeAgentStructuredOutput(rawOutput, {
          title: step.title,
          channel: step.channel,
          artifactType: step.artifactType,
        });

        await ctx.runMutation(internalApi.agents.completeExecutionStepOutput, {
          nodeId: args.nodeId,
          outputNodeId: step.nodeId,
          stepId: step.id,
          stepIndex: step.stepIndex,
          stepTotal: step.stepTotal,
          title: normalized.title,
          channel: normalized.channel,
          outputType: step.outputType,
          artifactType: normalized.artifactType,
          goal: step.goal,
          requiredSections: step.requiredSections,
          qualityChecks:
            normalized.qualityChecks.length > 0 ? normalized.qualityChecks : step.qualityChecks,
          previewText: normalized.previewText,
          sections: normalized.sections,
          metadata: normalized.metadata,
          metadataLabels: normalized.metadataLabels,
          body: normalized.body,
        });
      }

      await ctx.runMutation(internalApi.agents.finalizeAgentSuccessWithOutputs, {
        nodeId: args.nodeId,
        summary: execution.summary,
      });

      await commitInternalReservationIfNeeded(ctx, args.reservationId, selectedModel.creditCost);

      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    } catch (error) {
      logAgentFailure("executeAgent", { nodeId: args.nodeId, modelId: args.modelId }, error);
      await releaseInternalReservationBestEffort(ctx, args.reservationId, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
});

type InstagramHarnessFinal = {
  summary: string;
};

function parseInstagramHarnessFinal(content: string): InstagramHarnessFinal {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Instagram harness final response must be a JSON object");
  }
  const summary = trimText((parsed as Record<string, unknown>).summary);
  return {
    summary: summary || "Instagram agent run completed.",
  };
}

function buildInstagramHarnessMessages(input: {
  locale: AgentLocale;
  briefConstraints: ReturnType<typeof normalizeAgentBriefConstraints>;
  connectedContext: InstagramConnectedContextResult;
}): AgentHarnessMessage[] {
  const promptSegments = AGENT_DOC_SEGMENTS["instagram-post-agent"];
  const languageInstruction =
    input.locale === "de"
      ? "Write generated post copy and final summary in German unless the connected context clearly uses another language."
      : "Write generated post copy and final summary in English unless the connected context clearly uses another language.";

  return [
    {
      role: "system",
      content: [
        promptSegments.role,
        promptSegments["style-rules"],
        promptSegments["decision-framework"],
        promptSegments["channel-notes"],
        "You operate through tools only when creating canvas artifacts.",
        "Use directly connected context only. Do not claim access to unrelated canvas nodes.",
        "You must create exactly one editable Instagram post package before finalizing.",
        "The package must include caption, hashtags, CTA, alt text, visualPrompt, selected visual metadata when available, and synthetic preview field labels.",
        "Synthetic social preview fields such as likesCount, location, or profileImageUrl must be listed in syntheticPreviewFields.",
        "When finished, return JSON only: {\"summary\":\"...\"}.",
        languageInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          briefConstraints: input.briefConstraints,
          connectedContext: input.connectedContext,
        },
        null,
        2,
      ),
    },
  ];
}

export const runToolHarnessAgent = internalAction({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    streamOutputNodeId: v.optional(v.id("nodes")),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
    userId: v.string(),
    reservationId: v.optional(v.id("creditTransactions")),
    shouldDecrementConcurrency: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
      }

      const selectedModel = getSelectedModelOrThrow(args.modelId);
      const graph = await ctx.runQuery(internalApi.canvasGraph.getInternal, {
        canvasId: args.canvasId,
        userId: args.userId,
      });
      const agentNode = getAgentNodeFromGraph(graph, args.nodeId);
      const agentData = getNodeDataRecord(agentNode.data);
      const definition = getAgentDefinitionOrThrow(agentData.templateId);
      if (definition.runtime.kind !== "tool-harness") {
        throw new Error(`Agent ${definition.id} is not configured for tool harness runtime`);
      }
      if (definition.runtime.harnessId !== "instagram-post") {
        throw new Error(`Unsupported harness: ${definition.runtime.harnessId}`);
      }

      const locale = normalizeAgentLocale(args.locale);
      const briefConstraints = normalizeAgentBriefConstraints(agentData.briefConstraints);
      const connectedContext = await collectInstagramConnectedContext(ctx, graph, args.nodeId);
      const state = createInstagramHarnessToolState();

      await ctx.runMutation(internalApi.agents.setAgentExecuting, {
        nodeId: args.nodeId,
        statusMessage: "Running Instagram harness",
      });

      const result = await runAgentHarnessLoop<InstagramHarnessFinal>({
        initialMessages: buildInstagramHarnessMessages({
          locale,
          briefConstraints,
          connectedContext,
        }),
        tools: INSTAGRAM_AGENT_TOOLS,
        maxRounds: 8,
        callModel: (messages, tools) =>
          generateToolChatCompletionViaOpenRouter(apiKey, {
            model: args.modelId,
            messages,
            tools,
          }),
        executeTool: (call) =>
          executeInstagramHarnessTool({
            state,
            call,
            ops: {
              readConnectedContext: async () => connectedContext,
              createInstagramPostPackage: async (data) =>
                ctx.runMutation(internalApi.agents.createInstagramHarnessPostPackage, {
                  canvasId: args.canvasId,
                  nodeId: args.nodeId,
                  data: resolveInstagramPostPackageArgs(data, connectedContext),
                }),
            },
          }),
        parseFinal: parseInstagramHarnessFinal,
        onToolCallTrace: async (trace) => {
          await ctx.runMutation(internalApi.agents.appendAgentRunToolTrace, {
            nodeId: args.nodeId,
            outputNodeId: args.streamOutputNodeId,
            trace,
          });
        },
      });

      await ctx.runMutation(internalApi.agents.finalizeAgentSuccessWithOutputs, {
        nodeId: args.nodeId,
        summary: result.final.summary,
      });
      await commitInternalReservationIfNeeded(ctx, args.reservationId, selectedModel.creditCost);
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    } catch (error) {
      logAgentFailure("runToolHarnessAgent", { nodeId: args.nodeId, modelId: args.modelId }, error);
      await releaseInternalReservationBestEffort(ctx, args.reservationId, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
});

export const __testables = {
  buildExecuteSchema,
  buildSkeletonOutputData,
  buildCompletedOutputData,
  getAnalyzeExecutionStepRequiredFields,
  resolveExecutionPlanSummary,
  resolveFinalExecutionSummary,
  buildAgentCreatedNodeEdge,
};

export const runAgent = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
  },
  handler: async (ctx, args): Promise<{ queued: true; nodeId: Id<"nodes"> }> => {
    const prepared = await prepareAgentRunOrThrow(ctx, {
      canvasId: args.canvasId,
      nodeId: args.nodeId,
      modelId: args.modelId,
    });

    let scheduled = false;
    try {
      const scheduledAction =
        prepared.definition.runtime.kind === "tool-harness"
          ? internalApi.agents.runToolHarnessAgent
          : internalApi.agents.analyzeAgent;

      await ctx.scheduler.runAfter(0, scheduledAction, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        modelId: prepared.selectedModel.id,
        locale: normalizeAgentLocale(args.locale),
        userId: prepared.canvas.ownerId,
        reservationId: prepared.reservationId,
        shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
      });
      scheduled = true;
      return { queued: true, nodeId: args.nodeId };
    } catch (error) {
      logAgentFailure("runAgent", { nodeId: args.nodeId, modelId: prepared.selectedModel.id }, error);
      await releasePublicReservationBestEffort(ctx, prepared.reservationId, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(
        ctx,
        prepared.shouldDecrementConcurrency && !scheduled,
        prepared.canvas.ownerId,
      );
    }
  },
});

export const prepareAgentStream = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
  },
  handler: async (ctx, args): Promise<{
    modelId: string;
    outputNodeId: Id<"nodes">;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    userId: string;
  }> => {
    const prepared = await prepareAgentRunOrThrow(ctx, args);
    let scheduled = false;

    try {
      if (prepared.definition.runtime.kind !== "tool-harness") {
        throw new Error(
          `Agent ${prepared.definition.id} is not configured for streaming harness output`,
        );
      }

      const { outputNodeIds } = await ctx.runMutation(
        internalApi.agents.createExecutionSkeletonOutputs,
        {
          canvasId: args.canvasId,
          nodeId: args.nodeId,
          analysisSummary: "Streaming agent output",
          definitionVersion: prepared.definition.version,
          executionPlan: {
            summary: "Streaming agent output",
            steps: [
              {
                id: "stream-summary",
                title: "Agent run summary",
                channel: "canvas",
                outputType: "text",
                artifactType: "agent-stream-summary",
                goal: "Show the running agent output locally while durable harness outputs are created.",
                requiredSections: ["Summary"],
                qualityChecks: ["Concise", "Context aware"],
              },
            ],
          },
        },
      );
      const outputNodeId = outputNodeIds[0];
      if (!outputNodeId) {
        throw new Error("Agent stream output node was not created");
      }

      await ctx.scheduler.runAfter(0, internalApi.agents.runToolHarnessAgent, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        streamOutputNodeId: outputNodeId,
        modelId: prepared.selectedModel.id,
        locale: normalizeAgentLocale(args.locale),
        userId: prepared.canvas.ownerId,
        reservationId: prepared.reservationId,
        shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
      });
      scheduled = true;

      return {
        modelId: prepared.selectedModel.id,
        outputNodeId,
        userId: prepared.canvas.ownerId,
        messages: [
          {
            role: "system",
            content:
              "You are LemonSpace. Write a concise live summary of what this agent run is preparing. Return plain text only.",
          },
          {
            role: "user",
            content: [
              `Agent: ${prepared.definition.metadata.name}`,
              `Locale: ${args.locale}`,
              "Status: The durable tool harness has started and will create the final canvas artifacts.",
            ].join("\n"),
          },
        ],
      };
    } catch (error) {
      logAgentFailure(
        "prepareAgentStream",
        { nodeId: args.nodeId, modelId: prepared.selectedModel.id },
        error,
      );
      await releasePublicReservationBestEffort(ctx, prepared.reservationId, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      throw error;
    } finally {
      await decrementConcurrencyIfNeeded(
        ctx,
        prepared.shouldDecrementConcurrency && !scheduled,
        prepared.canvas.ownerId,
      );
    }
  },
});

export const finalizeAgentStreamSummary = action({
  args: {
    nodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    outputText: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.runQuery(api.nodes.get, {
      nodeId: args.nodeId,
      includeStorageUrl: false,
    });
    if (!node) {
      throw new Error("Node not found");
    }
    const outputNode = await ctx.runQuery(api.nodes.get, {
      nodeId: args.outputNodeId,
      includeStorageUrl: false,
    });
    if (!outputNode) {
      throw new Error("Output node not found");
    }

    const body = trimText(args.outputText);
    if (!body) {
      throw new Error("Agent stream summary returned an empty result");
    }

    await ctx.runMutation(internalApi.agents.completeExecutionStepOutput, {
      nodeId: args.nodeId,
      outputNodeId: args.outputNodeId,
      stepId: "stream-summary",
      stepIndex: 0,
      stepTotal: 1,
      title: "Agent run summary",
      channel: "canvas",
      outputType: "text",
      artifactType: "agent-stream-summary",
      goal: "Show the running agent output locally while durable harness outputs are created.",
      requiredSections: ["Summary"],
      qualityChecks: ["Concise", "Context aware"],
      previewText: body.slice(0, 240),
      sections: [{ id: "summary", label: "Summary", content: body }],
      metadata: {},
      metadataLabels: {},
      body,
    });

    return { ok: true as const };
  },
});

export const resumeAgent = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    clarificationAnswers: v.record(v.string(), v.string()),
    locale: v.union(v.literal("de"), v.literal("en")),
  },
  handler: async (ctx, args): Promise<{ queued: true; nodeId: Id<"nodes"> }> => {
    const canvas = await ctx.runQuery(api.canvases.get, {
      canvasId: args.canvasId,
    });
    if (!canvas) {
      throw new Error("Canvas not found");
    }

    const node = await ctx.runQuery(api.nodes.get, {
      nodeId: args.nodeId,
      includeStorageUrl: false,
    });
    if (!node) {
      throw new Error("Node not found");
    }
    assertNodeBelongsToCanvasOrThrow(node, args.canvasId);
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const upserted = await ctx.runMutation(internalApi.agents.upsertClarificationAnswers, {
      nodeId: args.nodeId,
      clarificationAnswers: args.clarificationAnswers,
    });

    if (!areClarificationAnswersComplete(upserted.questions, upserted.answers)) {
      throw new Error("Please answer all required clarification questions before resuming");
    }

    const nodeData = getNodeDataRecord(node.data);
    const modelId = trimText(nodeData.modelId) || DEFAULT_AGENT_MODEL_ID;
    const selectedModel = getSelectedModelOrThrow(modelId);
    const reservationId =
      typeof nodeData.reservationId === "string"
        ? (nodeData.reservationId as Id<"creditTransactions">)
        : undefined;
    const shouldDecrementConcurrency = nodeData.shouldDecrementConcurrency === true;

    const subscription = await ctx.runQuery(api.credits.getSubscription, {});
    assertAgentModelTier(selectedModel, subscription?.tier);

    try {
      await ctx.runMutation(internalApi.agents.setAgentAnalyzing, {
        nodeId: args.nodeId,
        modelId,
        reservationId,
        shouldDecrementConcurrency,
      });

      await ctx.scheduler.runAfter(0, internalApi.agents.analyzeAgent, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        modelId,
        locale: normalizeAgentLocale(args.locale),
        userId: canvas.ownerId,
        reservationId,
        shouldDecrementConcurrency,
      });

      return { queued: true, nodeId: args.nodeId };
    } catch (error) {
      logAgentFailure("resumeAgent", { nodeId: args.nodeId, modelId }, error);
      await releasePublicReservationBestEffort(ctx, reservationId ?? null, "agents");
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      throw error;
    }
  },
});
