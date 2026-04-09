import { describe, expect, it } from "vitest";

import { nodeTypes } from "@/components/canvas/node-types";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { NODE_CATALOG, isNodePaletteEnabled } from "@/lib/canvas-node-catalog";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

describe("canvas agent config", () => {
  it("registers the agent node type", () => {
    expect(nodeTypes.agent).toBeTypeOf("function");
  });

  it("adds a campaign distributor palette template", () => {
    expect(CANVAS_NODE_TEMPLATES.find((template) => template.type === "agent")?.label).toBe(
      "Campaign Distributor",
    );
  });

  it("enables the agent in the catalog", () => {
    const entry = NODE_CATALOG.find((item) => item.type === "agent");
    expect(entry).toBeDefined();
    expect(entry && isNodePaletteEnabled(entry)).toBe(true);
  });

  it("keeps the agent input-only in MVP", () => {
    expect(NODE_HANDLE_MAP.agent?.target).toBe("agent-in");
    expect(NODE_HANDLE_MAP.agent?.source).toBeUndefined();
    expect(NODE_DEFAULTS.agent?.data).toMatchObject({
      templateId: "campaign-distributor",
    });
  });
});
