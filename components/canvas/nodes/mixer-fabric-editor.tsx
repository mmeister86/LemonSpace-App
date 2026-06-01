"use client";

/**
 * Fabric-backed editor surface for Mixer V2 layers. The persisted layer model stays
 * framework-light; Fabric is only the interactive object editor.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Canvas as FabricCanvas, FabricObject } from "fabric";

import type { MixerPreviewLayer } from "@/lib/canvas-mixer-preview";

type FabricObjectWithLayer = FabricObject & {
  data?: {
    layerId?: string;
  };
};

function readLayerText(layer: MixerPreviewLayer): string {
  if (layer.source.kind === "text") {
    return layer.source.content.trim() || "Text layer";
  }

  return "";
}

function stageDimensions(stage: { width: number; height: number } | null | undefined) {
  const width = stage?.width && stage.width > 0 ? stage.width : 1024;
  const height = stage?.height && stage.height > 0 ? stage.height : 768;
  return { width, height };
}

export function fitMixerFabricEditorDimensions(args: {
  containerWidth: number;
  containerHeight: number;
  stageWidth: number;
  stageHeight: number;
}) {
  const aspectRatio = args.stageWidth / args.stageHeight || 4 / 3;
  const maxWidth = Math.max(1, args.containerWidth);
  const maxHeight = Math.max(1, Math.min(args.containerHeight, 260));
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function MixerFabricEditor({
  stage,
  layers,
  activeLayerId,
  onSelectLayer,
  onTransformLayer,
}: {
  stage: { width: number; height: number } | null | undefined;
  layers: MixerPreviewLayer[];
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onTransformLayer: (
    layerId: string,
    patch: Pick<MixerPreviewLayer, "x" | "y" | "width" | "height" | "rotation">,
  ) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricHostRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const activeLayerIdRef = useRef(activeLayerId);
  const onSelectLayerRef = useRef(onSelectLayer);
  const onTransformLayerRef = useRef(onTransformLayer);
  const stageSize = useMemo(() => stageDimensions(stage), [stage]);
  const [editorSize, setEditorSize] = useState(() =>
    fitMixerFabricEditorDimensions({
      containerWidth: 320,
      containerHeight: 240,
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
    }),
  );

  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
    onSelectLayerRef.current = onSelectLayer;
    onTransformLayerRef.current = onTransformLayer;
  }, [activeLayerId, onSelectLayer, onTransformLayer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextSize = fitMixerFabricEditorDimensions({
        containerWidth: entry.contentRect.width,
        containerHeight: entry.contentRect.height,
        stageWidth: stageSize.width,
        stageHeight: stageSize.height,
      });
      setEditorSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [stageSize.height, stageSize.width]);

  useEffect(() => {
    let disposed = false;
    const host = fabricHostRef.current;

    async function buildCanvas() {
      if (!host) {
        return;
      }

      const fabric = await import("fabric");
      if (disposed) {
        return;
      }

      fabricCanvasRef.current?.dispose();
      host.replaceChildren();
      const element = document.createElement("canvas");
      element.dataset.testid = "mixer-fabric-editor";
      element.className = "nodrag nopan";
      element.style.width = `${editorSize.width}px`;
      element.style.height = `${editorSize.height}px`;
      host.appendChild(element);

      const canvas = new fabric.Canvas(element, {
        preserveObjectStacking: true,
        selection: false,
        backgroundColor: "#f8f5ef",
      });
      fabricCanvasRef.current = canvas;
      canvas.setDimensions(editorSize);

      const objects = await Promise.all(
        layers.map(async (layer) => {
          const frameWidth = layer.width * editorSize.width;
          const frameHeight = layer.height * editorSize.height;
          const left = layer.x * editorSize.width;
          const top = layer.y * editorSize.height;
          const shared = {
            left,
            top,
            angle: layer.rotation,
            opacity: layer.opacity / 100,
            selectable: !layer.locked,
            evented: !layer.locked,
            lockScalingFlip: true,
            data: { layerId: layer.id },
          };

          if (layer.source.kind === "image") {
            const image = await fabric.FabricImage.fromURL(
              layer.source.url,
              {},
              shared,
            );
            image.set({
              scaleX: frameWidth / Math.max(1, image.width),
              scaleY: frameHeight / Math.max(1, image.height),
            });
            return image;
          }

          return new fabric.Textbox(readLayerText(layer), {
            ...shared,
            width: frameWidth,
            height: frameHeight,
            fontSize: 32,
            fontFamily: "Manrope, system-ui, sans-serif",
            fill: "#111827",
            backgroundColor: "#ffffff",
          });
        }),
      );

      if (disposed || fabricCanvasRef.current !== canvas) {
        return;
      }

      canvas.add(...objects);
      const activeObject = objects.find(
        (object) => (object as FabricObjectWithLayer).data?.layerId === activeLayerIdRef.current,
      );
      if (activeObject) {
        canvas.setActiveObject(activeObject);
      }
      canvas.renderAll();

      const selectObject = (object: FabricObject | undefined) => {
        const fabricObject = object as FabricObjectWithLayer | undefined;
        const layerId = fabricObject?.data?.layerId;
        if (!layerId) {
          return;
        }

        onSelectLayerRef.current(layerId);
      };
      const syncObjectTransform = (object: FabricObject | undefined) => {
        const fabricObject = object as FabricObjectWithLayer | undefined;
        const layerId = fabricObject?.data?.layerId;
        if (!fabricObject || !layerId) {
          return;
        }

        onSelectLayerRef.current(layerId);
        onTransformLayerRef.current(layerId, {
          x: (fabricObject.left ?? 0) / editorSize.width,
          y: (fabricObject.top ?? 0) / editorSize.height,
          width: fabricObject.getScaledWidth() / editorSize.width,
          height: fabricObject.getScaledHeight() / editorSize.height,
          rotation: ((fabricObject.angle ?? 0) % 360 + 360) % 360,
        });
      };

      canvas.on("selection:created", (event) => selectObject(event.selected?.[0]));
      canvas.on("selection:updated", (event) => selectObject(event.selected?.[0]));
      canvas.on("object:modified", (event) => syncObjectTransform(event.target));
    }

    void buildCanvas();

    return () => {
      disposed = true;
      fabricCanvasRef.current?.dispose();
      fabricCanvasRef.current = null;
      host?.replaceChildren();
    };
  }, [editorSize, layers]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }

    const activeObject = canvas
      .getObjects()
      .find((object) => (object as FabricObjectWithLayer).data?.layerId === activeLayerId);
    if (activeObject) {
      canvas.setActiveObject(activeObject);
    } else {
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
  }, [activeLayerId]);

  return (
    <div
      ref={containerRef}
      className="flex min-h-[180px] items-center justify-center overflow-hidden bg-muted/40 p-2"
    >
      <div
        ref={fabricHostRef}
        className="rounded border border-border bg-background"
        style={{
          width: editorSize.width,
          height: editorSize.height,
        }}
      />
    </div>
  );
}
