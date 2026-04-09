"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useAuthQuery } from "@/hooks/use-auth-query";
import {
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  getAvailableAgentModels,
  type AgentModelId,
} from "@/lib/agent-models";
import {
  type AgentClarificationAnswerMap,
  type AgentClarificationQuestion,
} from "@/lib/agent-run-contract";
import { getAgentTemplate } from "@/lib/agent-templates";
import { normalizePublicTier } from "@/lib/tier-credits";
import { toast } from "@/lib/toast";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseNodeWrapper from "./base-node-wrapper";

type AgentNodeData = {
  templateId?: string;
  canvasId?: string;
  modelId?: string;
  executionSteps?: Array<{ stepIndex?: number; stepTotal?: number }>;
  executionStepIndex?: number;
  executionStepTotal?: number;
  _executionStepIndex?: number;
  _executionStepTotal?: number;
  clarificationQuestions?: AgentClarificationQuestion[];
  clarificationAnswers?: AgentClarificationAnswerMap | Array<{ id: string; value: string }>;
  _status?: string;
  _statusMessage?: string;
};

type AgentNodeType = Node<AgentNodeData, "agent">;

const DEFAULT_AGENT_TEMPLATE_ID = "campaign-distributor";

function useSafeCanvasSync() {
  try {
    return useCanvasSync();
  } catch {
    return {
      queueNodeDataUpdate: async () => undefined,
      status: { isOffline: false, isSyncing: false, pendingCount: 0 },
    };
  }
}

function useSafeSubscription() {
  try {
    return useAuthQuery(api.credits.getSubscription);
  } catch {
    return undefined;
  }
}

function useSafeAction(reference: FunctionReference<"action", "public", any, unknown>) {
  try {
    return useAction(reference);
  } catch {
    return async (_args: any) => undefined;
  }
}

function normalizeClarificationAnswers(raw: AgentNodeData["clarificationAnswers"]): AgentClarificationAnswerMap {
  if (!raw) {
    return {};
  }

  if (Array.isArray(raw)) {
    const entries = raw
      .filter((item) => typeof item?.id === "string" && typeof item?.value === "string")
      .map((item) => [item.id, item.value] as const);
    return Object.fromEntries(entries);
  }

  return raw;
}

function areAnswerMapsEqual(
  left: AgentClarificationAnswerMap,
  right: AgentClarificationAnswerMap,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [key, value] of leftEntries) {
    if (right[key] !== value) {
      return false;
    }
  }

  return true;
}

function CompactList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1">
      {items.slice(0, 4).map((item) => (
        <li key={item} className="truncate text-[11px] text-foreground/90" title={item}>
          - {item}
        </li>
      ))}
    </ul>
  );
}

