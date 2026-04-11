import { describe, expect, it } from "vitest";

import { normalizeAgentStructuredOutput } from "@/lib/agent-run-contract";

describe("normalizeAgentStructuredOutput", () => {
  it("preserves valid structured fields and compatibility body", () => {
    const normalized = normalizeAgentStructuredOutput(
      {
        title: "  Launch Post  ",
        channel: "  linkedin  ",
        artifactType: "  social-post  ",
        previewText: "  Hook-first launch post.  ",
        sections: [
          {
            id: "  headline  ",
            label: "  Headline  ",
            content: "  Ship faster with LemonSpace.  ",
          },
        ],
        metadata: {
          language: "  en  ",
          tags: ["  launch  ", "saas", ""],
        },
        qualityChecks: ["  concise  ", "concise", "channel-fit"],
        body: "  Legacy flat content  ",
      },
      {
        title: "Fallback Title",
        channel: "fallback-channel",
        artifactType: "fallback-artifact",
      },
    );

    expect(normalized).toEqual({
      title: "Launch Post",
      channel: "linkedin",
      artifactType: "social-post",
      previewText: "Hook-first launch post.",
      sections: [
        {
          id: "headline",
          label: "Headline",
          content: "Ship faster with LemonSpace.",
        },
      ],
      metadata: {
        language: "en",
        tags: ["launch", "saas"],
      },
      metadataLabels: {
        language: "language",
        tags: "tags",
      },
      qualityChecks: ["concise", "channel-fit"],
      body: "Legacy flat content",
    });
  });

  it("removes blank or malformed section entries", () => {
    const normalized = normalizeAgentStructuredOutput(
      {
        sections: [
          {
            id: "intro",
            label: "Intro",
            content: "Keep this section.",
          },
          {
            id: "",
            label: "",
            content: "",
          },
          {
            id: "missing-content",
            label: "Missing Content",
            content: " ",
          },
          null,
          "bad-shape",
        ],
      },
      {
        title: "Fallback Title",
        channel: "fallback-channel",
        artifactType: "fallback-artifact",
      },
    );

    expect(normalized.sections).toEqual([
      {
        id: "intro",
        label: "Intro",
        content: "Keep this section.",
      },
    ]);
  });

  it("derives previewText deterministically from first valid section when missing", () => {
    const normalized = normalizeAgentStructuredOutput(
      {
        sections: [
          {
            id: "hook",
            label: "Hook",
            content: "First section content.",
          },
          {
            id: "cta",
            label: "CTA",
            content: "Second section content.",
          },
        ],
      },
      {
        title: "Fallback Title",
        channel: "fallback-channel",
        artifactType: "fallback-artifact",
      },
    );

    expect(normalized.previewText).toBe("First section content.");
  });

  it("derives deterministic legacy body from sections when body is missing", () => {
    const normalized = normalizeAgentStructuredOutput(
      {
        previewText: "Preview should not override section flattening",
        sections: [
          {
            id: "hook",
            label: "Hook",
            content: "Lead with a bold claim.",
          },
          {
            id: "cta",
            label: "CTA",
            content: "Invite replies with a concrete question.",
          },
        ],
      },
      {
        title: "Fallback Title",
        channel: "fallback-channel",
        artifactType: "fallback-artifact",
      },
    );

    expect(normalized.body).toBe(
      "Hook:\nLead with a bold claim.\n\nCTA:\nInvite replies with a concrete question.",
    );
  });

  it("slugifies non-ascii metadata keys and preserves original labels", () => {
    const normalized = normalizeAgentStructuredOutput(
      {
        sections: [
          {
            id: "caption",
            label: "Caption",
            content: "Publish-ready caption.",
          },
        ],
        metadataEntries: [
          { key: "tonalität", values: ["freundlich"] },
          { key: "hashtags", values: ["dogs", "berner-sennenhund"] },
          { key: "empty", values: [] },
          { key: "  ", values: ["ignored"] },
        ],
      },
      {
        title: "Fallback Title",
        channel: "fallback-channel",
        artifactType: "fallback-artifact",
      },
    );

    expect(normalized.metadata).toEqual({
      tonalitaet: "freundlich",
      hashtags: ["dogs", "berner-sennenhund"],
    });
    expect(normalized.metadataLabels).toEqual({
      tonalitaet: "tonalität",
      hashtags: "hashtags",
    });
  });
});
