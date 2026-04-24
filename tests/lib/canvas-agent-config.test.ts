import { describe, expect, it } from "vitest";

import { nodeTypes } from "@/components/canvas/node-types";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import {
  NODE_CATALOG,
  NODE_CATEGORY_META,
  catalogEntriesByCategory,
  isNodePaletteEnabled,
} from "@/lib/canvas-node-catalog";
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

  it("moves agent nodes into an Agents category", () => {
    expect(NODE_CATEGORY_META.agents.label).toBe("Agents");

    const byCategory = catalogEntriesByCategory();
    const agentsEntries = byCategory.get("agents") ?? [];
    const aiOutputEntries = byCategory.get("ai-output") ?? [];

    expect(agentsEntries.map((entry) => entry.type)).toEqual(["agent", "agent-output"]);
    expect(agentsEntries[0]).toMatchObject({
      label: "Campaign Orchestrator",
      category: "agents",
    });

    expect(aiOutputEntries.map((entry) => entry.type)).toEqual([
      "prompt",
      "video-prompt",
      "ai-text",
      "ai-text-output",
    ]);
    expect(NODE_CATALOG.find((entry) => entry.type === "ai-video")?.category).toBe("source");
  });

  it("keeps the agent input-only in MVP", () => {
    expect(NODE_HANDLE_MAP.agent?.target).toBe("agent-in");
    expect(NODE_HANDLE_MAP.agent?.source).toBeUndefined();
    expect(NODE_DEFAULTS.agent?.data).toMatchObject({
      templateId: "campaign-distributor",
    });
  });

  it("registers uploaded video and asset-video node variants", () => {
    expect(nodeTypes.video).toBeTypeOf("function");
    expect(nodeTypes["asset-video"]).toBeTypeOf("function");
    expect(CANVAS_NODE_TEMPLATES.find((template) => template.type === "video")?.label).toBe(
      "Video",
    );
    expect(
      CANVAS_NODE_TEMPLATES.find((template) => template.type === "asset-video")?.label,
    ).toBe("Asset (Video)");
    expect(NODE_CATALOG.find((entry) => entry.type === "video")?.label).toBe("Video");
    expect(NODE_CATALOG.find((entry) => entry.type === "asset-video")?.label).toBe(
      "Asset (Video)",
    );
    expect(NODE_HANDLE_MAP.video).toEqual({ source: undefined, target: undefined });
    expect(NODE_HANDLE_MAP["asset-video"]).toEqual({
      source: undefined,
      target: undefined,
    });
    expect(NODE_DEFAULTS.video).toMatchObject({ width: 320, height: 180 });
    expect(NODE_DEFAULTS["asset-video"]).toMatchObject({ width: 320, height: 180 });
  });
});
