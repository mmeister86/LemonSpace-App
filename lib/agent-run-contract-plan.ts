import {
  normalizeStepId,
  normalizeStringArray,
  SAFE_FALLBACK_CHANNEL,
  SAFE_FALLBACK_GOAL,
  SAFE_FALLBACK_OUTPUT_TYPE,
  SAFE_FALLBACK_TITLE,
  trimString,
} from "@/lib/agent-run-contract-shared";

export type AgentExecutionStep = {
  id: string;
  title: string;
  channel: string;
  outputType: string;
  artifactType: string;
  goal: string;
  requiredSections: string[];
  qualityChecks: string[];
};

export type AgentExecutionPlan = {
  summary: string;
  steps: AgentExecutionStep[];
};

export function normalizeAgentExecutionPlan(raw: unknown): AgentExecutionPlan {
  const rawRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const rawSteps = Array.isArray(rawRecord?.steps) ? rawRecord.steps : [];
  const seenStepIds = new Set<string>();
  const steps: AgentExecutionStep[] = [];

  for (let index = 0; index < rawSteps.length; index += 1) {
    const item = rawSteps[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const fallbackId = `step-${index + 1}`;
    const normalizedCandidateId = normalizeStepId(itemRecord.id) || fallbackId;
    let stepId = normalizedCandidateId;
    let suffix = 2;
    while (seenStepIds.has(stepId)) {
      stepId = `${normalizedCandidateId}-${suffix}`;
      suffix += 1;
    }
    seenStepIds.add(stepId);

    steps.push({
      id: stepId,
      title: trimString(itemRecord.title) || SAFE_FALLBACK_TITLE,
      channel: trimString(itemRecord.channel) || SAFE_FALLBACK_CHANNEL,
      outputType: trimString(itemRecord.outputType) || SAFE_FALLBACK_OUTPUT_TYPE,
      artifactType:
        trimString(itemRecord.artifactType) ||
        trimString(itemRecord.outputType) ||
        SAFE_FALLBACK_OUTPUT_TYPE,
      goal: trimString(itemRecord.goal) || SAFE_FALLBACK_GOAL,
      requiredSections: normalizeStringArray(itemRecord.requiredSections),
      qualityChecks: normalizeStringArray(itemRecord.qualityChecks),
    });
  }

  return {
    summary: trimString(rawRecord?.summary),
    steps,
  };
}
