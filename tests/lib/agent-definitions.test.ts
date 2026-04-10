import { describe, expect, it } from "vitest";

import {
  AGENT_DEFINITIONS,
  getAgentDefinition,
} from "@/lib/agent-definitions";

describe("agent definitions", () => {
  it("registers exactly one runtime definition for now", () => {
    expect(AGENT_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "campaign-distributor",
    ]);
  });

  it("returns campaign distributor with runtime metadata and blueprint contract", () => {
    const definition = getAgentDefinition("campaign-distributor");

    expect(definition?.metadata.name).toBe("Campaign Distributor");
    expect(definition?.metadata.color).toBe("yellow");
    expect(definition?.docs.markdownPath).toBe(
      "components/agents/campaign-distributor.md",
    );
    expect(definition?.acceptedSourceNodeTypes).toContain("text");
    expect(definition?.briefFieldOrder).toEqual([
      "briefing",
      "audience",
      "tone",
      "targetChannels",
      "hardConstraints",
    ]);
    expect(definition?.channelCatalog).toContain("Instagram Feed");
    expect(definition?.operatorParameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "targetChannels", type: "multi-select" }),
        expect.objectContaining({ key: "variantsPerChannel", type: "select" }),
        expect.objectContaining({ key: "toneOverride", type: "select" }),
      ]),
    );
    expect(definition?.analysisRules.length).toBeGreaterThan(0);
    expect(definition?.executionRules.length).toBeGreaterThan(0);
    expect(definition?.defaultOutputBlueprints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactType: "social-caption-pack",
          requiredSections: expect.arrayContaining(["Hook", "Caption"]),
          requiredMetadataKeys: expect.arrayContaining([
            "objective",
            "targetAudience",
          ]),
          qualityChecks: expect.arrayContaining([
            "matches_channel_constraints",
          ]),
        }),
      ]),
    );
  });

  it("keeps shared runtime fields accessible without template-specific branching", () => {
    const definition = getAgentDefinition("campaign-distributor");
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
      id: "campaign-distributor",
      markdownPath: "components/agents/campaign-distributor.md",
      sourceTypeCount: definition.acceptedSourceNodeTypes.length,
      blueprintCount: definition.defaultOutputBlueprints.length,
    });
    expect(commonProjection.sourceTypeCount).toBeGreaterThan(0);
    expect(commonProjection.blueprintCount).toBeGreaterThan(0);
  });
});
