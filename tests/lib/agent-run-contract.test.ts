import { describe, expect, it } from "vitest";

import {
  areClarificationAnswersComplete,
  normalizeAgentExecutionPlan,
  normalizeAgentOutputDraft,
  type AgentClarificationAnswerMap,
  type AgentClarificationQuestion,
  type AgentExecutionPlan,
} from "@/lib/agent-run-contract";

describe("agent run contract helpers", () => {
  describe("areClarificationAnswersComplete", () => {
    it("returns true when every required question has a non-empty answer", () => {
      const questions: AgentClarificationQuestion[] = [
        { id: "goal", prompt: "What is the goal?", required: true },
        { id: "tone", prompt: "Preferred tone?", required: false },
        { id: "audience", prompt: "Who is the audience?", required: true },
      ];

      const answers: AgentClarificationAnswerMap = {
        goal: "Generate launch captions",
        audience: "SaaS founders",
      };

      expect(areClarificationAnswersComplete(questions, answers)).toBe(true);
    });

    it("returns false when a required question is missing", () => {
      const questions: AgentClarificationQuestion[] = [
        { id: "goal", prompt: "What is the goal?", required: true },
        { id: "audience", prompt: "Who is the audience?", required: true },
      ];

      const answers: AgentClarificationAnswerMap = {
        goal: "Generate launch captions",
      };

      expect(areClarificationAnswersComplete(questions, answers)).toBe(false);
    });

    it("returns false when required answers are blank after trimming", () => {
      const questions: AgentClarificationQuestion[] = [
        { id: "goal", prompt: "What is the goal?", required: true },
      ];

      const answers: AgentClarificationAnswerMap = {
        goal: "   ",
      };

      expect(areClarificationAnswersComplete(questions, answers)).toBe(false);
    });
  });

  describe("normalizeAgentOutputDraft", () => {
    it("trims draft fields and keeps non-empty values", () => {
      const normalized = normalizeAgentOutputDraft({
        title: "  Launch Caption Pack  ",
        channel: "  Instagram Feed  ",
        outputType: "  caption-package  ",
        body: "  3 variants with hook-first copy.  ",
      });

      expect(normalized).toEqual({
        title: "Launch Caption Pack",
        channel: "Instagram Feed",
        outputType: "caption-package",
        body: "3 variants with hook-first copy.",
      });
    });

    it("uses safe fallback values and guarantees body string", () => {
      const normalized = normalizeAgentOutputDraft({
        title: "   ",
        channel: "",
        outputType: "   ",
      });

      expect(normalized).toEqual({
        title: "Untitled",
        channel: "general",
        outputType: "text",
        body: "",
      });
    });

    it("coerces non-string body values to empty string", () => {
      const normalized = normalizeAgentOutputDraft({
        title: "Recap",
        channel: "Email",
        outputType: "summary",
        body: null as unknown as string,
      });

      expect(normalized.body).toBe("");
    });
  });

  describe("normalizeAgentExecutionPlan", () => {
    it("trims summary and step metadata while preserving valid values", () => {
      const normalized = normalizeAgentExecutionPlan({
        summary: "  Ship a launch kit  ",
        steps: [
          {
            id: "  STEP-1  ",
            title: "  Instagram captions  ",
            channel: "  Instagram  ",
            outputType: "  caption-pack  ",
          },
        ],
      });

      expect(normalized).toEqual<AgentExecutionPlan>({
        summary: "Ship a launch kit",
        steps: [
          {
            id: "step-1",
            title: "Instagram captions",
            channel: "Instagram",
            outputType: "caption-pack",
          },
        ],
      });
    });

    it("falls back to safe defaults for invalid payloads", () => {
      const normalized = normalizeAgentExecutionPlan({
        summary: null,
        steps: [
          {
            id: "",
            title: "",
            channel: "   ",
            outputType: undefined,
          },
          null,
        ],
      });

      expect(normalized).toEqual<AgentExecutionPlan>({
        summary: "",
        steps: [
          {
            id: "step-1",
            title: "Untitled",
            channel: "general",
            outputType: "text",
          },
        ],
      });
    });

    it("deduplicates step ids and creates deterministic fallback ids", () => {
      const normalized = normalizeAgentExecutionPlan({
        summary: "ready",
        steps: [
          {
            id: "step",
            title: "One",
            channel: "email",
            outputType: "copy",
          },
          {
            id: "step",
            title: "Two",
            channel: "x",
            outputType: "thread",
          },
          {
            id: "",
            title: "Three",
            channel: "linkedin",
            outputType: "post",
          },
        ],
      });

      expect(normalized.steps.map((step) => step.id)).toEqual(["step", "step-2", "step-3"]);
    });
  });
});
