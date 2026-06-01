// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  applyMixerFabricNoDragClasses,
  buildMixerFabricLayerBuildKey,
  buildMixerFabricLayerObjectOptions,
  fitMixerFabricEditorDimensions,
  shouldSkipMixerFabricLayoutSync,
} from "@/components/canvas/nodes/mixer-fabric-editor";

describe("fitMixerFabricEditorDimensions", () => {
  it("fits a large source stage into the visible editor viewport", () => {
    expect(
      fitMixerFabricEditorDimensions({
        containerWidth: 400,
        containerHeight: 200,
        stageWidth: 2048,
        stageHeight: 1536,
      }),
    ).toEqual({ width: 267, height: 200 });
  });

  it("uses the visible editor viewport while preserving the stage aspect ratio", () => {
    expect(
      fitMixerFabricEditorDimensions({
        containerWidth: 800,
        containerHeight: 600,
        stageWidth: 1920,
        stageHeight: 1080,
      }),
    ).toEqual({ width: 800, height: 450 });
  });

  it("anchors Fabric layer objects by their top-left corner", () => {
    expect(
      buildMixerFabricLayerObjectOptions({
        layer: {
          id: "layer-1",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          opacity: 100,
          locked: false,
        },
        editorSize: { width: 320, height: 240 },
      }),
    ).toMatchObject({
      frameWidth: 320,
      frameHeight: 240,
      shared: {
        left: 0,
        top: 0,
        originX: "left",
        originY: "top",
      },
    });
  });

  it("keeps the Fabric object build key stable for transform-only layer changes", () => {
    const baseLayer = {
      id: "layer-1",
      handleId: "layer-in",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
      opacity: 100,
      blendMode: "normal" as const,
      visible: true,
      locked: false,
      source: { kind: "image" as const, url: "https://cdn.example.com/base.png" },
    };

    expect(
      buildMixerFabricLayerBuildKey([
        {
          ...baseLayer,
          x: 0.25,
          y: 0.1,
          width: 0.5,
          height: 0.75,
          rotation: 18,
        },
      ]),
    ).toBe(buildMixerFabricLayerBuildKey([baseLayer]));

    expect(
      buildMixerFabricLayerBuildKey([
        {
          ...baseLayer,
          source: { kind: "image" as const, url: "https://cdn.example.com/changed.png" },
        },
      ]),
    ).not.toBe(buildMixerFabricLayerBuildKey([baseLayer]));
  });

  it("marks all Fabric-managed canvas elements as non-draggable canvas UI", () => {
    const lowerCanvasEl = document.createElement("canvas");
    const upperCanvasEl = document.createElement("canvas");
    const wrapperEl = document.createElement("div");

    applyMixerFabricNoDragClasses({
      lowerCanvasEl,
      upperCanvasEl,
      wrapperEl,
    });

    for (const element of [lowerCanvasEl, upperCanvasEl, wrapperEl]) {
      expect(element.classList.contains("nodrag")).toBe(true);
      expect(element.classList.contains("nopan")).toBe(true);
    }
  });

  it("skips stale external layout while a Fabric transform is pending", () => {
    expect(
      shouldSkipMixerFabricLayoutSync({
        isTransforming: false,
        layer: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        pendingTransform: { x: 0.2, y: 0.15, width: 0.45, height: 0.55, rotation: 12 },
      }),
    ).toBe(true);

    expect(
      shouldSkipMixerFabricLayoutSync({
        isTransforming: true,
        layer: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        pendingTransform: null,
      }),
    ).toBe(true);

    expect(
      shouldSkipMixerFabricLayoutSync({
        isTransforming: false,
        layer: { x: 0.2, y: 0.15, width: 0.45, height: 0.55, rotation: 12 },
        pendingTransform: { x: 0.2, y: 0.15, width: 0.45, height: 0.55, rotation: 12 },
      }),
    ).toBe(false);
  });
});
