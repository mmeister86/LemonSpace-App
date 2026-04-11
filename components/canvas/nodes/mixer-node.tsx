"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";
import { useNodeLocalData } from "./use-node-local-data";
import { useCanvasGraph } from "@/components/canvas/canvas-graph-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  normalizeMixerPreviewData,
  resolveMixerPreviewFromGraph,
  type MixerBlendMode,
} from "@/lib/canvas-mixer-preview";
import type { Id } from "@/convex/_generated/dataModel";

const BLEND_MODE_OPTIONS: MixerBlendMode[] = ["normal", "multiply", "screen", "overlay"];
const MIN_OVERLAY_SIZE = 0.1;
const MAX_OVERLAY_POSITION = 1;
const SAVE_DELAY_MS = 160;

type MixerLocalData = ReturnType<typeof normalizeMixerPreviewData>;
type ResizeCorner = "nw" | "ne" | "sw" | "se";

type InteractionState =
  | {
      kind: "move";
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    }
  | {
      kind: "resize";
      corner: ResizeCorner;
      startClientX: number;
      startClientY: number;
      startData: MixerLocalData;
      previewWidth: number;
      previewHeight: number;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeLocalMixerData(data: MixerLocalData): MixerLocalData {
  const overlayX = clamp(data.overlayX, 0, MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE);
  const overlayY = clamp(data.overlayY, 0, MAX_OVERLAY_POSITION - MIN_OVERLAY_SIZE);
  const overlayWidth = clamp(data.overlayWidth, MIN_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayX);
  const overlayHeight = clamp(data.overlayHeight, MIN_OVERLAY_SIZE, MAX_OVERLAY_POSITION - overlayY);

  return {
    ...data,
    overlayX,
    overlayY,
    overlayWidth,
    overlayHeight,
  };
}

function computeResizeRect(args: {
  startData: MixerLocalData;
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
}): Pick<MixerLocalData, "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight"> {
  const { startData, corner, deltaX, deltaY } = args;
  const startRight = startData.overlayX + startData.overlayWidth;
  const startBottom = startData.overlayY + startData.overlayHeight;

  let overlayX = startData.overlayX;
  let overlayY = startData.overlayY;
  let overlayWidth = startData.overlayWidth;
  let overlayHeight = startData.overlayHeight;

  if (corner.includes("w")) {
    overlayX = clamp(
      startData.overlayX + deltaX,
      0,
      startData.overlayX + startData.overlayWidth - MIN_OVERLAY_SIZE,
    );
    overlayWidth = startRight - overlayX;
  }

  if (corner.includes("e")) {
    overlayWidth = clamp(
      startData.overlayWidth + deltaX,
      MIN_OVERLAY_SIZE,
      MAX_OVERLAY_POSITION - startData.overlayX,
    );
  }

  if (corner.includes("n")) {
    overlayY = clamp(
      startData.overlayY + deltaY,
      0,
      startData.overlayY + startData.overlayHeight - MIN_OVERLAY_SIZE,
    );
    overlayHeight = startBottom - overlayY;
  }

  if (corner.includes("s")) {
    overlayHeight = clamp(
      startData.overlayHeight + deltaY,
      MIN_OVERLAY_SIZE,
      MAX_OVERLAY_POSITION - startData.overlayY,
    );
  }

  return normalizeLocalMixerData({
    ...startData,
    overlayX,
    overlayY,
    overlayWidth,
    overlayHeight,
  });
}

export default function MixerNode({ id, data, selected }: NodeProps) {
  const graph = useCanvasGraph();
  const { queueNodeDataUpdate } = useCanvasSync();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const latestNodeDataRef = useRef((data ?? {}) as Record<string, unknown>);
  const [hasImageLoadError, setHasImageLoadError] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);

  useEffect(() => {
    latestNodeDataRef.current = (data ?? {}) as Record<string, unknown>;
  }, [data]);

  const { localData, updateLocalData } = useNodeLocalData<MixerLocalData>({
    nodeId: id,
    data,
    normalize: normalizeMixerPreviewData,
    saveDelayMs: SAVE_DELAY_MS,
    onSave: (next) =>
      queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...latestNodeDataRef.current,
          ...next,
        },
      }),
    debugLabel: "mixer",
  });

  const previewState = useMemo(
    () => resolveMixerPreviewFromGraph({ nodeId: id, graph }),
    [graph, id],
  );

  const onBlendModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setHasImageLoadError(false);
    updateLocalData((current) => ({
      ...current,
      blendMode: event.target.value as MixerBlendMode,
    }));
  };

  const onNumberChange = (
    field: "opacity" | "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight",
  ) =>
    (event: FormEvent<HTMLInputElement>) => {
    setHasImageLoadError(false);
    const nextValue = Number(event.currentTarget.value);

    updateLocalData((current) => {
      if (!Number.isFinite(nextValue)) {
        return current;
      }

      if (field === "opacity") {
        return {
          ...current,
          opacity: clamp(nextValue, 0, 100),
        };
      }

      return normalizeLocalMixerData({
        ...current,
        [field]: nextValue,
      });
    });
    };

  const startInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    kind: InteractionState["kind"],
    corner?: ResizeCorner,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) {
      return;
    }

    setInteraction({
      kind,
      corner: kind === "resize" ? (corner as ResizeCorner) : undefined,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startData: localData,
      previewWidth: previewRect.width,
      previewHeight: previewRect.height,
    } as InteractionState);
  };

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = (event.clientX - interaction.startClientX) / interaction.previewWidth;
      const deltaY = (event.clientY - interaction.startClientY) / interaction.previewHeight;

      if (interaction.kind === "move") {
        const nextX = clamp(
          interaction.startData.overlayX + deltaX,
          0,
          MAX_OVERLAY_POSITION - interaction.startData.overlayWidth,
        );
        const nextY = clamp(
          interaction.startData.overlayY + deltaY,
          0,
          MAX_OVERLAY_POSITION - interaction.startData.overlayHeight,
        );

        updateLocalData((current) => ({
          ...current,
          overlayX: nextX,
          overlayY: nextY,
        }));
        return;
      }

      const nextRect = computeResizeRect({
        startData: interaction.startData,
        corner: interaction.corner,
        deltaX,
        deltaY,
      });

      updateLocalData((current) => ({
        ...current,
        ...nextRect,
      }));
    };

    const handleMouseUp = () => {
      setInteraction(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [interaction, updateLocalData]);

  const showReadyPreview = previewState.status === "ready" && !hasImageLoadError;
  const showPreviewError = hasImageLoadError || previewState.status === "error";

  const overlayStyle = {
    mixBlendMode: localData.blendMode,
    opacity: localData.opacity / 100,
    left: `${localData.overlayX * 100}%`,
    top: `${localData.overlayY * 100}%`,
    width: `${localData.overlayWidth * 100}%`,
    height: `${localData.overlayHeight * 100}%`,
  } as const;

  return (
    <BaseNodeWrapper nodeType="mixer" selected={selected} className="p-0">
      <Handle
        type="target"
        position={Position.Left}
        id="base"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-sky-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="overlay"
        style={{ top: "58%" }}
        className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="mixer-out"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Mixer
        </div>

        <div ref={previewRef} data-testid="mixer-preview" className="relative min-h-[140px] overflow-hidden bg-muted/40 nodrag">
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
                data-testid="mixer-overlay"
                className="absolute object-cover nodrag cursor-move"
                draggable={false}
                onMouseDown={(event) => startInteraction(event, "move")}
                onError={() => setHasImageLoadError(true)}
                style={overlayStyle}
              />

              {([
                { corner: "nw", cursor: "nwse-resize" },
                { corner: "ne", cursor: "nesw-resize" },
                { corner: "sw", cursor: "nesw-resize" },
                { corner: "se", cursor: "nwse-resize" },
              ] as const).map(({ corner, cursor }) => (
                <div
                  key={corner}
                  role="button"
                  tabIndex={-1}
                  data-testid={`mixer-resize-${corner}`}
                  className="absolute z-10 h-3 w-3 rounded-full border border-white/80 bg-foreground/80 nodrag"
                  onMouseDown={(event) => startInteraction(event, "resize", corner)}
                  style={{
                    left: `${(corner.includes("w") ? localData.overlayX : localData.overlayX + localData.overlayWidth) * 100}%`,
                    top: `${(corner.includes("n") ? localData.overlayY : localData.overlayY + localData.overlayHeight) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    cursor,
                  }}
                />
              ))}
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
              value={localData.blendMode}
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
              value={localData.opacity}
              onInput={onNumberChange("opacity")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay X</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayX"
              min={0}
              max={0.9}
              step={0.01}
              value={localData.overlayX}
              onInput={onNumberChange("overlayX")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay Y</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayY"
              min={0}
              max={0.9}
              step={0.01}
              value={localData.overlayY}
              onInput={onNumberChange("overlayY")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay W</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayWidth"
              min={MIN_OVERLAY_SIZE}
              max={1}
              step={0.01}
              value={localData.overlayWidth}
              onInput={onNumberChange("overlayWidth")}
            />
          </label>

          <label className="flex flex-col gap-1 text-muted-foreground">
            <span>Overlay H</span>
            <input
              className="nodrag nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              type="number"
              name="overlayHeight"
              min={MIN_OVERLAY_SIZE}
              max={1}
              step={0.01}
              value={localData.overlayHeight}
              onInput={onNumberChange("overlayHeight")}
            />
          </label>
        </div>
      </div>
    </BaseNodeWrapper>
  );
}
