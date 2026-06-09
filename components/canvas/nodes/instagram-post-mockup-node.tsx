"use client";

/**
 * Onboarding note:
 * Renders the derived Instagram post mockup node. Keep rendering derived from graph bindings so user-edited field nodes remain the source of truth.
 */

import { Position, type Node, type NodeProps } from "@xyflow/react";

import { InstagramPost } from "@/components/agents/instagram/ui/instagram-post";
import CanvasHandle from "@/components/canvas/canvas-handle";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
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

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function InstagramPostMockupNode({
  id,
  data,
  selected,
}: NodeProps<InstagramPostMockupNodeType>) {
  const graph = useCanvasGraph();
  const nodeData = data as InstagramPostMockupNodeData;
  const resolved = resolveInstagramPostMockup({
    nodeId: id,
    graph,
    data: nodeData,
  });
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
          <InstagramPost {...resolved.post} />
        </section>

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
