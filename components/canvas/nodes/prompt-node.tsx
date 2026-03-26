"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { DEFAULT_MODEL_ID, getModel } from "@/lib/ai-models";
import {
  DEFAULT_ASPECT_RATIO,
  getAiImageNodeOuterSize,
  getImageViewportSize,
  IMAGE_FORMAT_GROUP_LABELS,
  IMAGE_FORMAT_PRESETS,
} from "@/lib/image-formats";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Coins } from "lucide-react";

type PromptNodeData = {
  prompt?: string;
  aspectRatio?: string;
  model?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

export type PromptNode = Node<PromptNodeData, "prompt">;

export default function PromptNode({
  id,
  data,
  selected,
}: NodeProps<PromptNode>) {
  const nodeData = data as PromptNodeData;
  const { getEdges, getNode } = useReactFlow();

  const [prompt, setPrompt] = useState(nodeData.prompt ?? "");
  const [aspectRatio, setAspectRatio] = useState(
    nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);

  const promptRef = useRef(prompt);
  const aspectRatioRef = useRef(aspectRatio);
  promptRef.current = prompt;
  aspectRatioRef.current = aspectRatio;

  useEffect(() => {
    setPrompt(nodeData.prompt ?? "");
  }, [nodeData.prompt]);

  useEffect(() => {
    setAspectRatio(nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO);
  }, [nodeData.aspectRatio]);

  const inputMeta = useMemo(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    let textPrompt: string | undefined;
    let hasTextInput = false;

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      if (sourceNode?.type !== "text") continue;

      hasTextInput = true;
      const sourceData = sourceNode.data as { content?: string };
      if (typeof sourceData.content === "string") {
        textPrompt = sourceData.content;
        break;
      }
    }

    return {
      hasTextInput,
      textPrompt: textPrompt ?? "",
    };
  }, [edges, id, nodes]);

  const effectivePrompt = inputMeta.hasTextInput ? inputMeta.textPrompt : prompt;

  const dataRef = useRef(data);
  dataRef.current = data;

  const balance = useQuery(api.credits.getBalance);
  const creditCost = getModel(DEFAULT_MODEL_ID)?.creditCost ?? 4;

  const availableCredits =
    balance !== undefined ? balance.balance - balance.reserved : null;
  const hasEnoughCredits =
    availableCredits !== null && availableCredits >= creditCost;

  const updateData = useMutation(api.nodes.updateData);
  const createEdge = useMutation(api.edges.create);
  const generateImage = useAction(api.ai.generateImage);
  const { createNodeWithIntersection } = useCanvasPlacement();

  const debouncedSave = useDebouncedCallback(() => {
    const raw = dataRef.current as Record<string, unknown>;
    const { _status, _statusMessage, ...rest } = raw;
    void _status;
    void _statusMessage;
    updateData({
      nodeId: id as Id<"nodes">,
      data: {
        ...rest,
        prompt: promptRef.current,
        aspectRatio: aspectRatioRef.current,
      },
    });
  }, 500);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedSave();
    },
    [debouncedSave]
  );

  const handleAspectRatioChange = useCallback(
    (value: string) => {
      setAspectRatio(value);
      debouncedSave();
    },
    [debouncedSave]
  );

  const handleGenerate = useCallback(async () => {
    if (!effectivePrompt.trim() || isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      const canvasId = nodeData.canvasId as Id<"canvases">;
      if (!canvasId) throw new Error("Canvas-ID fehlt in der Node");

      const currentEdges = getEdges();
      const incomingEdges = currentEdges.filter((e) => e.target === id);
      let connectedTextPrompt: string | undefined;
      let referenceStorageId: Id<"_storage"> | undefined;

      for (const edge of incomingEdges) {
        const sourceNode = getNode(edge.source);
        if (sourceNode?.type === "text") {
          const srcData = sourceNode.data as { content?: string };
          if (typeof srcData.content === "string") {
            connectedTextPrompt = srcData.content;
          }
        }
        if (sourceNode?.type === "image") {
          const srcData = sourceNode.data as { storageId?: string };
          if (srcData.storageId) {
            referenceStorageId = srcData.storageId as Id<"_storage">;
          }
        }
      }

      const promptToUse = (connectedTextPrompt ?? prompt).trim();
      if (!promptToUse) return;

      const currentNode = getNode(id);
      const offsetX = (currentNode?.measured?.width ?? 280) + 32;
      const posX = (currentNode?.position?.x ?? 0) + offsetX;
      const posY = currentNode?.position?.y ?? 0;

      const viewport = getImageViewportSize(aspectRatio);
      const outer = getAiImageNodeOuterSize(viewport);

      const aiNodeId = await createNodeWithIntersection({
        type: "ai-image",
        position: { x: posX, y: posY },
        width: outer.width,
        height: outer.height,
        data: {
          prompt: promptToUse,
          model: DEFAULT_MODEL_ID,
          modelTier: "standard",
          canvasId,
          aspectRatio,
          outputWidth: viewport.width,
          outputHeight: viewport.height,
        },
      });

      await createEdge({
        canvasId,
        sourceNodeId: id as Id<"nodes">,
        targetNodeId: aiNodeId,
        sourceHandle: "prompt-out",
        targetHandle: "prompt-in",
      });

      await generateImage({
        canvasId,
        nodeId: aiNodeId,
        prompt: promptToUse,
        referenceStorageId,
        model: DEFAULT_MODEL_ID,
        aspectRatio,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildgenerierung fehlgeschlagen");
    } finally {
      setIsGenerating(false);
    }
  }, [
    prompt,
    effectivePrompt,
    aspectRatio,
    isGenerating,
    nodeData.canvasId,
    id,
    getEdges,
    getNode,
    createNodeWithIntersection,
    createEdge,
    generateImage,
  ]);

  return (
    <BaseNodeWrapper
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[240px] border-violet-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="image-in"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
          Eingabe
        </div>
        {inputMeta.hasTextInput ? (
          <div className="rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
            <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
              Prompt aus verbundener Text-Node
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {inputMeta.textPrompt.trim() || "(Verbundene Text-Node ist leer)"}
            </p>
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={handlePromptChange}
            placeholder="Beschreibe, was du generieren willst…"
            rows={4}
            className="nodrag nowheel w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={`prompt-format-${id}`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Format
          </Label>
          <Select
            value={aspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger
              id={`prompt-format-${id}`}
              className="nodrag nowheel w-full"
              size="sm"
            >
              <SelectValue placeholder="Seitenverhältnis" />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {(["square", "landscape", "portrait"] as const).map((group) => {
                const presets = IMAGE_FORMAT_PRESETS.filter(
                  (p) => p.group === group
                );
                if (presets.length === 0) return null;
                return (
                  <SelectGroup key={group}>
                    <SelectLabel>{IMAGE_FORMAT_GROUP_LABELS[group]}</SelectLabel>
                    {presets.map((p) => (
                      <SelectItem key={p.aspectRatio} value={p.aspectRatio}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={
              !effectivePrompt.trim() ||
              isGenerating ||
              balance === undefined ||
              (availableCredits !== null && !hasEnoughCredits)
            }
            className={`nodrag flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
              availableCredits !== null && !hasEnoughCredits
                ? "bg-muted text-muted-foreground"
                : "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generiere…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Bild generieren
                <span className="inline-flex items-center gap-1 text-xs opacity-90">
                  <Coins className="h-3 w-3" />
                  {creditCost} Cr
                </span>
              </>
            )}
          </button>
          {availableCredits !== null && !hasEnoughCredits && (
            <p className="text-center text-xs text-destructive">
              Not enough credits ({availableCredits} available, {creditCost}{" "}
              needed)
            </p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="prompt-out"
        className="!h-3 !w-3 !bg-violet-500 !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
