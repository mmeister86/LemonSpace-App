"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import {
  Panel,
  useReactFlow,
  useStore,
  useViewport,
  type PanelProps,
} from "@xyflow/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const ZOOM_CONTROL_DURATION_MS = 220;

export function CanvasZoomSliderControls({
  className,
  ...props
}: Omit<PanelProps, "children">) {
  const { zoom } = useViewport();
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  return (
    <Panel
      position="bottom-left"
      data-testid="canvas-zoom-controls"
      data-frame-export-ignore="true"
      className={cn(
        "nodrag nopan group/zoom flex items-center gap-1 rounded-lg border border-border/80 bg-card/90 p-1 text-foreground opacity-55 shadow-sm backdrop-blur-sm transition-opacity duration-200 ease-out hover:opacity-100 focus-within:opacity-100",
        className,
      )}
      {...props}
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label="Verkleinern"
        title="Verkleinern"
        onClick={() => zoomOut({ duration: ZOOM_CONTROL_DURATION_MS })}
      >
        <Minus className="size-3.5" />
      </Button>
      <div
        data-testid="canvas-zoom-slider-reveal"
        className="grid w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-200 ease-out group-hover/zoom:w-36 group-hover/zoom:opacity-100 group-focus-within/zoom:w-36 group-focus-within/zoom:opacity-100"
      >
        <Slider
          aria-label="Zoom"
          className="w-36 px-2"
          value={[zoom]}
          min={minZoom}
          max={maxZoom}
          step={0.01}
          onValueChange={(values) => zoomTo(values[0])}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label="Vergrößern"
        title="Vergrößern"
        onClick={() => zoomIn({ duration: ZOOM_CONTROL_DURATION_MS })}
      >
        <Plus className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-7 min-w-12 px-2 text-xs tabular-nums"
        aria-label="Zoom auf 100%"
        title="Zoom auf 100%"
        onClick={() => zoomTo(1, { duration: ZOOM_CONTROL_DURATION_MS })}
      >
        {(zoom * 100).toFixed(0)}%
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label="Ansicht einpassen"
        title="Ansicht einpassen"
        onClick={() => fitView({ duration: ZOOM_CONTROL_DURATION_MS })}
      >
        <Maximize className="size-3.5" />
      </Button>
    </Panel>
  );
}
