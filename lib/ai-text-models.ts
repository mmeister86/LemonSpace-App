/**
 * Onboarding note:
 * Shared TypeScript utility for ai text models. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL_ID,
  getAgentModel,
  getAvailableAgentModels,
  isAgentModelAvailableForTier,
  type AgentModel,
  type AgentModelAccessTier,
  type AgentModelId,
} from "@/lib/agent-models";

export type AiTextModel = AgentModel;
export type AiTextModelId = AgentModelId;
export type AiTextModelAccessTier = AgentModelAccessTier;

export const AI_TEXT_MODELS = AGENT_MODELS;
export const DEFAULT_AI_TEXT_MODEL_ID: AiTextModelId = DEFAULT_AGENT_MODEL_ID;

export function getAiTextModel(id: string): AiTextModel | undefined {
  return getAgentModel(id);
}

export function isAiTextModelAvailableForTier(
  tier: AiTextModelAccessTier,
  modelId: AiTextModelId,
): boolean {
  return isAgentModelAvailableForTier(tier, modelId);
}

export function getAvailableAiTextModels(tier: AiTextModelAccessTier): AiTextModel[] {
  return getAvailableAgentModels(tier);
}
