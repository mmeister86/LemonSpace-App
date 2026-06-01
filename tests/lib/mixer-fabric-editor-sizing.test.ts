import { describe, expect, it } from "vitest";

import {
  buildMixerFabricLayerObjectOptions,
  fitMixerFabricEditorDimensions,
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
});
