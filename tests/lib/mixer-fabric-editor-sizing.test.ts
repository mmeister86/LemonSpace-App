import { describe, expect, it } from "vitest";

import { fitMixerFabricEditorDimensions } from "@/components/canvas/nodes/mixer-fabric-editor";

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

  it("caps editor height while preserving the stage aspect ratio", () => {
    expect(
      fitMixerFabricEditorDimensions({
        containerWidth: 800,
        containerHeight: 600,
        stageWidth: 1920,
        stageHeight: 1080,
      }),
    ).toEqual({ width: 462, height: 260 });
  });
});