export default function AgentNode({ id, data, selected }: NodeProps<AgentNodeType>) {
  const nodeData = data as AgentNodeData;
  const template =
    getAgentTemplate(nodeData.templateId ?? DEFAULT_AGENT_TEMPLATE_ID) ??
    getAgentTemplate(DEFAULT_AGENT_TEMPLATE_ID);
  const { queueNodeDataUpdate, status } = useSafeCanvasSync();
  const subscription = useSafeSubscription();
  const userTier = normalizePublicTier(subscription?.tier ?? "free");

  const availableModels = useMemo(() => getAvailableAgentModels(userTier), [userTier]);
  const [modelId, setModelId] = useState(nodeData.modelId ?? DEFAULT_AGENT_MODEL_ID);
  const [clarificationAnswers, setClarificationAnswers] = useState<AgentClarificationAnswerMap>(
    normalizeClarificationAnswers(nodeData.clarificationAnswers),
  );

  const agentActionsApi = api as unknown as {
    agents: {
      runAgent: FunctionReference<
        "action",
        "public",
        {
          canvasId: Id<"canvases">;
          nodeId: Id<"nodes">;
          modelId: string;
        },
        unknown
      >;
      resumeAgent: FunctionReference<
        "action",
        "public",
        {
          canvasId: Id<"canvases">;
          nodeId: Id<"nodes">;
          clarificationAnswers: AgentClarificationAnswerMap;
        },
        unknown
      >;
    };
  };

  const runAgent = useSafeAction(agentActionsApi.agents.runAgent);
  const resumeAgent = useSafeAction(agentActionsApi.agents.resumeAgent);

  useEffect(() => {
    setModelId(nodeData.modelId ?? DEFAULT_AGENT_MODEL_ID);
  }, [nodeData.modelId]);

  useEffect(() => {
    const normalized = normalizeClarificationAnswers(nodeData.clarificationAnswers);
    setClarificationAnswers((current) => {
      if (areAnswerMapsEqual(current, normalized)) {
        return current;
      }
      return normalized;
    });
  }, [nodeData.clarificationAnswers]);

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }
    if (availableModels.some((model) => model.id === modelId)) {
      return;
    }

    const nextModelId = availableModels[0]!.id;
    setModelId(nextModelId);
  }, [availableModels, modelId]);

  const selectedModel =
    getAgentModel(modelId) ??
    availableModels[0] ??
    getAgentModel(DEFAULT_AGENT_MODEL_ID);
  const resolvedModelId = selectedModel?.id ?? DEFAULT_AGENT_MODEL_ID;
  const creditCost = selectedModel?.creditCost ?? 0;
  const clarificationQuestions = nodeData.clarificationQuestions ?? [];
  const isExecutionActive = nodeData._status === "analyzing" || nodeData._status === "executing";
  const executionProgressLine = useMemo(() => {
    if (nodeData._status !== "executing") {
      return null;
    }

    const statusMessage = typeof nodeData._statusMessage === "string" ? nodeData._statusMessage.trim() : "";
    if (statusMessage.length > 0) {
      return statusMessage;
    }

    const totalFromSteps = Array.isArray(nodeData.executionSteps) ? nodeData.executionSteps.length : 0;
    const stepIndexCandidate =
      typeof nodeData.executionStepIndex === "number"
        ? nodeData.executionStepIndex
        : nodeData._executionStepIndex;
    const stepTotalCandidate =
      typeof nodeData.executionStepTotal === "number"
        ? nodeData.executionStepTotal
        : nodeData._executionStepTotal;
    const hasExecutionNumbers =
      typeof stepIndexCandidate === "number" &&
      Number.isFinite(stepIndexCandidate) &&
      typeof stepTotalCandidate === "number" &&
      Number.isFinite(stepTotalCandidate) &&
      stepTotalCandidate > 0;

    if (hasExecutionNumbers) {
      return `Executing step ${Math.max(0, Math.floor(stepIndexCandidate)) + 1}/${Math.floor(stepTotalCandidate)}`;
    }

    if (totalFromSteps > 0) {
      return `Executing planned outputs (${totalFromSteps} total)`;
    }

    return "Executing planned outputs";
  }, [
    nodeData._executionStepIndex,
    nodeData._executionStepTotal,
    nodeData._status,
    nodeData._statusMessage,
    nodeData.executionStepIndex,
    nodeData.executionStepTotal,
    nodeData.executionSteps,
  ]);

  const persistNodeData = useCallback(
    (patch: Partial<AgentNodeData>) => {
      const raw = data as Record<string, unknown>;
      const { _status, _statusMessage, ...rest } = raw;
      void _status;
      void _statusMessage;

      return queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...rest,
          ...patch,
        },
      });
    },
    [data, id, queueNodeDataUpdate],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setModelId(value);
      void persistNodeData({ modelId: value });
    },
    [persistNodeData],
  );

  const handleClarificationAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setClarificationAnswers((prev) => {
        const next = {
          ...prev,
          [questionId]: value,
        };
        void persistNodeData({ clarificationAnswers: next });
        return next;
      });
    },
    [persistNodeData],
  );

  const handleRunAgent = useCallback(async () => {
    if (isExecutionActive) {
      return;
    }

    if (status.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstuetzt",
        "Agent-Lauf benoetigt eine aktive Verbindung.",
      );
      return;
    }

    const canvasId = nodeData.canvasId as Id<"canvases"> | undefined;
    if (!canvasId) {
      return;
    }

    await runAgent({
      canvasId,
      nodeId: id as Id<"nodes">,
      modelId: resolvedModelId,
    });
  }, [isExecutionActive, nodeData.canvasId, id, resolvedModelId, runAgent, status.isOffline]);

  const handleSubmitClarification = useCallback(async () => {
    if (status.isOffline) {
      toast.warning(
        "Offline aktuell nicht unterstuetzt",
        "Agent-Lauf benoetigt eine aktive Verbindung.",
      );
      return;
    }

    const canvasId = nodeData.canvasId as Id<"canvases"> | undefined;
    if (!canvasId) {
      return;
    }

    await resumeAgent({
      canvasId,
      nodeId: id as Id<"nodes">,
      clarificationAnswers,
    });
  }, [clarificationAnswers, nodeData.canvasId, id, resumeAgent, status.isOffline]);

  if (!template) {
    return null;
  }

  return (
    <BaseNodeWrapper
      nodeType="agent"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[300px] border-amber-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="agent-in"
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-3 p-3">
        <header className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Bot className="h-3.5 w-3.5" />
            <span>{template.emoji}</span>
            <span>{template.name}</span>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        </header>

        <section className="space-y-1.5">
          <Label htmlFor={`agent-model-${id}`} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Model
          </Label>
          <Select value={resolvedModelId} onValueChange={handleModelChange}>
            <SelectTrigger id={`agent-model-${id}`} className="nodrag nowheel w-full" size="sm">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {(availableModels.length > 0 ? availableModels : [selectedModel]).filter(Boolean).map((model) => (
                <SelectItem key={model!.id} value={model!.id}>
                  {model!.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {selectedModel?.label ?? resolvedModelId} - {creditCost} Cr
          </p>
        </section>

        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => void handleRunAgent()}
            disabled={isExecutionActive}
            aria-busy={isExecutionActive}
            className="nodrag w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Run agent
          </button>
          {executionProgressLine ? (
            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{executionProgressLine}</p>
          ) : null}
        </section>

        {clarificationQuestions.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Clarifications
            </p>
            {clarificationQuestions.map((question) => (
              <div key={question.id} className="space-y-1">
                <label
                  htmlFor={`agent-${id}-clarification-${question.id}`}
                  className="text-[11px] text-foreground/90"
                >
                  {question.prompt}
                  {question.required ? " *" : ""}
                </label>
                <input
                  id={`agent-${id}-clarification-${question.id}`}
                  name={`clarification-${question.id}`}
                  type="text"
                  value={clarificationAnswers[question.id] ?? ""}
                  onChange={(event) =>
                    handleClarificationAnswerChange(question.id, event.target.value)
                  }
                  className="nodrag nowheel w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void handleSubmitClarification()}
              className="nodrag w-full rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
            >
              Submit clarification
            </button>
          </section>
        ) : null}

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </p>
          <CompactList items={template.channels} />
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected Inputs
          </p>
          <CompactList items={template.expectedInputs} />
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected Outputs
          </p>
          <CompactList items={template.expectedOutputs} />
        </section>
      </div>
    </BaseNodeWrapper>
  );
}
