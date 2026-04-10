export type AgentDefinitionId = "campaign-distributor";

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
    id: "campaign-distributor",
    version: 1,
    metadata: {
      name: "Campaign Distributor",
      description:
        "Turns LemonSpace visual variants and optional campaign context into channel-native distribution packages.",
      emoji: "lemon",
      color: "yellow",
      vibe: "Transforms canvas outputs into channel-native campaign content that can ship immediately.",
    },
    docs: {
      markdownPath: "components/agents/campaign-distributor.md",
    },
    acceptedSourceNodeTypes: [
      "image",
      "asset",
      "video",
      "text",
      "note",
      "frame",
      "compare",
      "render",
      "ai-image",
      "ai-video",
    ],
    briefFieldOrder: [
      "briefing",
      "audience",
      "tone",
      "targetChannels",
      "hardConstraints",
    ],
    channelCatalog: [
      "Instagram Feed",
      "Instagram Stories",
      "Instagram Reels",
      "LinkedIn",
      "X (Twitter)",
      "TikTok",
      "Pinterest",
      "WhatsApp Business",
      "Telegram",
      "E-Mail Newsletter",
      "Discord",
    ],
    operatorParameters: [
      {
        key: "targetChannels",
        label: "Target channels",
        type: "multi-select",
        options: [
          "Instagram Feed",
          "Instagram Stories",
          "Instagram Reels",
          "LinkedIn",
          "X (Twitter)",
          "TikTok",
          "Pinterest",
          "WhatsApp Business",
          "Telegram",
          "E-Mail Newsletter",
          "Discord",
        ],
        defaultValue: ["Instagram Feed", "LinkedIn", "E-Mail Newsletter"],
        description: "Controls which channels receive one structured output each.",
      },
      {
        key: "variantsPerChannel",
        label: "Variants per channel",
        type: "select",
        options: ["1", "2", "3"],
        defaultValue: "1",
        description: "Controls how many alternative copy variants are produced per selected channel.",
      },
      {
        key: "toneOverride",
        label: "Tone override",
        type: "select",
        options: ["auto", "professional", "casual", "inspiring", "direct"],
        defaultValue: "auto",
        description: "Forces a global tone while still adapting output to channel format constraints.",
      },
    ],
    analysisRules: [
      "Validate that at least one visual source is present and request clarification only when required context is missing.",
      "Detect output language from briefing context and default to English when ambiguous.",
      "Assign assets to channels by format fit and visual intent, and surface assignment rationale.",
      "Produce one execution step per selected channel with explicit goal, sections, and quality checks.",
      "Record assumptions whenever brief details are missing, and never hide uncertainty.",
    ],
    executionRules: [
      "Generate one structured output payload per execution step and keep titles channel-specific.",
      "Respect requiredSections and requiredMetadataKeys for the selected blueprint.",
      "Keep language and tone aligned with brief constraints and toneOverride settings.",
      "State format mismatches explicitly and provide a practical remediation note.",
      "Return qualityChecks as explicit user-visible claims, not hidden reasoning.",
    ],
    defaultOutputBlueprints: [
      {
        artifactType: "social-caption-pack",
        requiredSections: ["Hook", "Caption", "Hashtags", "CTA", "Format note"],
        requiredMetadataKeys: [
          "objective",
          "targetAudience",
          "channel",
          "assetRef",
          "language",
          "tone",
          "recommendedFormat",
        ],
        qualityChecks: [
          "matches_channel_constraints",
          "uses_clear_cta",
          "references_assigned_asset",
          "avoids_unverified_claims",
        ],
      },
      {
        artifactType: "messenger-copy",
        requiredSections: ["Opening", "Message", "CTA", "Format note"],
        requiredMetadataKeys: ["objective", "channel", "assetRef", "language", "sendWindow"],
        qualityChecks: ["fits_channel_tone", "contains_one_clear_action", "is_high_signal"],
      },
      {
        artifactType: "newsletter-block",
        requiredSections: ["Subject", "Preview line", "Body block", "CTA"],
        requiredMetadataKeys: ["objective", "channel", "assetRef", "language", "recommendedSendTime"],
        qualityChecks: ["is_publish_ready", "respects_reader_time", "contains_single_primary_cta"],
      },
    ],
    uiReference: {
      tools: ["WebFetch", "WebSearch", "Read", "Write", "Edit"],
      expectedInputs: [
        "Visual node outputs (image, ai-image, render, compare)",
        "Optional briefing context (text, note)",
        "Asset labels, prompts, dimensions, and format hints",
      ],
      expectedOutputs: [
        "Per-channel structured delivery packages",
        "Asset assignment rationale",
        "Channel-ready captions, CTA, and format notes",
        "Newsletter-ready subject, preview line, and body block",
      ],
      notes: [
        "Primary outputs are structured agent-output nodes, not raw ai-text nodes.",
        "Language defaults to English when briefing language is ambiguous.",
        "Assumptions must be explicit when required context is missing.",
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
