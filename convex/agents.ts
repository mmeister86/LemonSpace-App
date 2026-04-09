import { v } from "convex/values";
import type { FunctionReference } from "convex/server";

import {
  action,
  type ActionCtx,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { generateStructuredObjectViaOpenRouter } from "./openrouter";
import { getNodeDataRecord } from "./ai_node_data";
import { formatTerminalStatusMessage } from "./ai_errors";
import {
  areClarificationAnswersComplete,
  normalizeAgentOutputDraft,
  type AgentClarificationAnswerMap,
  type AgentClarificationQuestion,
  type AgentOutputDraft,
} from "../lib/agent-run-contract";
import {
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  isAgentModelAvailableForTier,
  type AgentModel,
} from "../lib/agent-models";
import { getAgentTemplate } from "../lib/agent-templates";
import { normalizePublicTier } from "../lib/tier-credits";

const ANALYZE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["analysisSummary", "clarificationQuestions"],
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
  },
};

const EXECUTE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "outputs"],
  properties: {
    summary: { type: "string" },
    outputs: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "channel", "outputType", "body"],
        properties: {
          title: { type: "string" },
          channel: { type: "string" },
          outputType: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  },
};

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
        modelId: string;
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
        userId: string;
        analysisSummary: string;
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
    finalizeAgentSuccessWithOutputs: FunctionReference<
      "mutation",
      "internal",
      {
        canvasId: Id<"canvases">;
        nodeId: Id<"nodes">;
        outputs: AgentOutputDraft[];
        summary: string;
      },
      { outputNodeIds: Id<"nodes">[] }
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
    checkAbuseLimits: FunctionReference<"mutation", "internal", {}, unknown>;
    incrementUsage: FunctionReference<"mutation", "internal", {}, unknown>;
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

function serializeNodeDataForPrompt(data: unknown): string {
  if (data === undefined) {
    return "{}";
  }
  try {
    return JSON.stringify(data).slice(0, 1200);
  } catch {
    return "{}";
  }
}

