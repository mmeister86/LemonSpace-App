import { describe, expect, it } from "vitest";

import { ADJUSTMENT_NODE_CONFIGS } from "@/components/canvas/nodes/adjustment-node-shell";

describe("adjustment node shell configs", () => {
  it("defines one shared shell config for each adjustment node type", () => {
    expect(Object.keys(ADJUSTMENT_NODE_CONFIGS).sort()).toEqual([
      "color-adjust",
      "curves",
      "detail-adjust",
      "light-adjust",
    ]);
  });

  it("keeps node-specific labels, accent classes, and preset keys distinct", () => {
    expect(ADJUSTMENT_NODE_CONFIGS.curves).toMatchObject({
      nodeType: "curves",
      titleKey: "adjustments.curves.title",
      wrapperClassName: "min-w-[300px] border-emerald-500/30",
    });
    expect(ADJUSTMENT_NODE_CONFIGS["color-adjust"]).toMatchObject({
      nodeType: "color-adjust",
      titleKey: "adjustments.colorAdjust.title",
      wrapperClassName: "min-w-[300px] border-cyan-500/30",
    });
    expect(ADJUSTMENT_NODE_CONFIGS["light-adjust"]).toMatchObject({
      nodeType: "light-adjust",
      titleKey: "adjustments.lightAdjust.title",
      wrapperClassName: "min-w-[300px] border-amber-500/30",
    });
    expect(ADJUSTMENT_NODE_CONFIGS["detail-adjust"]).toMatchObject({
      nodeType: "detail-adjust",
      titleKey: "adjustments.detailAdjust.title",
      wrapperClassName: "min-w-[300px] border-indigo-500/30",
    });
  });
});
