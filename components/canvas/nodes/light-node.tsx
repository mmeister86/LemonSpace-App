"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import AdjustmentPreview from "./adjustment-preview";

type LightNodeData = {
  brightness?: number;
  contrast?: number;
  exposure?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  vignette?: number;
  preset?: string | null;
  _status?: string;
  _statusMessage?: string;
};

export type LightNode = Node<LightNodeData, "light-adjust">;

function toPersistedData(data: Record<string, unknown>): Record<string, unknown> {
  const { _status, _statusMessage, retryCount, url, ...rest } = data;
  void _status;
  void _statusMessage;
  void retryCount;
  void url;
  return rest;
}

export default function LightNode({ id, data, selected }: NodeProps<LightNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const dataRef = useRef(data as Record<string, unknown>);
  dataRef.current = data as Record<string, unknown>;

  const [brightness, setBrightness] = useState(data.brightness ?? 0);
  const [contrast, setContrast] = useState(data.contrast ?? 0);
  const [exposure, setExposure] = useState(data.exposure ?? 0);
  const [highlights, setHighlights] = useState(data.highlights ?? 0);
  const [shadows, setShadows] = useState(data.shadows ?? 0);
  const [whites, setWhites] = useState(data.whites ?? 0);
  const [blacks, setBlacks] = useState(data.blacks ?? 0);
  const [vignette, setVignette] = useState(data.vignette ?? 0);

  useEffect(() => {
    setBrightness(data.brightness ?? 0);
    setContrast(data.contrast ?? 0);
    setExposure(data.exposure ?? 0);
    setHighlights(data.highlights ?? 0);
    setShadows(data.shadows ?? 0);
    setWhites(data.whites ?? 0);
    setBlacks(data.blacks ?? 0);
    setVignette(data.vignette ?? 0);
  }, [
    data.blacks,
    data.brightness,
    data.contrast,
    data.exposure,
    data.highlights,
    data.shadows,
    data.vignette,
    data.whites,
  ]);

  const persist = useDebouncedCallback(
    (next: {
      brightness: number;
      contrast: number;
      exposure: number;
      highlights: number;
      shadows: number;
      whites: number;
      blacks: number;
      vignette: number;
    }) => {
      const base = toPersistedData(dataRef.current);
      void updateData({
        nodeId: id as Id<"nodes">,
        data: {
          ...base,
          ...next,
          preset: null,
        },
      });
    },
    250,
  );

  const persistCurrent = useCallback(
    (
      overrides?: Partial<{
        brightness: number;
        contrast: number;
        exposure: number;
        highlights: number;
        shadows: number;
        whites: number;
        blacks: number;
        vignette: number;
      }>,
    ) => {
      persist({
        brightness: overrides?.brightness ?? brightness,
        contrast: overrides?.contrast ?? contrast,
        exposure: overrides?.exposure ?? exposure,
        highlights: overrides?.highlights ?? highlights,
        shadows: overrides?.shadows ?? shadows,
        whites: overrides?.whites ?? whites,
        blacks: overrides?.blacks ?? blacks,
        vignette: overrides?.vignette ?? vignette,
      });
    },
    [blacks, brightness, contrast, exposure, highlights, persist, shadows, vignette, whites],
  );

  return (
    <BaseNodeWrapper nodeType="light-adjust" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="space-y-2 p-3">
        <div className="text-xs font-medium text-muted-foreground">Licht</div>
        <AdjustmentPreview nodeId={id} />

        {[
          { label: "Brightness", min: -100, max: 100, value: brightness, setter: setBrightness, key: "brightness" as const },
          { label: "Contrast", min: -100, max: 100, value: contrast, setter: setContrast, key: "contrast" as const },
          { label: "Exposure", min: -2, max: 2, step: 0.1, value: exposure, setter: setExposure, key: "exposure" as const },
          { label: "Highlights", min: -100, max: 100, value: highlights, setter: setHighlights, key: "highlights" as const },
          { label: "Shadows", min: -100, max: 100, value: shadows, setter: setShadows, key: "shadows" as const },
          { label: "Whites", min: -100, max: 100, value: whites, setter: setWhites, key: "whites" as const },
          { label: "Blacks", min: -100, max: 100, value: blacks, setter: setBlacks, key: "blacks" as const },
          { label: "Vignette", min: -100, max: 100, value: vignette, setter: setVignette, key: "vignette" as const },
        ].map((item) => (
          <div key={item.key} className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              {item.label} ({item.value})
            </label>
            <input
              className="nodrag nowheel w-full"
              type="range"
              min={item.min}
              max={item.max}
              step={item.step}
              value={item.value}
              onChange={(event) => {
                const next = Number(event.target.value);
                item.setter(next);
                persistCurrent({ [item.key]: next });
              }}
            />
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
