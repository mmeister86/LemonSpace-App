"use client";

/**
 * Onboarding note:
 * Renders the derived Instagram post mockup node. Keep rendering derived from graph bindings so user-edited field nodes remain the source of truth.
 */

import { Position, type Node, type NodeProps } from "@xyflow/react";
import { CheckCircle2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InstagramPost } from "@/components/agents/instagram/ui/instagram-post";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useZoomAwarePreviewQuality } from "@/components/canvas/use-zoom-aware-preview-quality";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { usePipelinePreview } from "@/hooks/use-pipeline-preview";
import {
  resolveRenderPreviewInputFromGraph,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";
import {
  INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
  INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
  INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
  INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
  INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
  resolveInstagramPostMockup,
} from "@/lib/instagram-post-mockup";
import BaseNodeWrapper from "./base-node-wrapper";
import { RenderNodePreviewSurface } from "./render-node-ui";
import {
  resolveRenderPreviewDisplaySize,
  sanitizeRenderData,
  type RenderNodeData,
} from "./render-node-state";
import { useRenderNodePreview } from "./use-render-node-preview";

type InstagramPostMockupNodeData = {
  title?: string;
  channel?: string;
  runId?: string;
  syntheticPreviewFields?: string[];
  assumptions?: string[];
  snapshot?: Record<string, unknown>;
  _status?: string;
  _statusMessage?: string;
};

type InstagramPostMockupNodeType = Node<
  InstagramPostMockupNodeData,
  "instagram-post-mockup"
>;

const HANDLE_SPECS = [
  { id: INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE, top: "18%" },
  { id: INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE, top: "36%" },
  { id: INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE, top: "48%" },
  { id: INSTAGRAM_POST_MOCKUP_CTA_HANDLE, top: "60%" },
  { id: INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE, top: "72%" },
  { id: INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE, top: "84%" },
] as const;

const PUBLISH_STEP_DELAY_MS = 650;
const PUBLISH_SUCCESS_CLOSE_DELAY_MS = 900;

const PUBLISH_SIMULATION_STEPS = [
  { label: "Verbinde mit Instagram...", progress: 12 },
  { label: "Prüfe Feed-Ziel...", progress: 28 },
  { label: "Lade Bild hoch...", progress: 46 },
  { label: "Erstelle Text...", progress: 64 },
  { label: "Setze Hashtags und Alt-Text...", progress: 82 },
  { label: "Veröffentliche im Feed...", progress: 94 },
  { label: "Beitrag veröffentlicht.", progress: 100 },
] as const;

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function visualSourceNode(args: {
  graph: CanvasGraphSnapshot;
  nodeId: string;
}): CanvasGraphNodeLike | null {
  const incoming = args.graph.incomingEdgesByTarget.get(args.nodeId) ?? [];
  const edge = incoming.find(
    (candidate) => candidate.targetHandle === INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  );
  return edge ? args.graph.nodesById.get(edge.source) ?? null : null;
}

function InstagramRenderPreviewSlot({ nodeId }: { nodeId: string }) {
  const graph = useCanvasGraph();
  const node = graph.nodesById.get(nodeId);
  const renderData = sanitizeRenderData((node?.data ?? {}) as RenderNodeData);
  const previewState = useRenderNodePreview({
    id: nodeId,
    localData: renderData,
    width: 470,
    height: 470,
    isFullscreenOpen: false,
  });
  const previewDisplaySize = useMemo(
    () =>
      resolveRenderPreviewDisplaySize({
        containerWidth: 470,
        containerHeight: 470,
        aspectRatio: previewState.targetAspectRatio ?? previewState.preview.previewAspectRatio,
      }),
    [previewState.preview.previewAspectRatio, previewState.targetAspectRatio],
  );

  return (
    <div className="absolute inset-0 bg-muted/40">
      <RenderNodePreviewSurface
        hasSource={previewState.hasSource}
        canvasRef={previewState.preview.canvasRef}
        isAlphaBearing={previewState.isAlphaBearing}
        displaySize={previewDisplaySize}
      />
    </div>
  );
}

function InstagramCropPreviewSlot({ nodeId }: { nodeId: string }) {
  const graph = useCanvasGraph();
  const { previewQuality, sourceQuality } = useZoomAwarePreviewQuality({
    width: 470,
    height: 470,
    maxDevicePixelRatio: 2,
  });
  const previewInput = useMemo(
    () => resolveRenderPreviewInputFromGraph({ nodeId, graph, sourceQuality }),
    [graph, nodeId, sourceQuality],
  );
  const preview = usePipelinePreview({
    sourceUrl: previewInput.sourceUrl,
    sourceComposition: previewInput.sourceComposition,
    steps: previewInput.steps,
    nodeWidth: 470,
    previewScale: 0.5,
    maxPreviewWidth: 720,
    maxDevicePixelRatio: 1.25,
    previewQuality,
  });

  return (
    <div className="absolute inset-0 bg-muted/40">
      <RenderNodePreviewSurface
        hasSource={preview.hasSource}
        canvasRef={preview.canvasRef}
        isAlphaBearing={previewInput.isAlphaBearing}
      />
    </div>
  );
}

function InstagramPublishSimulationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = PUBLISH_SIMULATION_STEPS[stepIndex] ?? PUBLISH_SIMULATION_STEPS[0];
  const isComplete = stepIndex === PUBLISH_SIMULATION_STEPS.length - 1;
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setStepIndex(0);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        if (isComplete) {
          handleOpenChange(false);
          return;
        }

        setStepIndex((currentIndex) =>
          Math.min(currentIndex + 1, PUBLISH_SIMULATION_STEPS.length - 1),
        );
      },
      isComplete ? PUBLISH_SUCCESS_CLOSE_DELAY_MS : PUBLISH_STEP_DELAY_MS,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [handleOpenChange, isComplete, open, stepIndex]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Instagram-Post senden</DialogTitle>
          <DialogDescription>
            Demo-Simulation: Es wird nichts an Instagram oder den Server gesendet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" aria-live="polite" aria-atomic="true">
          <div className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-300">
              {isComplete ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">{currentStep.label}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {isComplete
                  ? "Der Feed-Post ist fuer die Demo erfolgreich veroeffentlicht."
                  : "Der direkte Feed-Post wird realitaetsnah vorbereitet."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Progress value={currentStep.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{isComplete ? "Abgeschlossen" : "In Arbeit"}</span>
              <span className="tabular-nums">{currentStep.progress}%</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InstagramPostMockupNode({
  id,
  data,
  selected,
}: NodeProps<InstagramPostMockupNodeType>) {
  const graph = useCanvasGraph();
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const nodeData = data as InstagramPostMockupNodeData;
  const resolved = resolveInstagramPostMockup({
    nodeId: id,
    graph,
    data: nodeData,
  });
  const visualNode = visualSourceNode({ graph, nodeId: id });
  const imageSlot =
    visualNode?.type === "render" && !resolved.post.imageUrl ? (
      <InstagramRenderPreviewSlot nodeId={visualNode.id} />
    ) : visualNode?.type === "crop" && !resolved.post.imageUrl ? (
      <InstagramCropPreviewSlot nodeId={visualNode.id} />
    ) : undefined;
  const imageAspectRatio = visualNode?.type === "crop" ? "portrait-4-5" : "square";
  const syntheticPreviewFields = normalizeList(nodeData.syntheticPreviewFields);
  const assumptions = normalizeList(nodeData.assumptions);
  const hasDetails =
    resolved.fields.altText ||
    resolved.fields.visualPrompt ||
    syntheticPreviewFields.length > 0 ||
    assumptions.length > 0 ||
    resolved.degradedFields.length > 0;

  return (
    <BaseNodeWrapper
      nodeType="instagram-post-mockup"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[360px] border-pink-500/30"
    >
      {HANDLE_SPECS.map((handle) => (
        <CanvasHandle
          key={handle.id}
          nodeId={id}
          nodeType="instagram-post-mockup"
          type="target"
          position={Position.Left}
          id={handle.id}
          className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
          style={{ top: handle.top }}
        />
      ))}

      <div className="flex shrink-0 flex-col gap-3 p-3">
        <header className="space-y-0.5">
          <p className="truncate text-xs font-semibold text-foreground">
            {nodeData.title ?? "Instagram post mockup"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {nodeData.channel ?? "Instagram Feed"}
          </p>
        </header>

        <section data-testid="instagram-post-mockup-preview" className="overflow-hidden rounded-md">
          <InstagramPost
            {...resolved.post}
            imageSlot={imageSlot}
            imageAspectRatio={imageAspectRatio}
          />
        </section>

        <Button
          type="button"
          size="sm"
          className="nodrag nopan w-full bg-pink-600 text-white hover:bg-pink-500"
          data-testid="instagram-post-mockup-send-button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setIsPublishDialogOpen(true);
          }}
        >
          <Send className="size-3.5" />
          Senden
        </Button>

        <InstagramPublishSimulationDialog
          open={isPublishDialogOpen}
          onOpenChange={setIsPublishDialogOpen}
        />

        {hasDetails ? (
          <details
            data-testid="instagram-post-mockup-details"
            className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5"
          >
            <summary className="cursor-pointer text-[11px] font-semibold text-foreground/80">
              Details
            </summary>
            <div className="mt-2 space-y-1 text-[12px] text-foreground/90">
              {resolved.fields.altText ? (
                <p className="break-words">
                  <span className="font-semibold">Alt text</span>: {resolved.fields.altText}
                </p>
              ) : null}
              {resolved.fields.visualPrompt ? (
                <p className="break-words">
                  <span className="font-semibold">Visual prompt</span>:{" "}
                  {resolved.fields.visualPrompt}
                </p>
              ) : null}
              {syntheticPreviewFields.length > 0 ? (
                <p className="break-words">
                  <span className="font-semibold">Synthetic preview fields</span>:{" "}
                  {syntheticPreviewFields.join(", ")}
                </p>
              ) : null}
              {assumptions.length > 0 ? (
                <p className="break-words">
                  <span className="font-semibold">Assumptions</span>: {assumptions.join(", ")}
                </p>
              ) : null}
              {resolved.degradedFields.length > 0 ? (
                <p className="break-words text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Missing live inputs</span>:{" "}
                  {resolved.degradedFields.join(", ")}
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </BaseNodeWrapper>
  );
}
