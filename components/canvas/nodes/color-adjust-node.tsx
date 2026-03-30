"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import AdjustmentPreview from "./adjustment-preview";

type ColorAdjustNodeData = {
  hue?: number;
  saturation?: number;
  luminance?: number;
  vibrance?: number;
  temperature?: number;
  tint?: number;
  preset?: string | null;
  _status?: string;
  _statusMessage?: string;
};

export type ColorAdjustNode = Node<ColorAdjustNodeData, "color-adjust">;

function toPersistedData(data: Record<string, unknown>): Record<string, unknown> {
  const { _status, _statusMessage, retryCount, url, ...rest } = data;
  void _status;
  void _statusMessage;
  void retryCount;
  void url;
  return rest;
}

export default function ColorAdjustNode({
  id,
  data,
  selected,
}: NodeProps<ColorAdjustNode>) {
  const updateData = useMutation(api.nodes.updateData);
  const dataRef = useRef(data as Record<string, unknown>);
  dataRef.current = data as Record<string, unknown>;

  const [hue, setHue] = useState(data.hue ?? 0);
  const [saturation, setSaturation] = useState(data.saturation ?? 0);
  const [luminance, setLuminance] = useState(data.luminance ?? 0);
  const [vibrance, setVibrance] = useState(data.vibrance ?? 0);
  const [temperature, setTemperature] = useState(data.temperature ?? 0);
  const [tint, setTint] = useState(data.tint ?? 0);

  useEffect(() => {
    setHue(data.hue ?? 0);
    setSaturation(data.saturation ?? 0);
    setLuminance(data.luminance ?? 0);
    setVibrance(data.vibrance ?? 0);
    setTemperature(data.temperature ?? 0);
    setTint(data.tint ?? 0);
  }, [
    data.hue,
    data.luminance,
    data.saturation,
    data.temperature,
    data.tint,
    data.vibrance,
  ]);

  const persist = useDebouncedCallback(
    (next: {
      hue: number;
      saturation: number;
      luminance: number;
      vibrance: number;
      temperature: number;
      tint: number;
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
        hue: number;
        saturation: number;
        luminance: number;
        vibrance: number;
        temperature: number;
        tint: number;
      }>,
    ) => {
      persist({
        hue: overrides?.hue ?? hue,
        saturation: overrides?.saturation ?? saturation,
        luminance: overrides?.luminance ?? luminance,
        vibrance: overrides?.vibrance ?? vibrance,
        temperature: overrides?.temperature ?? temperature,
        tint: overrides?.tint ?? tint,
      });
    },
    [hue, luminance, persist, saturation, temperature, tint, vibrance],
  );

  return (
    <BaseNodeWrapper nodeType="color-adjust" selected={selected} status={data._status}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      <div className="space-y-2 p-3">
        <div className="text-xs font-medium text-muted-foreground">Farbe</div>
        <AdjustmentPreview nodeId={id} />

        {[
          { label: "Hue", min: -180, max: 180, value: hue, setter: setHue, key: "hue" as const },
          { label: "Saturation", min: -100, max: 100, value: saturation, setter: setSaturation, key: "saturation" as const },
          { label: "Luminance", min: -100, max: 100, value: luminance, setter: setLuminance, key: "luminance" as const },
          { label: "Vibrance", min: -100, max: 100, value: vibrance, setter: setVibrance, key: "vibrance" as const },
          { label: "Temperature", min: -100, max: 100, value: temperature, setter: setTemperature, key: "temperature" as const },
          { label: "Tint", min: -100, max: 100, value: tint, setter: setTint, key: "tint" as const },
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
