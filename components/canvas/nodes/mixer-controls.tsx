"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas mixer controls node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { ChangeEvent, FormEvent } from "react";

import type { MixerBlendMode } from "@/lib/canvas-mixer-normalization";

import { MIN_OVERLAY_SIZE, type MixerLocalData } from "./mixer-types";

const BLEND_MODE_OPTIONS: MixerBlendMode[] = ["normal", "multiply", "screen", "overlay"];

export function MixerControls({
  localData,
  keepAspectRatio,
  onBlendModeChange,
  onNumberChange,
  onKeepAspectRatioChange,
}: {
  localData: MixerLocalData;
  keepAspectRatio: boolean;
  onBlendModeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onNumberChange: (
    field: "opacity" | "overlayX" | "overlayY" | "overlayWidth" | "overlayHeight",
  ) => (event: FormEvent<HTMLInputElement>) => void;
  onKeepAspectRatioChange: (keepAspectRatio: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-border p-2 text-[11px]">
      <label className="col-span-2 flex flex-col gap-1 text-muted-foreground">
        <span>Blend mode</span>
        <select
          name="blendMode"
          value={localData.blendMode}
          onChange={onBlendModeChange}
          className="nodrag nopan h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {BLEND_MODE_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      <MixerNumberControl label="Opacity" name="opacity" min={0} max={100} step={1} value={localData.opacity} onInput={onNumberChange("opacity")} />
      <MixerNumberControl label="Overlay X" name="overlayX" min={0} max={0.9} step={0.01} value={localData.overlayX} onInput={onNumberChange("overlayX")} />
      <MixerNumberControl label="Overlay Y" name="overlayY" min={0} max={0.9} step={0.01} value={localData.overlayY} onInput={onNumberChange("overlayY")} />
      <MixerNumberControl label="Overlay W" name="overlayWidth" min={MIN_OVERLAY_SIZE} max={1} step={0.01} value={localData.overlayWidth} onInput={onNumberChange("overlayWidth")} />
      <MixerNumberControl label="Overlay H" name="overlayHeight" min={MIN_OVERLAY_SIZE} max={1} step={0.01} value={localData.overlayHeight} onInput={onNumberChange("overlayHeight")} />

      <label className="col-span-2 flex items-center gap-2 text-muted-foreground">
        <input
          type="checkbox"
          data-testid="mixer-keep-aspect"
          checked={keepAspectRatio}
          onChange={(event) => onKeepAspectRatioChange(event.currentTarget.checked)}
          className="nodrag nopan h-3.5 w-3.5 rounded border-input"
        />
        <span>Keep aspect ratio while resizing</span>
      </label>
    </div>
  );
}

function MixerNumberControl({
  label,
  name,
  min,
  max,
  step,
  value,
  onInput,
}: {
  label: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (event: FormEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-muted-foreground">
      <span>{label}</span>
      <input
        className="nodrag nopan nowheel h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        type="number"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={onInput}
      />
    </label>
  );
}
