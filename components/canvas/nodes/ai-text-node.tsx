"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas ai text node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Position,
  useReactFlow,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
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
  DEFAULT_AI_TEXT_MODEL_ID,
  getAiTextModel,
  getAvailableAiTextModels,
} from "@/lib/ai-text-models";
import { classifyError } from "@/lib/ai-errors";
import { normalizePublicTier } from "@/lib/tier-credits";
import { toast } from "@/lib/toast";
import BaseNodeWrapper from "./base-node-wrapper";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { Label } from "@/components/ui/label";
import { CanvasAiModelSelector } from "@/components/canvas/nodes/canvas-ai-model-selector";

type AiTextNodeData = {
  instruction?: string;
  inputText?: string;
  modelId?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

type SourceTextNodeData = {
  content?: string;
  outputText?: string;
};

export type AiTextNodeType = Node<AiTextNodeData, "ai-text">;

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

  const generateText = useAction(
    (api as unknown as {
      ai: {
        generateText: FunctionReference<
          "action",
          "public",
          {
            canvasId: Id<"canvases">;
            sourceNodeId: Id<"nodes">;
            outputNodeId: Id<"nodes">;
            modelId: string;
            instruction?: string;
            inputText?: string;
          },
          { queued: true; outputNodeId: Id<"nodes"> }
        >;
      };
    }).ai.generateText,
  );

  const [instruction, setInstruction] = useState(nodeData.instruction ?? "");
  const [inputText, setInputText] = useState(nodeData.inputText ?? "");
  const [modelId, setModelId] = useState(nodeData.modelId ?? DEFAULT_AI_TEXT_MODEL_ID);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInputEditing, setIsInputEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
    const texts: string[] = [];
    let sourceCount = 0;

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (sourceNode?.type !== "text" && sourceNode?.type !== "ai-text-output") {
        continue;
      }

      sourceCount += 1;
      const text = getNodeTextContent(sourceNode);
      if (text) {
        texts.push(text);
      }
    }

    return {
      sourceCount,
      text: texts.join("\n\n"),
    };
  }, [edges, id, nodes]);

  const connectedText = connectedInputMeta.text;
  const hasConnectedInput = connectedInputMeta.sourceCount > 0;
  const availableCredits =
    balance !== undefined ? balance.balance - balance.reserved : null;
  const hasEnoughCredits =
    availableCredits === null ? true : availableCredits >= creditCost;
  const hasAnyInput =
    instruction.trim().length > 0 ||
    inputText.trim().length > 0 ||
    connectedText.trim().length > 0;

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

  useEffect(() => {
    if (!hasConnectedInput || isInputEditing) {
      return;
    }
    if (connectedText === inputText) {
      return;
    }

    setInputText(connectedText);
    debouncedSave(instruction, connectedText, modelId);
  }, [
    connectedText,
    debouncedSave,
    hasConnectedInput,
    inputText,
    instruction,
    isInputEditing,
    modelId,
  ]);

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

    try {
      const effectiveInputText = (inputText.trim() || connectedText.trim()).trim();
      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 360) + 32;
      const position = {
        x: (currentNode?.position?.x ?? 0) + offsetX,
        y: currentNode?.position?.y ?? 0,
      };
      const clientRequestId = crypto.randomUUID();

      const outputNodeId = await createNodeConnectedFromSource({
        type: "ai-text-output",
        position,
        data: {
          instruction: instruction.trim(),
          inputText: effectiveInputText,
          modelId: resolvedModelId,
          creditCost,
          canvasId,
        },
        clientRequestId,
        sourceNodeId: id as Id<"nodes">,
        sourceHandle: "ai-text-out",
        targetHandle: "ai-text-output-in",
      });

      await toast.promise(
        generateText({
          canvasId,
          sourceNodeId: id as Id<"nodes">,
          outputNodeId,
          modelId: resolvedModelId,
          instruction: instruction.trim() || undefined,
          inputText: effectiveInputText || undefined,
        }),
        {
          loading: t("generating"),
          success: t("generationQueuedTitle"),
          error: t("generationFailed"),
          description: {
            success: t("generationQueuedDescription"),
          },
        },
      );
    } catch (error) {
      const classified = classifyError(error);
      setLocalError(classified.rawMessage ?? t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  }, [
    availableCredits,
    connectedText,
    createNodeConnectedFromSource,
    creditCost,
    generateText,
    getNode,
    hasAnyInput,
    hasEnoughCredits,
    id,
    inputText,
    instruction,
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

  return (
    <BaseNodeWrapper
      nodeType="ai-text"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="flex h-full min-h-0 w-full min-w-0 flex-col"
    >
      <CanvasHandle
        nodeId={id}
        nodeType="ai-text"
        type="target"
        position={Position.Left}
        id="ai-text-in"
        className="!h-3 !w-3 !border-2 !border-background !bg-violet-600"
      />

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-300">
        <Wand2 className="h-3.5 w-3.5" />
        {t("label")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-instruction`} className="text-[11px] text-muted-foreground">
            {t("instructionLabel")}
          </Label>
          <textarea
            id={`${id}-instruction`}
            value={instruction}
            onChange={handleInstructionChange}
            placeholder={t("instructionPlaceholder")}
            className="nodrag nowheel min-h-[68px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none transition-colors focus:border-violet-400"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-input`} className="text-[11px] text-muted-foreground">
            {t("inputLabel")}
          </Label>
          {hasConnectedInput ? (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
              <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                {t("inputFromTextNode")}
              </p>
              {inputText.trim().length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("connectedInputEmpty")}
                </p>
              ) : null}
              <textarea
                id={`${id}-input`}
                value={inputText}
                onChange={handleInputTextChange}
                onFocus={() => setIsInputEditing(true)}
                onBlur={() => setIsInputEditing(false)}
                placeholder={t("inputPlaceholder")}
                className="nodrag nowheel mt-2 min-h-[84px] w-full resize-none rounded-md border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : (
          <textarea
            id={`${id}-input`}
            value={inputText}
            onChange={handleInputTextChange}
            onFocus={() => setIsInputEditing(true)}
            onBlur={() => setIsInputEditing(false)}
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