function collectIncomingContext(
  graph: { nodes: Doc<"nodes">[]; edges: Doc<"edges">[] },
  agentNodeId: Id<"nodes">,
): string {
  const nodeById = new Map(graph.nodes.map((node) => [node._id, node] as const));
  const incomingEdges = graph.edges.filter((edge) => edge.targetNodeId === agentNodeId);

  if (incomingEdges.length === 0) {
    return "No incoming nodes connected to this agent.";
  }

  const lines: string[] = [];
  for (const edge of incomingEdges) {
    const source = nodeById.get(edge.sourceNodeId);
    if (!source) {
      continue;
    }
    lines.push(
      `- nodeId=${source._id}, type=${source.type}, status=${source.status}, data=${serializeNodeDataForPrompt(source.data)}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : "No incoming nodes connected to this agent.";
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

async function releaseInternalReservationBestEffort(
  ctx: ActionCtx,
  reservationId: Id<"creditTransactions"> | undefined,
) {
  if (!reservationId) {
    return;
  }
  try {
    await ctx.runMutation(internalApi.credits.releaseInternal, {
      transactionId: reservationId,
    });
  } catch {
    // Keep terminal node updates resilient even when cleanup fails.
  }
}

async function releasePublicReservationBestEffort(
  ctx: ActionCtx,
  reservationId: Id<"creditTransactions"> | null,
) {
  if (!reservationId) {
    return;
  }
  try {
    await ctx.runMutation(api.credits.release, {
      transactionId: reservationId,
    });
  } catch {
    // Prefer surfacing orchestration errors over cleanup issues.
  }
}

async function decrementConcurrencyIfNeeded(
  ctx: ActionCtx,
  shouldDecrementConcurrency: boolean,
  userId: string,
) {
  if (!shouldDecrementConcurrency) {
    return;
  }
  await ctx.runMutation(internalApi.credits.decrementConcurrency, {
    userId,
  });
}

function getSelectedModelOrThrow(modelId: string): AgentModel {
  const selectedModel = getAgentModel(modelId);
  if (!selectedModel) {
    throw new Error(`Unknown agent model: ${modelId}`);
  }
  return selectedModel;
}

function assertAgentModelTier(model: AgentModel, tier: string | undefined): void {
  const normalizedTier = normalizePublicTier(tier);
  if (!isAgentModelAvailableForTier(normalizedTier, model.id)) {
    throw new Error(`Model ${model.id} requires ${model.minTier} tier`);
  }
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
      status: "analyzing",
      statusMessage: "Step 1/2 - analyzing inputs",
      retryCount: 0,
      data: {
        ...prev,
        modelId: args.modelId,
        reservationId: args.reservationId,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      },
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
      data: {
        ...prev,
        clarificationQuestions: args.clarificationQuestions,
        clarificationAnswers: answers,
      },
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
      status: "executing",
      statusMessage: args.statusMessage ?? "Step 2/2 - generating outputs",
      data: {
        ...prev,
        clarificationQuestions: [],
      },
    });
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
      status: "error",
      statusMessage: args.statusMessage,
      data: {
        ...prev,
        reservationId: undefined,
        shouldDecrementConcurrency: undefined,
      },
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
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    outputs: v.array(
      v.object({
        title: v.optional(v.string()),
        channel: v.optional(v.string()),
        outputType: v.optional(v.string()),
        body: v.optional(v.string()),
      }),
    ),
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
    if (node.canvasId !== args.canvasId) {
      throw new Error("Agent node does not belong to canvas");
    }

    const prev = getNodeDataRecord(node.data);
    const existingOutputNodeIds = Array.isArray(prev.outputNodeIds)
      ? prev.outputNodeIds.filter((value): value is Id<"nodes"> => typeof value === "string")
      : [];

    const baseX = node.positionX + node.width + 120;
    const baseY = node.positionY;
    const outputNodeIds: Id<"nodes">[] = [];

    for (let index = 0; index < args.outputs.length; index += 1) {
      const normalized = normalizeAgentOutputDraft(args.outputs[index] ?? {});
      const outputNodeId = await ctx.db.insert("nodes", {
        canvasId: args.canvasId,
        type: "agent-output",
        positionX: baseX,
        positionY: baseY + index * 220,
        width: 360,
        height: 260,
        status: "done",
        retryCount: 0,
        data: {
          title: normalized.title,
          channel: normalized.channel,
          outputType: normalized.outputType,
          body: normalized.body,
        },
      });
      outputNodeIds.push(outputNodeId);

      await ctx.db.insert("edges", {
        canvasId: args.canvasId,
        sourceNodeId: args.nodeId,
        targetNodeId: outputNodeId,
        sourceHandle: undefined,
        targetHandle: "agent-output-in",
      });
    }

    await ctx.db.patch(args.nodeId, {
      status: "done",
      statusMessage: undefined,
      retryCount: 0,
      data: {
        ...prev,
        clarificationQuestions: [],
        outputNodeIds: [...existingOutputNodeIds, ...outputNodeIds],
        lastRunSummary: trimText(args.summary),
        reservationId: undefined,
        shouldDecrementConcurrency: undefined,
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

export const analyzeAgent = internalAction({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
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
      const template = getAgentTemplate(trimText(agentData.templateId) || "campaign-distributor");
      const existingAnswers = normalizeAnswerMap(agentData.clarificationAnswers);
      const incomingContext = collectIncomingContext(graph, args.nodeId);

      const analysis = await generateStructuredObjectViaOpenRouter<{
        analysisSummary: string;
        clarificationQuestions: AgentClarificationQuestion[];
      }>(apiKey, {
        model: args.modelId,
        schemaName: "agent_analyze_result",
        schema: ANALYZE_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are the LemonSpace Agent Analyzer. Inspect incoming canvas context and decide if clarification is required before execution. Ask only necessary short questions.",
          },
          {
            role: "user",
            content: [
              `Template: ${template?.name ?? "Unknown template"}`,
              `Template description: ${template?.description ?? ""}`,
              "Incoming node context:",
              incomingContext,
              `Current clarification answers: ${JSON.stringify(existingAnswers)}`,
              "Return structured JSON matching the schema.",
            ].join("\n\n"),
          },
        ],
      });

      const clarificationQuestions = normalizeClarificationQuestions(
        analysis.clarificationQuestions,
      );
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

      await ctx.runMutation(internalApi.agents.setAgentExecuting, {
        nodeId: args.nodeId,
      });

      await ctx.scheduler.runAfter(0, internalApi.agents.executeAgent, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        modelId: args.modelId,
        userId: args.userId,
        analysisSummary: trimText(analysis.analysisSummary),
        reservationId: args.reservationId,
        shouldDecrementConcurrency: args.shouldDecrementConcurrency,
      });
    } catch (error) {
      await releaseInternalReservationBestEffort(ctx, args.reservationId);
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
    userId: v.string(),
    analysisSummary: v.string(),
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
      const template = getAgentTemplate(trimText(agentData.templateId) || "campaign-distributor");
      const clarificationAnswers = normalizeAnswerMap(agentData.clarificationAnswers);
      const incomingContext = collectIncomingContext(graph, args.nodeId);

      const execution = await generateStructuredObjectViaOpenRouter<{
        summary: string;
        outputs: AgentOutputDraft[];
      }>(apiKey, {
        model: args.modelId,
        schemaName: "agent_execute_result",
        schema: EXECUTE_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              "You are the LemonSpace Agent Executor. Produce concrete channel outputs from context and clarification answers. Output concise, actionable drafts.",
          },
          {
            role: "user",
            content: [
              `Template: ${template?.name ?? "Unknown template"}`,
              `Template description: ${template?.description ?? ""}`,
              `Analyze summary: ${trimText(args.analysisSummary)}`,
              `Clarification answers: ${JSON.stringify(clarificationAnswers)}`,
              "Incoming node context:",
              incomingContext,
              "Return structured JSON matching the schema.",
            ].join("\n\n"),
          },
        ],
      });

      const outputs = Array.isArray(execution.outputs) ? execution.outputs : [];
      if (outputs.length === 0) {
        throw new Error("Agent execution returned no outputs");
      }

      await ctx.runMutation(internalApi.agents.finalizeAgentSuccessWithOutputs, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        outputs,
        summary: execution.summary,
      });

      if (args.reservationId) {
        await ctx.runMutation(internalApi.credits.commitInternal, {
          transactionId: args.reservationId,
          actualCost: selectedModel.creditCost,
        });
      }

      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    } catch (error) {
      await releaseInternalReservationBestEffort(ctx, args.reservationId);
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
    }
  },
});

export const runAgent = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
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
    if (node.canvasId !== args.canvasId) {
      throw new Error("Node does not belong to canvas");
    }
    if (node.type !== "agent") {
      throw new Error("Node must be an agent node");
    }

    const selectedModel = getSelectedModelOrThrow(args.modelId);
    const subscription = await ctx.runQuery(api.credits.getSubscription, {});
    assertAgentModelTier(selectedModel, subscription?.tier);

    await ctx.runMutation(internalApi.credits.checkAbuseLimits, {});

    const internalCreditsEnabled = process.env.INTERNAL_CREDITS_ENABLED === "true";
    let usageIncremented = false;
    const reservationId: Id<"creditTransactions"> | null = internalCreditsEnabled
      ? await ctx.runMutation(api.credits.reserve, {
          estimatedCost: selectedModel.creditCost,
          description: `Agent-Lauf - ${selectedModel.label}`,
          nodeId: args.nodeId,
          canvasId: args.canvasId,
          model: selectedModel.id,
          provider: "openrouter",
        })
      : null;

    if (!internalCreditsEnabled) {
      await ctx.runMutation(internalApi.credits.incrementUsage, {});
      usageIncremented = true;
    }

    let scheduled = false;
    try {
      await ctx.runMutation(internalApi.agents.setAgentAnalyzing, {
        nodeId: args.nodeId,
        modelId: selectedModel.id,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
      });

      await ctx.scheduler.runAfter(0, internalApi.agents.analyzeAgent, {
        canvasId: args.canvasId,
        nodeId: args.nodeId,
        modelId: selectedModel.id,
        userId: canvas.ownerId,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency: usageIncremented,
      });
      scheduled = true;
      return { queued: true, nodeId: args.nodeId };
    } catch (error) {
      await releasePublicReservationBestEffort(ctx, reservationId);
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });

      throw error;
    } finally {
      if (usageIncremented && !scheduled) {
        await ctx.runMutation(internalApi.credits.decrementConcurrency, {
          userId: canvas.ownerId,
        });
      }
    }
  },
});

export const resumeAgent = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    clarificationAnswers: v.record(v.string(), v.string()),
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
    if (node.canvasId !== args.canvasId) {
      throw new Error("Node does not belong to canvas");
    }
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
        userId: canvas.ownerId,
        reservationId,
        shouldDecrementConcurrency,
      });

      return { queued: true, nodeId: args.nodeId };
    } catch (error) {
      await releasePublicReservationBestEffort(ctx, reservationId ?? null);
      await ctx.runMutation(internalApi.agents.setAgentError, {
        nodeId: args.nodeId,
        statusMessage: formatTerminalStatusMessage(error),
      });
      throw error;
    }
  },
});
