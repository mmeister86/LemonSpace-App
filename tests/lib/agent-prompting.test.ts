import { describe, expect, it } from "vitest";

import { getAgentDefinition } from "@/lib/agent-definitions";
import {
  buildAnalyzeMessages,
  buildExecuteMessages,
  summarizeIncomingContext,
  type PromptContextNode,
} from "@/lib/agent-prompting";
import { normalizeAgentExecutionPlan } from "@/lib/agent-run-contract";
import { AGENT_DOC_SEGMENTS } from "@/lib/generated/agent-doc-segments";

describe("agent prompting helpers", () => {
  const definition = getAgentDefinition("instagram-post-agent");

  it("summarizes incoming context by node with whitelisted fields", () => {
    const nodes: PromptContextNode[] = [
      {
        nodeId: "node-2",
        type: "image",
        status: "done",
        data: {
          url: "https://cdn.example.com/render.png",
          width: 1080,
          height: 1080,
          ignored: "must not be included",
        },
      },
      {
        nodeId: "node-1",
        type: "text",
        status: "idle",
        data: {
          content: "  Product launch headline  ",
          secret: "do not include",
        },
      },
    ];

    const summary = summarizeIncomingContext(nodes);

    expect(summary).toContain("Incoming context nodes: 2");
    expect(summary).toContain("1. nodeId=node-1, type=text, status=idle");
    expect(summary).toContain("2. nodeId=node-2, type=image, status=done");
    expect(summary).toContain("content: Product launch headline");
    expect(summary).toContain("url: https://cdn.example.com/render.png");
    expect(summary).toContain("width: 1080");
    expect(summary).not.toContain("secret");
    expect(summary).not.toContain("ignored");
  });

  it("buildAnalyzeMessages includes definition metadata, prompt segments, rules, and constraints", () => {
    if (!definition) {
      throw new Error("instagram-post-agent definition missing");
    }

    const messages = buildAnalyzeMessages({
      definition,
      locale: "en",
      briefConstraints: {
        briefing: "Create launch copy",
        audience: "Design leads",
        tone: "bold",
        targetChannels: ["instagram", "linkedin"],
        hardConstraints: ["No emojis"],
      },
      clarificationAnswers: {
        budget: "organic",
      },
      incomingContextSummary: "Incoming context nodes: 1",
      incomingContextCount: 1,
      promptSegments: AGENT_DOC_SEGMENTS["instagram-post-agent"],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");

    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";

    expect(system).toContain("Instagram Post Agent");
    expect(system).toContain("role");
    expect(system).toContain("style-rules");
    expect(system).toContain("decision-framework");
    expect(system).toContain("channel-notes");
    expect(system).toContain("analysis rules");
    expect(system).toContain("default output blueprints");
    expect(user).toContain("Brief + constraints");
    expect(user).toContain("Current clarification answers");
    expect(user).toContain("Incoming context node count: 1");
    expect(user).toContain("Incoming context nodes: 1");
  });

  it("buildExecuteMessages includes execution rules, plan summary, per-step requirements, and checks", () => {
    if (!definition) {
      throw new Error("instagram-post-agent definition missing");
    }

    const executionPlan = normalizeAgentExecutionPlan({
      summary: "Ship launch content",
      steps: [
        {
          id: " ig-feed ",
          title: " Instagram Feed Pack ",
          channel: " Instagram Feed ",
          outputType: "caption-pack",
          artifactType: "social-caption-pack",
          goal: "Drive comments",
          requiredSections: ["Hook", "Caption", "CTA"],
          qualityChecks: ["matches_channel_constraints"],
        },
      ],
    });

    const messages = buildExecuteMessages({
      definition,
      locale: "de",
      briefConstraints: {
        briefing: "Post launch update",
        audience: "Founders",
        tone: "energetic",
        targetChannels: ["instagram"],
        hardConstraints: ["No discounts"],
      },
      clarificationAnswers: {
        length: "short",
      },
      incomingContextSummary: "Incoming context nodes: 1",
      executionPlan,
      promptSegments: AGENT_DOC_SEGMENTS["instagram-post-agent"],
    });

    expect(messages).toHaveLength(2);
    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";

    expect(system).toContain("execution rules");
    expect(system).toContain("deliverable-first rules");
    expect(system).toContain("Prioritize publishable, user-facing deliverables");
    expect(system).toContain("Do not produce reasoning-dominant output");
    expect(system).toContain("channel-notes");
    expect(system).toContain("German (de-DE)");
    expect(user).toContain("Execution plan summary: Ship launch content");
    expect(user).toContain("artifactType: social-caption-pack");
    expect(user).toContain("requiredSections: Hook, Caption, CTA");
    expect(user).toContain("qualityChecks: matches_channel_constraints");
  });

  it("prompt builders stay definition-driven without hardcoded template branches", () => {
    if (!definition) {
      throw new Error("instagram-post-agent definition missing");
    }

    const variantDefinition = {
      ...definition,
      metadata: {
        ...definition.metadata,
        name: "Custom Runtime Agent",
        description: "Definition override for test.",
      },
    };

    const messages = buildAnalyzeMessages({
      definition: variantDefinition,
      locale: "en",
      briefConstraints: {
        briefing: "Test",
        audience: "Test",
        tone: "Test",
        targetChannels: ["x"],
        hardConstraints: [],
      },
      clarificationAnswers: {},
      incomingContextSummary: "Incoming context nodes: 0",
      incomingContextCount: 0,
      promptSegments: AGENT_DOC_SEGMENTS["instagram-post-agent"],
    });

    expect(messages[0]?.content ?? "").toContain("Custom Runtime Agent");
    expect(messages[0]?.content ?? "").toContain("Definition override for test.");
  });
});
