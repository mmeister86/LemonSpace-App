import { describe, expect, it } from "vitest";

import {
  AGENT_PROMPT_SEGMENT_KEYS,
  compileAgentDocSegmentsFromMarkdown,
  type AgentPromptSegmentKey,
} from "@/scripts/compile-agent-docs";
import { AGENT_DOC_SEGMENTS } from "@/lib/generated/agent-doc-segments";

function markedSegment(key: AgentPromptSegmentKey, content: string): string {
  return [
    `<!-- AGENT_PROMPT_SEGMENT:${key}:start -->`,
    content,
    `<!-- AGENT_PROMPT_SEGMENT:${key}:end -->`,
  ].join("\n");
}

describe("agent doc segment compiler", () => {
  it("extracts only explicitly marked sections in deterministic order", () => {
    const markdown = [
      "# Intro",
      "This prose should not be extracted.",
      markedSegment("role", "Role text"),
      "Unmarked detail should not leak.",
      markedSegment("style-rules", "Style text"),
      markedSegment("decision-framework", "Decision text"),
      markedSegment("channel-notes", "Channel text"),
    ].join("\n\n");

    const compiled = compileAgentDocSegmentsFromMarkdown(markdown, {
      sourcePath: "components/agents/test-agent.md",
    });

    expect(Object.keys(compiled)).toEqual(AGENT_PROMPT_SEGMENT_KEYS);
    expect(compiled).toEqual({
      role: "Role text",
      "style-rules": "Style text",
      "decision-framework": "Decision text",
      "channel-notes": "Channel text",
    });
  });

  it("does not include unmarked prose in extracted segments", () => {
    const markdown = [
      "Top prose that must stay out.",
      markedSegment("role", "Keep me"),
      "Random prose should not appear.",
      markedSegment("style-rules", "Keep style"),
      markedSegment("decision-framework", "Keep framework"),
      markedSegment("channel-notes", "Keep channels"),
      "Bottom prose that must stay out.",
    ].join("\n\n");

    const compiled = compileAgentDocSegmentsFromMarkdown(markdown, {
      sourcePath: "components/agents/test-agent.md",
    });

    const joined = Object.values(compiled).join("\n");
    expect(joined).toContain("Keep me");
    expect(joined).not.toContain("Top prose");
    expect(joined).not.toContain("Bottom prose");
    expect(joined).not.toContain("Random prose");
  });

  it("fails loudly when a required section marker is missing", () => {
    const markdown = [
      markedSegment("role", "Role text"),
      markedSegment("style-rules", "Style text"),
      markedSegment("decision-framework", "Decision text"),
    ].join("\n\n");

    expect(() =>
      compileAgentDocSegmentsFromMarkdown(markdown, {
        sourcePath: "components/agents/test-agent.md",
      }),
    ).toThrowError(/channel-notes/);
  });

  it("ships generated campaign distributor segments with all required keys", () => {
    const campaignDistributor = AGENT_DOC_SEGMENTS["campaign-distributor"];
    expect(campaignDistributor).toBeDefined();
    expect(Object.keys(campaignDistributor)).toEqual(AGENT_PROMPT_SEGMENT_KEYS);
    expect(campaignDistributor.role.length).toBeGreaterThan(0);
    expect(campaignDistributor["style-rules"].length).toBeGreaterThan(0);
    expect(campaignDistributor["decision-framework"].length).toBeGreaterThan(0);
    expect(campaignDistributor["channel-notes"].length).toBeGreaterThan(0);
  });
});
