export type AgentTemplateId = "campaign-distributor";

export type AgentTemplate = {
  id: AgentTemplateId;
  name: string;
  description: string;
  emoji: string;
  color: string;
  vibe: string;
  tools: readonly string[];
  channels: readonly string[];
  expectedInputs: readonly string[];
  expectedOutputs: readonly string[];
  notes: readonly string[];
};

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  {
    id: "campaign-distributor",
    name: "Campaign Distributor",
    description:
      "Develops and distributes LemonSpace campaign content across social media and messenger channels.",
    emoji: "lemon",
    color: "yellow",
    vibe: "Transforms canvas outputs into campaign-ready channel content.",
    tools: ["WebFetch", "WebSearch", "Read", "Write", "Edit"],
    channels: [
      "Instagram Feed",
      "Instagram Stories",
      "Instagram Reels",
      "LinkedIn",
      "Twitter / X",
      "TikTok",
      "Pinterest",
      "WhatsApp Business",
      "Telegram",
      "E-Mail Newsletter",
      "Discord",
    ],
    expectedInputs: [
      "Render-Node-Export",
      "Compare-Varianten",
      "KI-Bild-Output",
      "Frame-Dimensionen",
    ],
    expectedOutputs: [
      "Caption-Pakete",
      "Kanal-Matrix",
      "Posting-Plan",
      "Hashtag-Sets",
      "Messenger-Texte",
    ],
    notes: [
      "MVP: static input-only node, no execution flow.",
      "agent-output remains pending until runtime orchestration exists.",
    ],
  },
] as const;

const AGENT_TEMPLATE_BY_ID = new Map<AgentTemplateId, AgentTemplate>(
  AGENT_TEMPLATES.map((template) => [template.id, template]),
);

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  if (id === "campaign-distributor") {
    return AGENT_TEMPLATE_BY_ID.get(id);
  }
  return undefined;
}
