import { describe, expect, it } from "vitest";

import {
  resolveInstagramPostMockup,
  normalizeInstagramHashtags,
} from "@/lib/instagram-post-mockup";
import { createEditorJsDataFromPlainText } from "@/lib/canvas-rich-text";
import { buildGraphSnapshot } from "@/lib/canvas-render-preview";

describe("instagram post mockup resolver", () => {
  it("derives post props from connected editable field nodes", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "mockup-1",
          type: "instagram-post-mockup",
          data: {
            snapshot: {
              username: "lemonspace",
              location: "Preview location",
              likesCount: 128,
              caption: "Old generated caption",
              hashtags: ["#old"],
            },
          },
        },
        {
          id: "caption-1",
          type: "text",
          data: {
            content: "Fresh caption",
            richText: {
              format: "editorjs",
              version: 1,
              ...createEditorJsDataFromPlainText("Fresh caption"),
            },
          },
        },
        { id: "hashtags-1", type: "text", data: { content: "Launch, #Canvas launch" } },
        { id: "cta-1", type: "text", data: { content: "Try it today." } },
        { id: "alt-1", type: "text", data: { content: "Product interface on a canvas." } },
        { id: "prompt-1", type: "prompt", data: { prompt: "Refine the visual with brighter light." } },
        { id: "image-1", type: "image", data: { url: "https://example.com/post.png" } },
      ],
      [
        { source: "caption-1", target: "mockup-1", targetHandle: "caption-in" },
        { source: "hashtags-1", target: "mockup-1", targetHandle: "hashtags-in" },
        { source: "cta-1", target: "mockup-1", targetHandle: "cta-in" },
        { source: "alt-1", target: "mockup-1", targetHandle: "alt-text-in" },
        { source: "prompt-1", target: "mockup-1", targetHandle: "visual-prompt-in" },
        { source: "image-1", target: "mockup-1", targetHandle: "visual-in" },
      ],
    );

    const resolved = resolveInstagramPostMockup({
      nodeId: "mockup-1",
      graph,
    });

    expect(resolved.post.caption).toBe("Fresh caption\n\nTry it today.");
    expect(resolved.post.hashtags).toEqual(["#Launch", "#Canvas"]);
    expect(resolved.post.imageUrl).toBe("https://example.com/post.png");
    expect(resolved.post.imageAlt).toBe("Product interface on a canvas.");
    expect(resolved.fields.visualPrompt).toBe("Refine the visual with brighter light.");
    expect(resolved.degradedFields).toEqual([]);
  });

  it("treats connected empty field nodes as deliberate user edits", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "mockup-1",
          type: "instagram-post-mockup",
          data: {
            snapshot: {
              caption: "Generated caption",
              hashtags: ["#generated"],
              cta: "Generated CTA",
              altText: "Generated alt text",
              visualPrompt: "Generated prompt",
              imageUrl: "https://example.com/generated.png",
            },
          },
        },
        { id: "caption-1", type: "text", data: { content: "" } },
        { id: "hashtags-1", type: "text", data: { content: "" } },
        { id: "cta-1", type: "text", data: { content: "" } },
        { id: "alt-1", type: "text", data: { content: "" } },
        { id: "prompt-1", type: "prompt", data: { prompt: "" } },
        { id: "image-1", type: "image", data: {} },
      ],
      [
        { source: "caption-1", target: "mockup-1", targetHandle: "caption-in" },
        { source: "hashtags-1", target: "mockup-1", targetHandle: "hashtags-in" },
        { source: "cta-1", target: "mockup-1", targetHandle: "cta-in" },
        { source: "alt-1", target: "mockup-1", targetHandle: "alt-text-in" },
        { source: "prompt-1", target: "mockup-1", targetHandle: "visual-prompt-in" },
        { source: "image-1", target: "mockup-1", targetHandle: "visual-in" },
      ],
    );

    const resolved = resolveInstagramPostMockup({
      nodeId: "mockup-1",
      graph,
    });

    expect(resolved.post.caption).toBe("");
    expect(resolved.post.hashtags).toEqual([]);
    expect(resolved.post.imageUrl).toBeUndefined();
    expect(resolved.fields.cta).toBe("");
    expect(resolved.fields.altText).toBe("");
    expect(resolved.fields.visualPrompt).toBe("");
  });

  it("falls back to snapshot values and reports missing live inputs", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "mockup-1",
          type: "instagram-post-mockup",
          data: {
            snapshot: {
              username: "lemonspace",
              caption: "Snapshot caption",
              hashtags: ["#snapshot"],
              imageUrl: "https://example.com/snapshot.png",
            },
          },
        },
      ],
      [],
    );

    const resolved = resolveInstagramPostMockup({
      nodeId: "mockup-1",
      graph,
    });

    expect(resolved.post.caption).toBe("Snapshot caption");
    expect(resolved.post.hashtags).toEqual(["#snapshot"]);
    expect(resolved.post.imageUrl).toBe("https://example.com/snapshot.png");
    expect(resolved.degradedFields).toEqual(["visual", "caption", "hashtags"]);
  });

  it("normalizes hashtags from free-form editable text", () => {
    expect(normalizeInstagramHashtags("launch #Launch, canvas\nAI! team-work")).toEqual([
      "#launch",
      "#canvas",
      "#AI",
      "#teamwork",
    ]);
  });
});
