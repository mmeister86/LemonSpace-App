import { describe, expect, it } from "vitest";

import { getAgentDefinition } from "@/lib/agent-definitions";
import { AGENT_TEMPLATES, getAgentTemplate } from "@/lib/agent-templates";

describe("agent templates", () => {
  it("registers only the Instagram agent template", () => {
    expect(AGENT_TEMPLATES.map((template) => template.id)).toEqual([
      "instagram-post-agent",
    ]);
  });

  it("projects runtime definition metadata for existing canvas callers", () => {
    const template = getAgentTemplate("instagram-post-agent");
    const definition = getAgentDefinition("instagram-post-agent");

    expect(definition).toBeDefined();

    expect(template?.name).toBe(definition?.metadata.name);
    expect(template?.description).toBe(definition?.metadata.description);
    expect(template?.emoji).toBe(definition?.metadata.emoji);
    expect(template?.color).toBe(definition?.metadata.color);
    expect(template?.vibe).toBe(definition?.metadata.vibe);
    expect(template?.tools).toEqual(definition?.uiReference.tools);
    expect(template?.channels).toEqual(definition?.channelCatalog);
    expect(template?.expectedInputs).toEqual(definition?.uiReference.expectedInputs);
    expect(template?.expectedOutputs).toEqual(definition?.uiReference.expectedOutputs);
    expect(template?.notes).toEqual(definition?.uiReference.notes);
  });

  it("keeps unknown template lookup behavior unchanged", () => {
    expect(getAgentTemplate("unknown-template")).toBeUndefined();
  });
});
