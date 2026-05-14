"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas ai text node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Position,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  appendLocalNodeStreamChunk,
  appendLocalNodeStreamEvent,
  getLocalNodeStreamSnapshot,
  markLocalNodeStreamError,
  setLocalNodeStream,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";
import {
  DEFAULT_AI_TEXT_MODEL_ID,
  getAiTextModel,
  getAvailableAiTextModels,
} from "@/lib/ai-text-models";
import { classifyError } from "@/lib/ai-errors";
import { normalizePublicTier } from "@/lib/tier-credits";
import { toast } from "@/lib/toast";
import BaseNodeWrapper from "./base-node-wrapper";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { RepeatingInputHandles } from "@/components/canvas/repeating-input-handles";
import { Label } from "@/components/ui/label";
import { CanvasAiModelSelector } from "@/components/canvas/nodes/canvas-ai-model-selector";
import { AiRunStatusPanel } from "@/components/ui/ai-run-status";
import { createAiRunEvent, type AiRunEvent, type AiRunPhase } from "@/lib/ai-run-history";
import { resolveVisibleRepeatingInputHandles } from "@/lib/canvas-repeating-input-handles";
import {
  MAX_AI_TEXT_DRAFT_INPUTS,
  MAX_AI_TEXT_INSTRUCTION_INPUTS,
} from "@/lib/canvas-connection-policy";

