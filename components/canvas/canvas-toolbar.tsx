"use client";

import { useMutation } from "convex/react";
import { useRef } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const nodeTemplates = [
  {
    type: "image",
    label: "Bild",
    width: 280,
    height: 180,
    defaultData: {},
  },
  {
    type: "text",
    label: "Text",
    width: 256,
    height: 120,
    defaultData: { content: "" },
  },
  {
    type: "prompt",
    label: "Prompt",
    width: 320,
    height: 140,
    defaultData: { prompt: "", model: "" },
  },
  {
    type: "note",
    label: "Notiz",
    width: 220,
    height: 120,
    defaultData: { content: "" },
  },
  {
    type: "frame",
    label: "Frame",
    width: 360,
    height: 240,
    defaultData: { label: "Untitled", exportWidth: 1080, exportHeight: 1080 },
  },
] as const;

interface CanvasToolbarProps {
  canvasId: Id<"canvases">;
}

export default function CanvasToolbar({ canvasId }: CanvasToolbarProps) {
  const createNode = useMutation(api.nodes.create);
  const nodeCountRef = useRef(0);

  const handleAddNode = async (
    type: (typeof nodeTemplates)[number]["type"],
    data: (typeof nodeTemplates)[number]["defaultData"],
    width: number,
    height: number,
  ) => {
    const offset = (nodeCountRef.current % 8) * 24;
    nodeCountRef.current += 1;
    await createNode({
      canvasId,
      type,
      positionX: 100 + offset,
      positionY: 100 + offset,
      width,
      height,
      data: { ...data, canvasId },
    });
  };

  return (
    <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
      {nodeTemplates.map((template) => (
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
    </div>
  );
}
