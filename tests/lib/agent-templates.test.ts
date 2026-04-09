import { describe, expect, it } from "vitest";

import { AGENT_TEMPLATES, getAgentTemplate } from "@/lib/agent-templates";

describe("agent templates", () => {
  it("registers the campaign distributor template", () => {
    expect(AGENT_TEMPLATES.map((template) => template.id)).toEqual([
      "campaign-distributor",
    ]);
  });

  it("exposes normalized metadata needed by the canvas node", () => {
    const template = getAgentTemplate("campaign-distributor");

    expect(template?.name).toBe("Campaign Distributor");
    expect(template?.color).toBe("yellow");
    expect(template?.tools).toContain("WebFetch");
    expect(template?.channels).toContain("Instagram Feed");
    expect(template?.expectedInputs).toContain("Render-Node-Export");
    expect(template?.expectedOutputs).toContain("Caption-Pakete");
  });
});
