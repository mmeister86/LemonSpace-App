"use client";

/**
 * Fabric-backed editor surface for Mixer V2 layers. The persisted layer model stays
 * framework-light; Fabric is only the interactive object editor.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Canvas as FabricCanvas, FabricObject } from "fabric";

import type { MixerPreviewLayer } from "@/lib/canvas-mixer-preview";
import { MIXER_STAGE_FALLBACK_SIZE } from "@/lib/canvas-mixer-stage";
import type { CanvasPreviewQuality } from "@/lib/canvas-preview-quality";

type FabricObjectWithLayer = FabricObject & {
  data?: {
    layerId?: string;
  };
};

type MixerFabricCanvasElements = {
  lowerCanvasEl?: Element | null;
  upperCanvasEl?: Element | null;
  wrapperEl?: Element | null;
};

type MixerFabricLayerPlacement = Pick<
  MixerPreviewLayer,
  "id" | "x" | "y" | "width" | "height" | "rotation" | "opacity" | "locked"
>;
type MixerFabricLayerTransformPatch = Pick<
  MixerPreviewLayer,
  "x" | "y" | "width" | "height" | "rotation"
>;
type MixerFabricTransformEvent = {
  target?: FabricObject;
  transform?: {
    target?: FabricObject;
  };
};

const MIXER_FABRIC_DPR_CAP = 1.5;
const MIXER_FABRIC_RETINA_SCALE_CAP = 3;
const MIXER_FABRIC_QUALITY_SCALE: Record<CanvasPreviewQuality, number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

function readDevicePixelRatio(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  return window.devicePixelRatio || 1;
}

export function computeMixerFabricRetinaScale({
  previewQuality,
  devicePixelRatio,
}: {
  previewQuality: CanvasPreviewQuality;
  devicePixelRatio: number;
}): number {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cappedDevicePixelRatio = Math.min(Math.max(safeDevicePixelRatio, 1), MIXER_FABRIC_DPR_CAP);
  const qualityScale = MIXER_FABRIC_QUALITY_SCALE[previewQuality];

  return Math.min(
    MIXER_FABRIC_RETINA_SCALE_CAP,
    Math.max(1, qualityScale * cappedDevicePixelRatio),
  );
}

function readLayerText(layer: MixerPreviewLayer): string {
  if (layer.source.kind === "text") {
    return layer.source.content.trim() || "Text layer";
  }

  return "";
}

function stageDimensions(stage: { width: number; height: number } | null | undefined) {
  const width = stage?.width && stage.width > 0 ? stage.width : MIXER_STAGE_FALLBACK_SIZE.width;
  const height = stage?.height && stage.height > 0 ? stage.height : MIXER_STAGE_FALLBACK_SIZE.height;
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
  const maxHeight = Math.max(1, args.containerHeight);
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

export function buildMixerFabricLayerObjectOptions(args: {
  layer: MixerFabricLayerPlacement;
  editorSize: { width: number; height: number };
}) {
  const frameWidth = args.layer.width * args.editorSize.width;
  const frameHeight = args.layer.height * args.editorSize.height;
  const left = args.layer.x * args.editorSize.width;
  const top = args.layer.y * args.editorSize.height;

  return {
    frameWidth,
    frameHeight,
    shared: {
      left,
      top,
      originX: "left" as const,
      originY: "top" as const,
      angle: args.layer.rotation,
      opacity: args.layer.opacity / 100,
      selectable: !args.layer.locked,
      evented: !args.layer.locked,
      lockScalingFlip: true,
      data: { layerId: args.layer.id },
    },
  };
}

function readMixerFabricLayerSourceKey(layer: MixerPreviewLayer): string {
  if (layer.source.kind === "image") {
    return `image:${layer.source.url}`;
  }

  return [
    "text",
    layer.source.content,
    layer.source.width,
    layer.source.height,
  ].join(":");
}

export function buildMixerFabricLayerBuildKey(layers: readonly MixerPreviewLayer[]): string {
  return JSON.stringify(
    layers.map((layer) => ({
      id: layer.id,
      handleId: layer.handleId,
      source: readMixerFabricLayerSourceKey(layer),
    })),
  );
}

export function applyMixerFabricNoDragClasses(elements: MixerFabricCanvasElements): void {
  for (const element of [
    elements.lowerCanvasEl,
    elements.upperCanvasEl,
    elements.wrapperEl,
  ]) {
    element?.classList.add("nodrag", "nopan");
  }
}

function getMixerFabricCanvasElements(canvas: FabricCanvas): MixerFabricCanvasElements {
  const canvasWithElements = canvas as FabricCanvas & MixerFabricCanvasElements;
  return {
    lowerCanvasEl: canvasWithElements.lowerCanvasEl,
    upperCanvasEl: canvasWithElements.upperCanvasEl,
    wrapperEl: canvasWithElements.wrapperEl,
  };
}

function numbersAlmostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

export function shouldSkipMixerFabricLayoutSync(args: {
  isTransforming: boolean;
  layer: MixerFabricLayerTransformPatch;
  pendingTransform: MixerFabricLayerTransformPatch | null;
}): boolean {
  if (args.isTransforming) {
    return true;
  }

  const pending = args.pendingTransform;
  if (!pending) {
    return false;
  }

  return !(
    numbersAlmostEqual(args.layer.x, pending.x) &&
    numbersAlmostEqual(args.layer.y, pending.y) &&
    numbersAlmostEqual(args.layer.width, pending.width) &&
    numbersAlmostEqual(args.layer.height, pending.height) &&
    numbersAlmostEqual(args.layer.rotation, pending.rotation)
  );
}

function applyMixerFabricObjectLayout(args: {
  object: FabricObject;
  layer: MixerPreviewLayer;
  editorSize: { width: number; height: number };
}) {
  const { frameWidth, frameHeight, shared } = buildMixerFabricLayerObjectOptions({
    layer: args.layer,
    editorSize: args.editorSize,
  });

  args.object.set(shared);
  if (args.layer.source.kind === "image") {
    args.object.set({
      scaleX: frameWidth / Math.max(1, args.object.width),
      scaleY: frameHeight / Math.max(1, args.object.height),
    });
  } else {
    args.object.set({
      width: frameWidth,
      height: frameHeight,
      scaleX: 1,
      scaleY: 1,
    });
  }
  args.object.setCoords();
}

export function MixerFabricEditor({
  stage,
  layers,
  previewQuality,
  activeLayerId,
  onSelectLayer,
  onTransformLayer,
}: {
  stage: { width: number; height: number } | null | undefined;
  layers: MixerPreviewLayer[];
  previewQuality: CanvasPreviewQuality;
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
  const latestLayersRef = useRef(layers);
  const transformingLayerIdsRef = useRef(new Set<string>());
  const pendingTransformByLayerIdRef = useRef(new Map<string, MixerFabricLayerTransformPatch>());
  const stageSize = useMemo(() => stageDimensions(stage), [stage]);
  const layerBuildKey = useMemo(() => buildMixerFabricLayerBuildKey(layers), [layers]);
  const fabricRetinaScale = useMemo(
    () =>
      computeMixerFabricRetinaScale({
        previewQuality,
        devicePixelRatio: readDevicePixelRatio(),
      }),
    [previewQuality],
  );
  const [editorSize, setEditorSize] = useState(() =>
    fitMixerFabricEditorDimensions({
      containerWidth: 320,
      containerHeight: 240,
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
    }),
  );
  latestLayersRef.current = layers;

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
    let installed = false;
    let nextCanvas: FabricCanvas | null = null;
    const host = fabricHostRef.current;

    async function buildCanvas() {
      if (!host) {
        return;
      }

      const fabric = await import("fabric");
      if (disposed) {
        return;
      }

      const element = document.createElement("canvas");
      element.dataset.testid = "mixer-fabric-editor";
      element.className = "nodrag nopan";
      element.style.width = `${editorSize.width}px`;
      element.style.height = `${editorSize.height}px`;

      const canvas = new fabric.Canvas(element, {
        preserveObjectStacking: true,
        selection: false,
        backgroundColor: "#f8f5ef",
      });
      nextCanvas = canvas;
      canvas.getRetinaScaling = () => fabricRetinaScale;
      canvas.setDimensions(editorSize);
      applyMixerFabricNoDragClasses({
        lowerCanvasEl: element,
        ...getMixerFabricCanvasElements(canvas),
      });
      const layersToBuild = latestLayersRef.current;

      const objects = await Promise.all(
        layersToBuild.map(async (layer) => {
          const { frameWidth, frameHeight, shared } = buildMixerFabricLayerObjectOptions({
            layer,
            editorSize,
          });

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
            backgroundColor: "",
          });
        }),
      );

      if (disposed) {
        canvas.dispose();
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

      const previousCanvas = fabricCanvasRef.current;
      fabricCanvasRef.current = canvas;
      installed = true;
      const { wrapperEl } = getMixerFabricCanvasElements(canvas);
      host.replaceChildren(wrapperEl ?? element);
      previousCanvas?.dispose();

      const selectObject = (object: FabricObject | undefined) => {
        const fabricObject = object as FabricObjectWithLayer | undefined;
        const layerId = fabricObject?.data?.layerId;
        if (!layerId) {
          return;
        }

        onSelectLayerRef.current(layerId);
      };
      const readLayerId = (object: FabricObject | undefined) =>
        (object as FabricObjectWithLayer | undefined)?.data?.layerId;
      const markObjectTransforming = (object: FabricObject | undefined) => {
        const layerId = readLayerId(object);
        if (!layerId) {
          return;
        }

        transformingLayerIdsRef.current.add(layerId);
      };
      const syncObjectTransform = (object: FabricObject | undefined) => {
        const fabricObject = object as FabricObjectWithLayer | undefined;
        const layerId = fabricObject?.data?.layerId;
        if (!fabricObject || !layerId) {
          return;
        }

        const patch = {
          x: (fabricObject.left ?? 0) / editorSize.width,
          y: (fabricObject.top ?? 0) / editorSize.height,
          width: fabricObject.getScaledWidth() / editorSize.width,
          height: fabricObject.getScaledHeight() / editorSize.height,
          rotation: ((fabricObject.angle ?? 0) % 360 + 360) % 360,
        };
        transformingLayerIdsRef.current.delete(layerId);
        pendingTransformByLayerIdRef.current.set(layerId, patch);
        onSelectLayerRef.current(layerId);
        onTransformLayerRef.current(layerId, patch);
      };

      canvas.on("selection:created", (event) => selectObject(event.selected?.[0]));
      canvas.on("selection:updated", (event) => selectObject(event.selected?.[0]));
      canvas.on("before:transform", (event) =>
        markObjectTransforming((event as MixerFabricTransformEvent).transform?.target),
      );
      canvas.on("object:moving", (event) =>
        markObjectTransforming((event as MixerFabricTransformEvent).target),
      );
      canvas.on("object:scaling", (event) =>
        markObjectTransforming((event as MixerFabricTransformEvent).target),
      );
      canvas.on("object:rotating", (event) =>
        markObjectTransforming((event as MixerFabricTransformEvent).target),
      );
      canvas.on("object:modified", (event) => syncObjectTransform(event.target));
    }

    void buildCanvas();

    return () => {
      disposed = true;
      if (!installed) {
        nextCanvas?.dispose();
      }
    };
  }, [editorSize, fabricRetinaScale, layerBuildKey]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      return;
    }

    const layerById = new Map(layers.map((layer) => [layer.id, layer]));
    for (const object of canvas.getObjects()) {
      const layerId = (object as FabricObjectWithLayer).data?.layerId;
      const layer = layerId ? layerById.get(layerId) : undefined;
      if (!layer) {
        continue;
      }
      const pendingTransform = pendingTransformByLayerIdRef.current.get(layer.id) ?? null;
      if (
        shouldSkipMixerFabricLayoutSync({
          isTransforming: transformingLayerIdsRef.current.has(layer.id),
          layer,
          pendingTransform,
        })
      ) {
        continue;
      }
      if (pendingTransform) {
        pendingTransformByLayerIdRef.current.delete(layer.id);
      }

      applyMixerFabricObjectLayout({
        object,
        layer,
        editorSize,
      });
    }
    canvas.requestRenderAll();
  }, [editorSize, layers]);

  useEffect(() => {
    const host = fabricHostRef.current;
    return () => {
      fabricCanvasRef.current?.dispose();
      fabricCanvasRef.current = null;
      host?.replaceChildren();
    };
  }, []);

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
