import { describe, expect, it } from "vitest";

import { nodeTypes } from "@/components/canvas/node-types";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import {
  NODE_CATALOG,
  isNodePaletteEnabled,
} from "@/lib/canvas-node-catalog";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

describe("splitter node config", () => {
  it("keeps splitter as a disabled future control node", () => {
    const catalogEntry = NODE_CATALOG.find((entry) => entry.type === "splitter");

    expect(nodeTypes).not.toHaveProperty("splitter");
    expect(catalogEntry).toMatchObject({
      type: "splitter",
      label: "Splitter",
      category: "control",
      phase: 2,
      implemented: false,
      disabledHint: "Folgt in Phase 2",
    });
    expect(catalogEntry && isNodePaletteEnabled(catalogEntry)).toBe(false);
  });

  it("does not expose splitter placement metadata", () => {
    expect(CANVAS_NODE_TEMPLATES.some((template) => (template.type as string) === "splitter")).toBe(
      false,
    );
    expect(NODE_HANDLE_MAP.splitter).toBeUndefined();
    expect(NODE_DEFAULTS.splitter).toBeUndefined();
  });
});
