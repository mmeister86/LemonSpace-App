// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEditorJsDataFromPlainText,
  editorJsDataToPlainText,
  normalizeTextNodeRichText,
  sanitizeEditorJsInlineHtml,
  toPersistedEditorJsRichText,
} from "@/components/canvas/nodes/text-node-richtext";

describe("text-node-richtext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts legacy plain content into an Editor.js paragraph", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    expect(createEditorJsDataFromPlainText("Launch copy")).toEqual({
      time: 1234,
      blocks: [
        {
          type: "paragraph",
          data: { text: "Launch copy" },
        },
      ],
    });
  });

  it("prefers persisted richText data over the plain content mirror", () => {
    const richText = {
      format: "editorjs",
      version: 1,
      time: 5678,
      blocks: [{ type: "header", data: { text: "Rich headline", level: 2 } }],
    };

    expect(normalizeTextNodeRichText({ content: "Plain", richText })).toEqual({
      time: 5678,
      blocks: richText.blocks,
    });
  });

  it("extracts plain text from paragraph, header, and list blocks", () => {
    const text = editorJsDataToPlainText({
      blocks: [
        { type: "header", data: { text: "Intro <strong>Headline</strong>", level: 2 } },
        { type: "paragraph", data: { text: "First <em>paragraph</em>" } },
        {
          type: "list",
          data: {
            style: "unordered",
            items: [
              { content: "One <b>item</b>", meta: {}, items: [] },
              {
                content: "Parent",
                meta: {},
                items: [{ content: "Nested", meta: {}, items: [] }],
              },
            ],
          },
        },
      ],
    });

    expect(text).toBe("Intro Headline\nFirst paragraph\nOne item\nParent\nNested");
  });

  it("sanitizes preview HTML to the allowed inline subset", () => {
    expect(
      sanitizeEditorJsInlineHtml(
        'Hello <strong>bold</strong><script>alert(1)</script><a href="javascript:alert(1)" onclick="x">bad</a><a href="https://example.com" style="color:red">good</a>',
      ),
    ).toBe(
      'Hello <strong>bold</strong>alert(1)bad<a href="https://example.com" target="_blank" rel="noopener noreferrer">good</a>',
    );
  });

  it("persists an empty paragraph when Editor.js returns no blocks", () => {
    expect(toPersistedEditorJsRichText({ blocks: [] })).toEqual({
      format: "editorjs",
      version: 1,
      blocks: [{ type: "paragraph", data: { text: "" } }],
      time: undefined,
    });
  });
});
