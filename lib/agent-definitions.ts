/**
 * Onboarding note:
 * Runtime registry for agent capabilities, rules, blueprint steps, and documentation paths.
 */

export type AgentDefinitionId = "instagram-post-agent";

export type AgentRuntimeDefinition = {
  kind: "tool-harness";
  harnessId: "instagram-post";
};

export type AgentOutputBlueprint = {
  artifactType: string;
  requiredSections: readonly string[];
  requiredMetadataKeys: readonly string[];
  qualityChecks: readonly string[];
};

export type AgentOperatorParameter = {
  key: string;
  label: string;
  type: "multi-select" | "select";
  options: readonly string[];
  defaultValue: string | readonly string[];
  description: string;
};

export type AgentDefinition = {
  id: AgentDefinitionId;
  version: number;
  metadata: {
    name: string;
    description: string;
    emoji: string;
    color: string;
    vibe: string;
  };
  docs: {
    markdownPath: string;
  };
  runtime: AgentRuntimeDefinition;
  acceptedSourceNodeTypes: readonly string[];
  briefFieldOrder: readonly string[];
  channelCatalog: readonly string[];
  operatorParameters: readonly AgentOperatorParameter[];
  analysisRules: readonly string[];
  executionRules: readonly string[];
  defaultOutputBlueprints: readonly AgentOutputBlueprint[];
  uiReference: {
    tools: readonly string[];
    expectedInputs: readonly string[];
    expectedOutputs: readonly string[];
    notes: readonly string[];
  };
};

export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  {
    id: "instagram-post-agent",
    version: 1,
    metadata: {
      name: "Instagram Post Agent",
      description:
        "Turns connected LemonSpace assets and campaign context into editable Instagram post fields feeding a live post mockup.",
      emoji: "camera",
      color: "pink",
      vibe: "Builds a ready-to-review Instagram post from the canvas context in front of it.",
    },
    docs: {
      markdownPath: "components/agents/instagram-post-agent.md",
    },
    runtime: {
      kind: "tool-harness",
      harnessId: "instagram-post",
    },
    acceptedSourceNodeTypes: [
      "image",
      "asset",
      "text",
      "note",
      "render",
      "ai-image",
      "agent-output",
      "ai-text-output",
    ],
    briefFieldOrder: [
      "briefing",
      "audience",
      "tone",
      "targetChannels",
      "hardConstraints",
    ],
    channelCatalog: ["Instagram Feed"],
    operatorParameters: [],
    analysisRules: [
      "Read only directly connected canvas inputs and treat them as the full available context.",
      "Select the strongest visual source for an Instagram feed post and record assumptions when context is sparse.",
      "Create editable post fields as the source of truth and label synthetic preview metadata clearly.",
    ],
    executionRules: [
      "Use the Instagram harness tools instead of free-form canvas edits.",
      "Create exactly one editable Instagram post package per run.",
      "Never edit or delete existing canvas nodes.",
    ],
    defaultOutputBlueprints: [
      {
        artifactType: "instagram-post-package",
        requiredSections: ["Caption", "Hashtags", "CTA", "Alt text", "Visual prompt", "Assumptions"],
        requiredMetadataKeys: [
          "fieldNodeIds",
          "sourceNodeIds",
          "syntheticPreviewFields",
          "selectedImageNodeId",
          "language",
        ],
        qualityChecks: [
          "uses_connected_canvas_context",
          "creates_editable_field_nodes",
          "wires_live_mockup_bindings",
          "labels_synthetic_preview_metadata",
          "contains_caption_hashtags_cta",
        ],
      },
    ],
    uiReference: {
      tools: [
        "read_connected_context",
        "create_instagram_post_package",
      ],
      expectedInputs: [
        "Connected image, asset, render, ai-image, text, note, or agent-output nodes",
        "Optional briefing constraints on the agent node",
      ],
      expectedOutputs: [
        "Editable caption text node",
        "Editable hashtags text node",
        "Editable CTA text node",
        "Editable alt-text node",
        "Editable visual prompt node",
        "Live Instagram post mockup node",
      ],
      notes: [
        "The agent reads only directly connected inputs.",
        "Synthetic social metadata must be labelled in output metadata.",
        "Existing nodes are never edited by the Instagram harness.",
      ],
    },
  },
] as const;

const AGENT_DEFINITION_BY_ID = new Map<AgentDefinitionId, AgentDefinition>(
  AGENT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getAgentDefinition(id: string): AgentDefinition | undefined {
  return AGENT_DEFINITION_BY_ID.get(id as AgentDefinitionId);
}
