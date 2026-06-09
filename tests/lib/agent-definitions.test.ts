import { describe, expect, it } from "vitest";

import {
  AGENT_DEFINITIONS,
  getAgentDefinition,
} from "@/lib/agent-definitions";

describe("agent definitions", () => {
  it("registers only the Instagram tool-harness agent definition", () => {
    expect(AGENT_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "instagram-post-agent",
    ]);
  });

  it("registers instagram post agent as a tool harness definition", () => {
    const definition = getAgentDefinition("instagram-post-agent");

    expect(definition?.metadata.name).toBe("Instagram Post Agent");
    expect(definition?.runtime.kind).toBe("tool-harness");
    expect(definition?.runtime.harnessId).toBe("instagram-post");
    expect(definition?.defaultOutputBlueprints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactType: "instagram-post-package",
          requiredSections: expect.arrayContaining([
            "Caption",
            "Hashtags",
            "CTA",
            "Alt text",
            "Visual prompt",
          ]),
          requiredMetadataKeys: expect.arrayContaining([
            "fieldNodeIds",
            "sourceNodeIds",
            "syntheticPreviewFields",
            "selectedImageNodeId",
          ]),
          qualityChecks: expect.arrayContaining([
            "creates_editable_field_nodes",
            "wires_live_mockup_bindings",
          ]),
        }),
      ]),
    );
  });

  it("keeps shared runtime fields accessible without legacy campaign branching", () => {
    const definition = getAgentDefinition("instagram-post-agent");
    if (!definition) {
      throw new Error("Missing definition");
    }

    const commonProjection = {
      id: definition.id,
      markdownPath: definition.docs.markdownPath,
      sourceTypeCount: definition.acceptedSourceNodeTypes.length,
      blueprintCount: definition.defaultOutputBlueprints.length,
    };

    expect(commonProjection).toEqual({
      id: "instagram-post-agent",
      markdownPath: "components/agents/instagram-post-agent.md",
      sourceTypeCount: definition.acceptedSourceNodeTypes.length,
      blueprintCount: definition.defaultOutputBlueprints.length,
    });
    expect(commonProjection.sourceTypeCount).toBeGreaterThan(0);
    expect(commonProjection.blueprintCount).toBeGreaterThan(0);
  });
});
