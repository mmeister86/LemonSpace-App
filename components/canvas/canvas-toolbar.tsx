"use client";

import { useRef } from "react";

import { CreditDisplay } from "@/components/canvas/credit-display";
import { ExportButton } from "@/components/canvas/export-button";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import {
  CANVAS_NODE_TEMPLATES,
  type CanvasNodeTemplate,
} from "@/lib/canvas-node-templates";

interface CanvasToolbarProps {
  canvasName?: string;
}

export default function CanvasToolbar({
  canvasName,
}: CanvasToolbarProps) {
  const { createNodeWithIntersection } = useCanvasPlacement();
  const nodeCountRef = useRef(0);

  const handleAddNode = async (
    type: CanvasNodeTemplate["type"],
    data: CanvasNodeTemplate["defaultData"],
    width: number,
    height: number,
  ) => {
    const offset = (nodeCountRef.current % 8) * 24;
    nodeCountRef.current += 1;
    await createNodeWithIntersection({
      type,
      position: { x: 100 + offset, y: 100 + offset },
      width,
      height,
      data,
    });
  };

  return (
    <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
      {CANVAS_NODE_TEMPLATES.map((template) => (
        <button
          key={template.type}
          onClick={() =>
            void handleAddNode(
              template.type,
              template.defaultData,
              template.width,
              template.height,
            )
          }
          className="rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          title={`${template.label} hinzufuegen`}
          type="button"
        >
          {template.label}
        </button>
      ))}
      <div className="ml-1 h-6 w-px bg-border" />
      <CreditDisplay />
      <ExportButton canvasName={canvasName ?? "canvas"} />
    </div>
  );
}
