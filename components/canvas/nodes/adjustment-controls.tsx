"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas adjustment controls node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { Slider } from "@/components/ui/slider";

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => {
          onChange(values[0] ?? value);
        }}
        className="nodrag nowheel"
      />
    </div>
  );
}