type AiTextNodeData = {
  instruction?: string;
  inputText?: string;
  modelId?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

type AiTextOutputState = {
  status?: string;
  statusMessage?: string;
  runFinishedAt?: number;
};

type SourceTextNodeData = {
  content?: string;
  outputText?: string;
};

type SourceTextNode = {
  id: string;
  type?: string;
  data?: unknown;
  position?: { x?: number; y?: number };
};

type ConnectedTextInput = {
  key: string;
  sourceNodeId: string;
  label: string;
  text: string;
};

export type AiTextNodeType = Node<AiTextNodeData, "ai-text">;

async function readTextStream(response: Response, outputNodeId: string): Promise<void> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (!response.body) {
    throw new Error("AI text stream response had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    appendLocalNodeStreamChunk(outputNodeId, decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) {
    appendLocalNodeStreamChunk(outputNodeId, tail);
  }
}

function getNodeTextContent(node: { type?: string; data?: unknown } | undefined): string {
  if (!node || !node.data || typeof node.data !== "object") {
    return "";
  }

  const data = node.data as SourceTextNodeData;
  if (node.type === "ai-text-output") {
    return typeof data.outputText === "string" ? data.outputText.trim() : "";
  }

  return typeof data.content === "string" ? data.content.trim() : "";
}

function isInstructionInputHandle(handle: string | null | undefined): boolean {
  return typeof handle === "string" && handle.startsWith("ai-text-instruction-in");
}

function isDraftInputHandle(handle: string | null | undefined): boolean {
  return (
    handle == null ||
    handle === "" ||
    handle === "null" ||
    (typeof handle === "string" &&
      handle.startsWith("ai-text-in") &&
      !isInstructionInputHandle(handle))
  );
}

function compareSourceNodes(
  left: { id: string; position?: { x?: number; y?: number } },
  right: { id: string; position?: { x?: number; y?: number } },
): number {
  const leftY = typeof left.position?.y === "number" ? left.position.y : 0;
  const rightY = typeof right.position?.y === "number" ? right.position.y : 0;
  if (leftY !== rightY) return leftY - rightY;

  const leftX = typeof left.position?.x === "number" ? left.position.x : 0;
  const rightX = typeof right.position?.x === "number" ? right.position.x : 0;
  if (leftX !== rightX) return leftX - rightX;

  return left.id.localeCompare(right.id);
}

function buildConnectedRoleText(
  inputs: readonly ConnectedTextInput[],
  labelPrefix: string,
): string {
  const nonEmptyInputs = inputs
    .map((input) => input.text.trim())
    .filter((text) => text.length > 0);

  if (nonEmptyInputs.length <= 1) {
    return nonEmptyInputs[0] ?? "";
  }

  return nonEmptyInputs
    .map((text, index) => [`${labelPrefix} ${index + 1}:`, text].join("\n"))
    .join("\n\n");
}

export default function AiTextNode({ id, data, selected }: NodeProps<AiTextNodeType>) {
  const t = useTranslations("aiTextNode");
  const tToast = useTranslations("toasts");
  const router = useRouter();
  const nodeData = data as AiTextNodeData;
  const { getNode } = useReactFlow();
  const { createNodeConnectedFromSource } = useCanvasPlacement();
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const balance = useAuthQuery(api.credits.getBalance);
  const subscription = useAuthQuery(api.credits.getSubscription);
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);

  const [instruction, setInstruction] = useState(nodeData.instruction ?? "");
  const [inputText, setInputText] = useState(nodeData.inputText ?? "");
  const [modelId, setModelId] = useState(nodeData.modelId ?? DEFAULT_AI_TEXT_MODEL_ID);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const localStream = useSyncExternalStore(
    (listener) => subscribeToLocalNodeStream(id, listener),
    () => getLocalNodeStreamSnapshot(id),
    () => undefined,
  );

  useEffect(() => {
    setInstruction(nodeData.instruction ?? "");
  }, [nodeData.instruction]);

  useEffect(() => {
    setInputText(nodeData.inputText ?? "");
  }, [nodeData.inputText]);

  useEffect(() => {
    setModelId(nodeData.modelId ?? DEFAULT_AI_TEXT_MODEL_ID);
  }, [nodeData.modelId]);

  const userTier = normalizePublicTier(subscription?.tier ?? "free");
  const availableModels = useMemo(() => getAvailableAiTextModels(userTier), [userTier]);

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }

    if (!availableModels.some((model) => model.id === modelId)) {
      setModelId(availableModels[0]!.id);
    }
  }, [availableModels, modelId]);

  const selectedModel =
    getAiTextModel(modelId) ??
    availableModels[0] ??
    getAiTextModel(DEFAULT_AI_TEXT_MODEL_ID);
  const resolvedModelId = selectedModel?.id ?? DEFAULT_AI_TEXT_MODEL_ID;
  const creditCost = selectedModel?.creditCost ?? 0;

  const connectedInputMeta = useMemo(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    const instructionSourceNodes: Array<{ edgeId?: string; node: SourceTextNode }> = [];
    const draftSourceNodes: Array<{ edgeId?: string; node: SourceTextNode }> = [];

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (sourceNode?.type !== "text" && sourceNode?.type !== "ai-text-output") {
        continue;
      }

      if (isInstructionInputHandle(edge.targetHandle)) {
        instructionSourceNodes.push({ edgeId: edge.id, node: sourceNode });
        continue;
      }

      if (isDraftInputHandle(edge.targetHandle)) {
        draftSourceNodes.push({ edgeId: edge.id, node: sourceNode });
      }
    }

    const instructionInputs = instructionSourceNodes
      .sort((left, right) => compareSourceNodes(left.node, right.node))
      .slice(0, MAX_AI_TEXT_INSTRUCTION_INPUTS)
      .map(({ edgeId, node }, index) => ({
        key: edgeId ?? `${node.id}:instruction:${index}`,
        sourceNodeId: node.id,
        label: `Vorgabe ${index + 1}`,
        text: getNodeTextContent(node),
      }));
    const draftInputs = draftSourceNodes
      .sort((left, right) => compareSourceNodes(left.node, right.node))
      .slice(0, MAX_AI_TEXT_DRAFT_INPUTS)
      .map(({ edgeId, node }, index) => ({
        key: edgeId ?? `${node.id}:draft:${index}`,
        sourceNodeId: node.id,
        label: `Text ${index + 1}`,
        text: getNodeTextContent(node),
      }));

    return {
      instructionInputs,
      draftInputs,
      instructionText: buildConnectedRoleText(instructionInputs, "Vorgabe"),
      draftText: buildConnectedRoleText(draftInputs, "Text"),
    };
  }, [edges, id, nodes]);

  const connectedInstructionText = connectedInputMeta.instructionText;
  const connectedText = connectedInputMeta.draftText;
  const hasConnectedInstructionInput = connectedInputMeta.instructionInputs.length > 0;
  const hasConnectedInput = connectedInputMeta.draftInputs.length > 0;
  const effectiveInstruction = hasConnectedInstructionInput
    ? connectedInstructionText
    : instruction;
  const effectiveInputText = hasConnectedInput ? connectedText : inputText;
  const nodeTypeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.type ?? ""] as const)),
    [nodes],
  );
  const inputHandles = useMemo(
    () =>
      resolveVisibleRepeatingInputHandles({
        nodeType: "ai-text",
        nodeId: id,
        edges,
        nodeTypeById,
      }),
    [edges, id, nodeTypeById],
  );
  const availableCredits =
    balance !== undefined ? balance.balance - balance.reserved : null;
  const hasEnoughCredits =
    availableCredits === null ? true : availableCredits >= creditCost;
  const hasAnyInput =
    effectiveInstruction.trim().length > 0 || effectiveInputText.trim().length > 0;

  const debouncedSave = useDebouncedCallback(
    (nextInstruction: string, nextInputText: string, nextModelId: string) => {
      const raw = data as Record<string, unknown>;
      const { _status, _statusMessage, ...rest } = raw;
      void _status;
      void _statusMessage;

      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...rest,
          instruction: nextInstruction,
          inputText: nextInputText,
          modelId: nextModelId,
        },
      });
    },
    500,
  );

  const handleInstructionChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setInstruction(value);
      debouncedSave(value, inputText, modelId);
    },
    [debouncedSave, inputText, modelId],
  );

  const handleInputTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setInputText(value);
      debouncedSave(instruction, value, modelId);
    },
    [debouncedSave, instruction, modelId],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setModelId(value);
      debouncedSave(instruction, inputText, value);
    },
    [debouncedSave, inputText, instruction],
  );

  const handleGenerate = useCallback(async () => {
    if (!hasAnyInput || isGenerating) {
      return;
    }

    if (status.isOffline) {
      toast.warning(
        t("offlineTitle"),
        t("offlineDescription"),
      );
      return;
    }

    if (availableCredits !== null && !hasEnoughCredits) {
      toast.action(tToast("ai.insufficientCreditsTitle"), {
        description: tToast("ai.insufficientCreditsDesc", {
          needed: creditCost,
          available: availableCredits,
        }),
        label: tToast("billing.topUp"),
        onClick: () => router.push("/settings/billing"),
        type: "warning",
      });
      return;
    }

    const canvasId = nodeData.canvasId as Id<"canvases"> | undefined;
    if (!canvasId) {
      setLocalError(t("missingCanvas"));
      return;
    }

    setLocalError(null);
    setIsGenerating(true);
    let outputNodeId: Id<"nodes"> | null = null;
    const runStartedAt = Date.now();
    const initialEvents: AiRunEvent[] = [
      createAiRunEvent({
        phase: "preparing",
        message: t("run.preparingMessage"),
        createdAt: runStartedAt,
      }),
    ];
    setLocalNodeStream(id, {
      text: "",
      status: "streaming",
      phase: "preparing",
      startedAt: runStartedAt,
      events: initialEvents,
    });

    try {
      const instructionToUse = effectiveInstruction.trim();
      const inputTextToUse = effectiveInputText.trim();
      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 360) + 32;
      const position = {
        x: (currentNode?.position?.x ?? 0) + offsetX,
        y: currentNode?.position?.y ?? 0,
      };
      const clientRequestId = crypto.randomUUID();

      outputNodeId = await createNodeConnectedFromSource({
        type: "ai-text-output",
        position,
        data: {
          instruction: instructionToUse,
          inputText: inputTextToUse,
          modelId: resolvedModelId,
          creditCost,
          canvasId,
          runStartedAt,
          runEvents: initialEvents,
        },
        clientRequestId,
        sourceNodeId: id as Id<"nodes">,
        sourceHandle: "ai-text-out",
        targetHandle: "ai-text-output-in",
      });

      setLocalNodeStream(outputNodeId, {
        text: "",
        status: "streaming",
        phase: "streaming",
        startedAt: runStartedAt,
        events: [
          ...initialEvents,
          createAiRunEvent({
            phase: "streaming",
            message: t("run.streamingMessage"),
          }),
        ],
      });
      appendLocalNodeStreamEvent(id, {
        phase: "streaming",
        message: t("run.streamingMessage"),
      });

      await toast.promise(
        fetch("/api/ai-stream/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasId,
            sourceNodeId: id,
            outputNodeId,
            modelId: resolvedModelId,
            instruction: instructionToUse || undefined,
            inputText: inputTextToUse || undefined,
          }),
        }).then((response) => readTextStream(response, outputNodeId!)),
        {
          loading: t("generating"),
          success: t("generationQueuedTitle"),
          error: t("generationFailed"),
          description: {
            success: t("generationQueuedDescription"),
          },
        },
      );
      appendLocalNodeStreamEvent(id, {
        phase: "finalizing",
        message: t("run.finalizingMessage"),
        status: "running",
      });
    } catch (error) {
      const classified = classifyError(error);
      if (outputNodeId) {
        markLocalNodeStreamError(
          outputNodeId,
          classified.rawMessage ?? t("generationFailed"),
        );
      }
      appendLocalNodeStreamEvent(id, {
        phase: "error",
        message: classified.rawMessage ?? t("generationFailed"),
        status: "error",
      });
      setLocalError(classified.rawMessage ?? t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  }, [
    availableCredits,
    createNodeConnectedFromSource,
    creditCost,
    effectiveInputText,
    effectiveInstruction,
    getNode,
    hasAnyInput,
    hasEnoughCredits,
    id,
    isGenerating,
    nodeData.canvasId,
    resolvedModelId,
    router,
    status.isOffline,
    t,
    tToast,
  ]);

  const outputText =
    typeof (data as Record<string, unknown>).outputText === "string"
      ? ((data as Record<string, unknown>).outputText as string).trim()
      : "";
  const isBusy = isGenerating;
  const errorMessage = nodeData._statusMessage ?? localError;
  const generateDisabled = isBusy || !hasAnyInput;
  const connectedOutputStates = useMemo<AiTextOutputState[]>(() => {
    const outputEdges = edges.filter((edge) => edge.source === id);
    return outputEdges
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter((node) => node?.type === "ai-text-output")
      .map((node) => {
        const outputData =
          node && typeof node.data === "object" && node.data !== null
            ? (node.data as Record<string, unknown>)
            : {};
        return {
          status: typeof outputData._status === "string" ? outputData._status : undefined,
          statusMessage:
            typeof outputData._statusMessage === "string"
              ? outputData._statusMessage
              : undefined,
          runFinishedAt:
            typeof outputData.runFinishedAt === "number"
              ? outputData.runFinishedAt
              : undefined,
        };
      });
  }, [edges, id, nodes]);
  const connectedOutputPhase = useMemo<AiRunPhase | undefined>(() => {
    if (
      connectedOutputStates.some((output) =>
        output.status === "executing" ||
        output.status === "analyzing" ||
        output.status === "clarifying",
      )
    ) {
      return undefined;
    }
    if (connectedOutputStates.some((output) => output.status === "error")) {
      return "error";
    }
    if (connectedOutputStates.some((output) => output.status === "done")) {
      return "done";
    }
    return undefined;
  }, [connectedOutputStates]);
  const runPhase = connectedOutputPhase ?? localStream?.phase;
  const runEvents = useMemo(() => {
    if (!localStream?.events || !connectedOutputPhase) {
      return localStream?.events;
    }
    const lastEvent = localStream.events.at(-1);
    if (lastEvent?.phase === connectedOutputPhase) {
      return localStream.events;
    }
    const terminalOutput = connectedOutputStates.find(
      (output) => output.status === connectedOutputPhase,
    );
    return [
      ...localStream.events,
      createAiRunEvent({
        phase: connectedOutputPhase,
        message:
          connectedOutputPhase === "done"
            ? t("run.doneMessage")
            : terminalOutput?.statusMessage ?? t("generationFailed"),
        createdAt: terminalOutput?.runFinishedAt,
        status: connectedOutputPhase === "done" ? "success" : "error",
      }),
    ];
  }, [connectedOutputPhase, connectedOutputStates, localStream?.events, t]);
  const runLabels = {
    phase: {
      preparing: t("run.phase.preparing"),
      "reading-context": t("run.phase.readingContext"),
      streaming: t("run.phase.streaming"),
      "calling-tools": t("run.phase.callingTools"),
      finalizing: t("run.phase.finalizing"),
      done: t("run.phase.done"),
      error: t("run.phase.error"),
    } satisfies Record<AiRunPhase, string>,
    progressTitle: t("run.progressTitle"),
    eventsTitle: t("run.eventsTitle"),
    toolCallsTitle: t("run.toolCallsTitle"),
    noEvents: t("run.noEvents"),
    running: t("run.running"),
    success: t("run.success"),
    error: t("run.error"),
    details: t("run.details"),
    input: t("run.input"),
    output: t("run.output"),
    elapsed: t("run.elapsed", { time: "{time}" }),
  };

  return (
    <BaseNodeWrapper
      nodeType="ai-text"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <RepeatingInputHandles
        nodeId={id}
        nodeType="ai-text"
        handles={inputHandles}
      />

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-300">
        <Wand2 className="h-3.5 w-3.5" />
        {t("label")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="space-y-1.5">
          <Label
            htmlFor={`${id}-instruction`}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            <span>{t("instructionLabel")}</span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">
              {t("instructionBadge")}
            </span>
          </Label>
          {hasConnectedInstructionInput ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {t("instructionFromTextNode")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("instructionRoleHint")}
              </p>
              <div className="mt-1 space-y-2">
                {connectedInputMeta.instructionInputs.map((input) => (
                  <div key={input.key}>
                    <p className="text-[10px] font-medium uppercase text-amber-700/80 dark:text-amber-300/80">
                      {input.label}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {input.text.trim() || t("connectedInstructionEmpty")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <textarea
              id={`${id}-instruction`}
              value={instruction}
              onChange={handleInstructionChange}
              placeholder={t("instructionPlaceholder")}
              className="nodrag nowheel min-h-[68px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none transition-colors focus:border-violet-400"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`${id}-input`}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
            <span>{t("inputLabel")}</span>
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-teal-700 dark:text-teal-300">
              {t("inputBadge")}
            </span>
          </Label>
          {hasConnectedInput ? (
            <div className="rounded-md border border-teal-500/30 bg-teal-500/5 px-3 py-2">
              <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                {t("inputFromTextNode")}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("inputRoleHint")}
              </p>
              <div className="mt-1 space-y-2">
                {connectedInputMeta.draftInputs.map((input) => (
                  <div key={input.key}>
                    <p className="text-[10px] font-medium uppercase text-teal-700/80 dark:text-teal-300/80">
                      {input.label}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {input.text.trim() || t("connectedInputEmpty")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <textarea
              id={`${id}-input`}
              value={inputText}
              onChange={handleInputTextChange}
              placeholder={t("inputPlaceholder")}
              className="nodrag nowheel min-h-[84px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none transition-colors focus:border-violet-400"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">{t("modelLabel")}</Label>
          <CanvasAiModelSelector
            kind="ai-text"
            value={resolvedModelId}
            onValueChange={handleModelChange}
            userTier={userTier}
            className="h-9 w-full"
            placeholder={t("modelLabel")}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generateDisabled}
          className="nodrag inline-flex h-9 items-center justify-center gap-2 rounded-md bg-violet-600 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t("generateButton")}
        </button>

        <AiRunStatusPanel
          phase={runPhase}
          startedAt={localStream?.startedAt}
          events={runEvents}
          toolCalls={localStream?.toolCalls}
          labels={runLabels}
          accent="violet"
        />

        {availableCredits !== null && !hasEnoughCredits ? (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {t("insufficientCredits", {
              needed: creditCost,
              available: availableCredits,
            })}
          </div>
        ) : null}

        {outputText ? (
          <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-2.5 text-xs text-muted-foreground">
            {t("legacyOutputHint")}
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType="ai-text"
        type="source"
        position={Position.Right}
        id="ai-text-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-600"
      />
    </BaseNodeWrapper>
  );
}
