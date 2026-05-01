/**
 * Onboarding note:
 * Shared TypeScript utility for agent templates. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import { AGENT_DEFINITIONS, type AgentDefinitionId } from "@/lib/agent-definitions";

export type AgentTemplateId = AgentDefinitionId;

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
  ...AGENT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.metadata.name,
    description: definition.metadata.description,
    emoji: definition.metadata.emoji,
    color: definition.metadata.color,
    vibe: definition.metadata.vibe,
    tools: definition.uiReference.tools,
    channels: definition.channelCatalog,
    expectedInputs: definition.uiReference.expectedInputs,
    expectedOutputs: definition.uiReference.expectedOutputs,
    notes: definition.uiReference.notes,
  })),
] as const;

const AGENT_TEMPLATE_BY_ID = new Map<AgentTemplateId, AgentTemplate>(
  AGENT_TEMPLATES.map((template) => [template.id, template]),
);

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATE_BY_ID.get(id as AgentTemplateId);
}
