export type {
  AgentBriefConstraints,
  AgentClarificationAnswerMap,
  AgentClarificationQuestion,
  AgentLocale,
  PreflightClarificationInput,
} from "@/lib/agent-run-contract-brief";
export {
  areClarificationAnswersComplete,
  buildPreflightClarificationQuestions,
  normalizeAgentBriefConstraints,
  normalizeAgentLocale,
} from "@/lib/agent-run-contract-brief";
export type { AgentExecutionPlan, AgentExecutionStep } from "@/lib/agent-run-contract-plan";
export { normalizeAgentExecutionPlan } from "@/lib/agent-run-contract-plan";
export type {
  AgentOutputDraft,
  AgentOutputSection,
  AgentStructuredMetadataEntry,
  AgentStructuredOutput,
  AgentStructuredOutputDraft,
} from "@/lib/agent-run-contract-output";
export {
  normalizeAgentOutputDraft,
  normalizeAgentStructuredOutput,
} from "@/lib/agent-run-contract-output";

import type { AgentClarificationQuestion } from "@/lib/agent-run-contract-brief";
import type { AgentExecutionPlan } from "@/lib/agent-run-contract-plan";
import type { AgentOutputDraft } from "@/lib/agent-run-contract-output";

export type AgentAnalyzeResult = {
  clarificationQuestions: AgentClarificationQuestion[];
  executionPlan: AgentExecutionPlan | null;
  outputDrafts: AgentOutputDraft[];
};
