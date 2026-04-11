"use client";

import { useCallback, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useAuthQuery } from "@/hooks/use-auth-query";
import {
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  getAvailableAgentModels,
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
import CanvasHandle from "@/components/canvas/canvas-handle";

type AgentNodeData = {
  templateId?: string;
  canvasId?: string;
  modelId?: string;
  briefConstraints?: {
    briefing?: string;
    audience?: string;
    tone?: string;
    targetChannels?: string[];
    hardConstraints?: string[];
  };
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

type AgentBriefConstraints = {
  briefing: string;
  audience: string;
  tone: string;
  targetChannels: string[];
  hardConstraints: string[];
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

function useSafeAction<Args extends Record<string, unknown>, Output>(
  reference: FunctionReference<"action", "public", Args, Output>,
) {
  try {
    return useAction(reference);
  } catch {
    return async (args: Args): Promise<Output | undefined> => {
      void args;
      return undefined;
    };
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

function normalizeDelimitedList(value: string, allowNewLines = false): string[] {
  const separator = allowNewLines ? /[\n,]/ : /,/;
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeBriefConstraints(raw: AgentNodeData["briefConstraints"]): AgentBriefConstraints {
  return {
    briefing: typeof raw?.briefing === "string" ? raw.briefing : "",
    audience: typeof raw?.audience === "string" ? raw.audience : "",
    tone: typeof raw?.tone === "string" ? raw.tone : "",
    targetChannels: Array.isArray(raw?.targetChannels)
      ? raw.targetChannels.filter((item): item is string => typeof item === "string")
      : [],
    hardConstraints: Array.isArray(raw?.hardConstraints)
      ? raw.hardConstraints.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areBriefConstraintsEqual(left: AgentBriefConstraints, right: AgentBriefConstraints): boolean {
  return (
    left.briefing === right.briefing &&
    left.audience === right.audience &&
    left.tone === right.tone &&
    areStringArraysEqual(left.targetChannels, right.targetChannels) &&
    areStringArraysEqual(left.hardConstraints, right.hardConstraints)
  );
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

function toTemplateTranslationKey(templateId: string): string {
  return templateId.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export default function AgentNode({ id, data, selected }: NodeProps<AgentNodeType>) {
  const t = useTranslations("agentNode");
  const locale = useLocale();
  const nodeData = data as AgentNodeData;
  const template =
    getAgentTemplate(nodeData.templateId ?? DEFAULT_AGENT_TEMPLATE_ID) ??
    getAgentTemplate(DEFAULT_AGENT_TEMPLATE_ID);
  const { queueNodeDataUpdate, status } = useSafeCanvasSync();
  const subscription = useSafeSubscription();
  const userTier = normalizePublicTier(subscription?.tier ?? "free");

  const availableModels = useMemo(() => getAvailableAgentModels(userTier), [userTier]);
  const clarificationAnswersFromNode = useMemo(
    () => normalizeClarificationAnswers(nodeData.clarificationAnswers),
    [nodeData.clarificationAnswers],
  );
  const briefConstraintsFromNode = useMemo(
    () => normalizeBriefConstraints(nodeData.briefConstraints),
    [nodeData.briefConstraints],
  );
  const nodeModelId =
    typeof nodeData.modelId === "string" && nodeData.modelId.trim().length > 0
      ? nodeData.modelId
      : DEFAULT_AGENT_MODEL_ID;
  const [modelDraftId, setModelDraftId] = useState<string | null>(null);
  const [clarificationAnswersDraft, setClarificationAnswersDraft] =
    useState<AgentClarificationAnswerMap | null>(null);
  const [briefConstraintsDraft, setBriefConstraintsDraft] =
    useState<AgentBriefConstraints | null>(null);

  const modelId = modelDraftId === nodeModelId ? nodeModelId : modelDraftId ?? nodeModelId;
  const clarificationAnswers =
    clarificationAnswersDraft &&
    areAnswerMapsEqual(clarificationAnswersDraft, clarificationAnswersFromNode)
      ? clarificationAnswersFromNode
      : clarificationAnswersDraft ?? clarificationAnswersFromNode;
  const briefConstraints =
    briefConstraintsDraft &&
    areBriefConstraintsEqual(briefConstraintsDraft, briefConstraintsFromNode)
      ? briefConstraintsFromNode
      : briefConstraintsDraft ?? briefConstraintsFromNode;

  const agentActionsApi = api as unknown as {
    agents: {
      runAgent: FunctionReference<
        "action",
        "public",
        {
          canvasId: Id<"canvases">;
          nodeId: Id<"nodes">;
          modelId: string;
          locale: "de" | "en";
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
          locale: "de" | "en";
        },
        unknown
      >;
    };
  };

  const runAgent = useSafeAction(agentActionsApi.agents.runAgent);
  const resumeAgent = useSafeAction(agentActionsApi.agents.resumeAgent);
  const normalizedLocale = locale === "en" ? "en" : "de";

  const resolvedModelId = useMemo(() => {
    if (availableModels.some((model) => model.id === modelId)) {
      return modelId;
    }

    return availableModels[0]?.id ?? DEFAULT_AGENT_MODEL_ID;
  }, [availableModels, modelId]);
  const selectedModel =
    getAgentModel(resolvedModelId) ??
    availableModels[0] ??
    getAgentModel(DEFAULT_AGENT_MODEL_ID);
  const creditCost = selectedModel?.creditCost ?? 0;
  const clarificationQuestions = nodeData.clarificationQuestions ?? [];
  const templateTranslationKey = `templates.${toTemplateTranslationKey(template?.id ?? DEFAULT_AGENT_TEMPLATE_ID)}`;
  const translatedTemplateName = t(`${templateTranslationKey}.name`);
  const translatedTemplateDescription = t(`${templateTranslationKey}.description`);
  const templateName =
    translatedTemplateName === `${templateTranslationKey}.name`
      ? (template?.name ?? "")
      : translatedTemplateName;
  const templateDescription =
    translatedTemplateDescription === `${templateTranslationKey}.description`
      ? (template?.description ?? "")
      : translatedTemplateDescription;
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
      return t("executingStepFallback", {
        current: Math.max(0, Math.floor(stepIndexCandidate)) + 1,
        total: Math.floor(stepTotalCandidate),
      });
    }

    if (totalFromSteps > 0) {
      return t("executingPlannedTotalFallback", {
        total: totalFromSteps,
      });
    }

    return t("executingPlannedFallback");
  }, [
    nodeData._executionStepIndex,
    nodeData._executionStepTotal,
    nodeData._status,
    nodeData._statusMessage,
    nodeData.executionStepIndex,
    nodeData.executionStepTotal,
    nodeData.executionSteps,
    t,
  ]);

  const resolveClarificationPrompt = useCallback(
    (question: AgentClarificationQuestion) => {
      if (question.id === "briefing") {
        return t("clarificationPrompts.briefing");
      }
      if (question.id === "target-channels") {
        return t("clarificationPrompts.targetChannels");
      }
      if (question.id === "incoming-context") {
        return t("clarificationPrompts.incomingContext");
      }
      return question.prompt;
    },
    [t],
  );

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
      setModelDraftId(value);
      void persistNodeData({ modelId: value });
    },
    [persistNodeData],
  );

  const handleClarificationAnswerChange = useCallback(
    (questionId: string, value: string) => {
      const next = {
        ...clarificationAnswers,
        [questionId]: value,
      };
      setClarificationAnswersDraft(next);
      void persistNodeData({ clarificationAnswers: next });
    },
    [clarificationAnswers, persistNodeData],
  );

  const handleBriefConstraintsChange = useCallback(
    (patch: Partial<AgentBriefConstraints>) => {
      const next = {
        ...briefConstraints,
        ...patch,
      };
      setBriefConstraintsDraft(next);
      void persistNodeData({ briefConstraints: next });
    },
    [briefConstraints, persistNodeData],
  );

  const handleRunAgent = async () => {
    if (isExecutionActive) {
      return;
    }

    if (status.isOffline) {
      toast.warning(
        t("offlineTitle"),
        t("offlineDescription"),
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
      locale: normalizedLocale,
    });
  };

  const handleSubmitClarification = async () => {
    if (status.isOffline) {
      toast.warning(
        t("offlineTitle"),
        t("offlineDescription"),
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
      locale: normalizedLocale,
    });
  };

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
      <CanvasHandle
        nodeId={id}
        nodeType="agent"
        type="target"
        position={Position.Left}
        id="agent-in"
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="agent"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-3 p-3">
        <header className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Bot className="h-3.5 w-3.5" />
            <span>{template.emoji}</span>
            <span>{templateName}</span>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{templateDescription}</p>
        </header>

        <section className="space-y-1.5">
          <Label htmlFor={`agent-model-${id}`} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("modelLabel")}
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
            {t("modelCreditMeta", {
              model: selectedModel?.label ?? resolvedModelId,
              credits: creditCost,
            })}
          </p>
        </section>

        <section className="space-y-1.5">
          <Label htmlFor={`agent-${id}-briefing`} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("briefingLabel")}
          </Label>
          <textarea
            id={`agent-${id}-briefing`}
            name="agent-briefing"
            value={briefConstraints.briefing}
            onChange={(event) =>
              handleBriefConstraintsChange({ briefing: event.target.value })
            }
            placeholder={t("briefingPlaceholder")}
            className="nodrag nowheel min-h-20 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </section>

        <section className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("constraintsLabel")}
          </p>
          <div className="space-y-1">
            <label htmlFor={`agent-${id}-audience`} className="text-[11px] text-muted-foreground">
              {t("audienceLabel")}
            </label>
            <input
              id={`agent-${id}-audience`}
              name="agent-audience"
              type="text"
              value={briefConstraints.audience}
              onChange={(event) =>
                handleBriefConstraintsChange({ audience: event.target.value })
              }
              className="nodrag nowheel w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`agent-${id}-tone`} className="text-[11px] text-muted-foreground">
              {t("toneLabel")}
            </label>
            <input
              id={`agent-${id}-tone`}
              name="agent-tone"
              type="text"
              value={briefConstraints.tone}
              onChange={(event) => handleBriefConstraintsChange({ tone: event.target.value })}
              className="nodrag nowheel w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`agent-${id}-target-channels`} className="text-[11px] text-muted-foreground">
              {t("targetChannelsLabel")}
            </label>
            <input
              id={`agent-${id}-target-channels`}
              name="agent-target-channels"
              type="text"
              value={briefConstraints.targetChannels.join(", ")}
              onChange={(event) =>
                handleBriefConstraintsChange({
                  targetChannels: normalizeDelimitedList(event.target.value),
                })
              }
              placeholder={t("targetChannelsPlaceholder")}
              className="nodrag nowheel w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`agent-${id}-hard-constraints`} className="text-[11px] text-muted-foreground">
              {t("hardConstraintsLabel")}
            </label>
            <textarea
              id={`agent-${id}-hard-constraints`}
              name="agent-hard-constraints"
              value={briefConstraints.hardConstraints.join("\n")}
              onChange={(event) =>
                handleBriefConstraintsChange({
                  hardConstraints: normalizeDelimitedList(event.target.value, true),
                })
              }
              placeholder={t("hardConstraintsPlaceholder")}
              className="nodrag nowheel min-h-16 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </section>

        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => void handleRunAgent()}
            disabled={isExecutionActive}
            aria-busy={isExecutionActive}
            className="nodrag w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("runAgentButton")}
          </button>
          {executionProgressLine ? (
            <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{executionProgressLine}</p>
          ) : null}
        </section>

        {clarificationQuestions.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("clarificationsLabel")}
            </p>
            {clarificationQuestions.map((question) => (
              <div key={question.id} className="space-y-1">
                <label
                  htmlFor={`agent-${id}-clarification-${question.id}`}
                  className="text-[11px] text-foreground/90"
                >
                  {resolveClarificationPrompt(question)}
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
              {t("submitClarificationButton")}
            </button>
          </section>
        ) : null}

        <details className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("templateReferenceLabel")}
          </summary>
          <div className="mt-2 space-y-2">
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("templateReferenceChannelsLabel")} ({template.channels.length})
              </p>
              <CompactList items={template.channels} />
            </section>
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("templateReferenceInputsLabel")} ({template.expectedInputs.length})
              </p>
              <CompactList items={template.expectedInputs} />
            </section>
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("templateReferenceOutputsLabel")} ({template.expectedOutputs.length})
              </p>
              <CompactList items={template.expectedOutputs} />
            </section>
          </div>
        </details>
      </div>
    </BaseNodeWrapper>
  );
}
