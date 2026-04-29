import { describe, expect, it } from "vitest";

import {
  commentContentToPlainText,
  createCommentContentFromText,
  createEmptyCommentNodeData,
  normalizeCommentNodeData,
  stripCommentRuntimeFields,
} from "@/components/canvas/nodes/comment-node-data";

describe("comment node data", () => {
  it("normalizes legacy text into the mentions-ready block structure", () => {
    const normalized = normalizeCommentNodeData({
      content: "Check the logo spacing",
      resolved: true,
    });

    expect(normalized.resolved).toBe(true);
    expect(normalized.content).toEqual({
      version: 1,
      blocks: [
        {
          id: expect.any(String),
          type: "paragraph",
          tokens: [{ kind: "text", text: "Check the logo spacing" }],
        },
      ],
    });
    expect(commentContentToPlainText(normalized.content)).toBe("Check the logo spacing");
  });

  it("preserves mention tokens and threaded reply metadata", () => {
    const normalized = normalizeCommentNodeData({
      content: {
        version: 1,
        blocks: [
          {
            id: "block-1",
            type: "paragraph",
            tokens: [
              { kind: "text", text: "Ask " },
              { kind: "mention", label: "Mira", userId: "user-1" },
              { kind: "text", text: " to review" },
            ],
          },
        ],
      },
      replies: [
        {
          id: "reply-1",
          content: createCommentContentFromText("Looks good"),
          createdAt: 42,
          updatedAt: 84,
          authorName: "Sam",
        },
      ],
    });

    expect(commentContentToPlainText(normalized.content)).toBe("Ask @Mira to review");
    expect(normalized.replies).toEqual([
      expect.objectContaining({
        id: "reply-1",
        createdAt: 42,
        updatedAt: 84,
        authorName: "Sam",
      }),
    ]);
    expect(commentContentToPlainText(normalized.replies[0].content)).toBe("Looks good");
  });

  it("falls back to empty data for malformed payloads", () => {
    expect(normalizeCommentNodeData(null)).toEqual(createEmptyCommentNodeData());
    expect(normalizeCommentNodeData({ content: { version: 7, blocks: "nope" } }).content).toEqual(
      createEmptyCommentNodeData().content,
    );
  });

  it("strips runtime status fields before persistence", () => {
    expect(
      stripCommentRuntimeFields({
        ...createEmptyCommentNodeData(),
        _status: "error",
        _statusMessage: "Nope",
      }),
    ).toEqual(createEmptyCommentNodeData());
  });
});
