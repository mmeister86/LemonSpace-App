import { describe, expect, it } from "vitest";

import { getImageTransformOutputNodeType } from "@/components/canvas/nodes/use-image-transform-runner";

describe("image transform runner helpers", () => {
  it("creates a dedicated output node for bg-remove and image nodes for other transforms", () => {
    expect(getImageTransformOutputNodeType("bg-remove")).toBe("bg-remove-output");
    expect(getImageTransformOutputNodeType("upscale")).toBe("image");
    expect(getImageTransformOutputNodeType("style-transfer")).toBe("image");
    expect(getImageTransformOutputNodeType("face-restore")).toBe("image");
    expect(getImageTransformOutputNodeType("change-camera")).toBe("image");
  });
});
