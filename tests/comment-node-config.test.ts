import { describe, expect, it } from "vitest";

import { nodeTypes } from "@/components/canvas/node-types";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import {
  NODE_CATALOG,
  catalogEntriesByCategory,
  isNodePaletteEnabled,
} from "@/lib/canvas-node-catalog";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

describe("comment node config", () => {
  it("registers comment as a palette-enabled layout node", () => {
    const catalogEntry = NODE_CATALOG.find((entry) => entry.type === "comment");
    const template = CANVAS_NODE_TEMPLATES.find((entry) => entry.type === "comment");

    expect(nodeTypes.comment).toBeTypeOf("function");
    expect(catalogEntry).toMatchObject({
      type: "comment",
      label: "Kommentar",
      category: "layout",
      phase: 3,
      implemented: true,
    });
    expect(catalogEntry?.disabledHint).toBeUndefined();
    expect(catalogEntry && isNodePaletteEnabled(catalogEntry)).toBe(true);
    expect(template).toMatchObject({
      type: "comment",
      label: "Kommentar",
      defaultData: expect.objectContaining({
        resolved: false,
        content: expect.objectContaining({ version: 1 }),
        replies: [],
      }),
    });
  });

  it("keeps comment as a non-connectable review annotation", () => {
    expect(NODE_DEFAULTS.comment).toMatchObject({
      width: 300,
      height: 220,
      data: expect.objectContaining({
        resolved: false,
        replies: [],
      }),
    });
    expect(NODE_HANDLE_MAP.comment).toEqual({});

    const byCategory = catalogEntriesByCategory();
    expect(byCategory.get("layout")?.map((entry) => entry.type)).toContain("comment");
  });
});
