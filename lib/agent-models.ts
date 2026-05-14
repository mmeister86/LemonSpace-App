/**
 * Onboarding note:
 * Shared TypeScript utility for agent models. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type AgentModelId =
  | "openai/gpt-5.4-nano"
  | "openai/gpt-5.4-mini"
  | "openai/gpt-5.4"
  | "openai/gpt-5.4-pro";

export type AgentModelMinTier = "starter" | "max";
export type AgentModelAccessTier = "free" | "starter" | "pro" | "max" | "business";

export interface AgentModel {
  id: AgentModelId;
  label: string;
  minTier: AgentModelMinTier;
  creditCost: number;
  description: string;
  supportsVision: boolean;
}

export const AGENT_MODELS = {
  "openai/gpt-5.4-nano": {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    minTier: "starter",
    creditCost: 6,
    description: "Fastest option for lightweight agent runs",
    supportsVision: true,
  },
  "openai/gpt-5.4-mini": {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    minTier: "starter",
    creditCost: 15,
    description: "Balanced quality and latency for default use",
    supportsVision: true,
  },
  "openai/gpt-5.4": {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    minTier: "starter",
    creditCost: 38,
    description: "Higher reasoning quality for complex tasks",
    supportsVision: true,
  },
  "openai/gpt-5.4-pro": {
    id: "openai/gpt-5.4-pro",
    label: "GPT-5.4 Pro",
    minTier: "max",
    creditCost: 180,
    description: "Top-tier capability for hardest workflows",
    supportsVision: true,
  },
} as const satisfies Record<AgentModelId, AgentModel>;

export const DEFAULT_AGENT_MODEL_ID: AgentModelId = "openai/gpt-5.4-mini";

const AGENT_MODEL_IDS = Object.keys(AGENT_MODELS) as AgentModelId[];

const AGENT_MODEL_TIER_ORDER: Record<AgentModelAccessTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  max: 3,
  business: 4,
};

export function getAgentModel(id: string): AgentModel | undefined {
  return AGENT_MODELS[id as AgentModelId];
}

export function isAgentModelAvailableForTier(
  tier: AgentModelAccessTier,
  modelId: AgentModelId,
): boolean {
  const model = AGENT_MODELS[modelId];
  return AGENT_MODEL_TIER_ORDER[model.minTier] <= AGENT_MODEL_TIER_ORDER[tier];
}

export function getAvailableAgentModels(tier: AgentModelAccessTier): AgentModel[] {
  return AGENT_MODEL_IDS.map((id) => AGENT_MODELS[id]).filter((model) =>
    isAgentModelAvailableForTier(tier, model.id),
  );
}
