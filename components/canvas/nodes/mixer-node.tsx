"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Position, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  normalizeMixerPreviewData,
  resolveMixerPreviewFromGraph,
  type MixerBlendMode,
} from "@/lib/canvas-mixer-preview";
import type { Id } from "@/convex/_generated/dataModel";
import CanvasHandle from "@/components/canvas/canvas-handle";

const BLEND_MODE_OPTIONS: MixerBlendMode[] = ["normal", "multiply", "screen", "overlay"];

export default function MixerNode({ id, data, selected }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const [hasImageLoadError, setHasImageLoadError] = useState(false);

  const normalizedData = useMemo(() => normalizeMixerPreviewData(data), [data]);
  const previewState = useMemo(
    () => resolveMixerPreviewFromGraph({ nodeId: id, graph }),
    [graph, id],
  );

  const currentData = (data ?? {}) as Record<string, unknown>;

  const updateData = (patch: Partial<ReturnType<typeof normalizeMixerPreviewData>>) => {
    void queueNodeDataUpdate({
      nodeId: id as Id<"nodes">,
      data: {
        ...currentData,
        ...patch,
      },
    });
  };

  const onBlendModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setHasImageLoadError(false);
    updateData({ blendMode: event.target.value as MixerBlendMode });
  };

  const onNumberChange = (field: "opacity" | "offsetX" | "offsetY") => (
    event: FormEvent<HTMLInputElement>,
  ) => {
    setHasImageLoadError(false);
    const nextValue = Number(event.currentTarget.value);
    updateData({ [field]: Number.isFinite(nextValue) ? nextValue : 0 });
  };

  const showReadyPreview = previewState.status === "ready" && !hasImageLoadError;
  const showPreviewError = hasImageLoadError || previewState.status === "error";

  return (
    <BaseNodeWrapper nodeType="mixer" selected={selected} className="p-0">
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="target"
        position={Position.Left}
        id="base"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="target"
        position={Position.Left}
        id="overlay"
        style={{ top: "58%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
      />
      <CanvasHandle
        nodeId={id}
        nodeType="mixer"
        type="source"
        position={Position.Right}
        id="mixer-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Mixer
        </div>

        <div className="relative min-h-[140px] overflow-hidden bg-muted/40">
          {showReadyPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewState.baseUrl}
                alt="Mixer base"
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                onError={() => setHasImageLoadError(true)}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewState.overlayUrl}
                alt="Mixer overlay"
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                onError={() => setHasImageLoadError(true)}
                style={{
                  mixBlendMode: previewState.blendMode,
                  opacity: previewState.opacity / 100,
                  transform: `translate(${previewState.offsetX}px, ${previewState.offsetY}px)`,
                }}
              />
            </>
          ) : null}

          {previewState.status === "empty" && !showPreviewError ? (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">
              Connect base and overlay images
            </div>
          ) : null}

          {previewState.status === "partial" && !showPreviewError ? (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-muted-foreground">
              Waiting for second input
            </div>
          ) : null}

          {showPreviewError ? (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs text-red-600">
              Preview unavailable
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-2 text-[11px]">
          <label className="col-span-2 flex flex-col gap-1 text-muted-foreground">
            <span>Blend mode</span>
            <select
              name="blendMode"
              value={normalizedData.blendMode}
              onChange={onBlendModeChange}
              className="nodrag h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {BLEND_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Opacity</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="opacity"
              min={0}
              max={100}
              step={1}
              value={normalizedData.opacity}
              onInput={onNumberChange("opacity")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Offset X</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="offsetX"
              step={1}
              value={normalizedData.offsetX}
              onInput={onNumberChange("offsetX")}
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1 text-muted-foreground">
            <span>Offset Y</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="offsetY"
              step={1}
              value={normalizedData.offsetY}
              onInput={onNumberChange("offsetY")}
            />
          </label>
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
