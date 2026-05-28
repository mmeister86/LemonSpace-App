import { describe, expect, it } from "vitest";

import { nodeTypes } from "@/components/canvas/node-types";
import {
  NODE_CATALOG,
  isNodePaletteEnabled,
} from "@/lib/canvas-node-catalog";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { CANVAS_NODE_TYPES } from "@/lib/canvas-node-types";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

describe("mask node compatibility", () => {
  it("registers persisted mask nodes across schema, catalog, React Flow, defaults, and handles", () => {
    expect(CANVAS_NODE_TYPES).toContain("mask");
    expect(nodeTypes.mask).toBeTypeOf("function");

    const catalogEntry = NODE_CATALOG.find((entry) => entry.type === "mask");
    expect(catalogEntry).toMatchObject({
      type: "mask",
      label: "Maske",
      category: "image-edit",
      phase: 2,
    });
    expect(catalogEntry && isNodePaletteEnabled(catalogEntry)).toBe(true);

    expect(CANVAS_NODE_TEMPLATES.find((template) => template.type === "mask")).toMatchObject({
      label: "Maske",
      width: 340,
      height: 360,
    });
    expect(NODE_DEFAULTS.mask).toMatchObject({ width: 340, height: 360 });
    expect(NODE_HANDLE_MAP.mask).toEqual({ source: "mask-out", target: "image-in" });
  });
});
