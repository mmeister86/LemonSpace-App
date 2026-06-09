import { describe, expect, it } from "vitest";

import {
  buildInstagramPostPackageArtifacts,
  createInstagramHarnessToolState,
  executeInstagramHarnessTool,
  INSTAGRAM_AGENT_TOOLS,
  resolveInstagramPostPackageArgs,
} from "@/convex/agent_instagram_harness";

describe("instagram agent harness tools", () => {
  it("registers only the editable Instagram package tool set", () => {
    expect(INSTAGRAM_AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      "read_connected_context",
      "create_instagram_post_package",
    ]);
  });

  it("falls back to the first connected image URL when the model omits imageUrl", () => {
    const resolved = resolveInstagramPostPackageArgs(
      {
        username: "lemonspace",
        caption: "A connected-image post",
        hashtags: ["#lemonspace"],
        cta: "Try it.",
        altText: "A product screenshot.",
        visualPrompt: "Improve the screenshot lighting.",
      },
      {
        nodes: [
          {
            nodeId: "image-1",
            type: "image",
            fields: {
              url: "https://example.com/input.jpg",
              width: 1024,
              height: 1024,
            },
          },
        ],
      },
    );

    expect(resolved.imageUrl).toBe("https://example.com/input.jpg");
    expect(resolved.sourceNodeIds).toEqual(["image-1"]);
    expect(resolved.selectedImageNodeId).toBe("image-1");
  });

  it("reads connected context through the injected direct-context operation", async () => {
    const state = createInstagramHarnessToolState();
    const result = await executeInstagramHarnessTool({
      state,
      call: {
        id: "call-1",
        name: "read_connected_context",
        arguments: {},
      },
      ops: {
        readConnectedContext: async () => ({
          nodes: [{ nodeId: "node-1", type: "text", fields: { content: "Launch brief" } }],
        }),
        createInstagramPostPackage: async () => ({ nodeId: "unused", fieldNodeIds: {} }),
      },
    });

    expect(result).toEqual({
      ok: true,
      result: {
        nodes: [{ nodeId: "node-1", type: "text", fields: { content: "Launch brief" } }],
      },
    });
  });

  it("allows only one editable Instagram post package per run", async () => {
    const state = createInstagramHarnessToolState();
    const created: string[] = [];
    const ops = {
      readConnectedContext: async () => ({ nodes: [] }),
      createInstagramPostPackage: async () => {
        created.push("package");
        return {
          nodeId: "mockup-1",
          fieldNodeIds: {
            caption: "caption-1",
            hashtags: "hashtags-1",
            cta: "cta-1",
            altText: "alt-1",
            visualPrompt: "prompt-1",
          },
        };
      },
    };

    await expect(
      executeInstagramHarnessTool({
        state,
        ops,
        call: {
          id: "call-1",
          name: "create_instagram_post_package",
          arguments: {
            username: "lemonspace",
            caption: "Build campaigns visually.",
            hashtags: ["#lemonspace"],
            cta: "Try it.",
            altText: "Canvas workspace with generated assets.",
            visualPrompt: "Create a polished square product mockup.",
          },
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: {
        nodeId: "mockup-1",
        fieldNodeIds: {
          caption: "caption-1",
          hashtags: "hashtags-1",
          cta: "cta-1",
          altText: "alt-1",
          visualPrompt: "prompt-1",
        },
      },
    });

    await expect(
      executeInstagramHarnessTool({
        state,
        ops,
        call: {
          id: "call-2",
          name: "create_instagram_post_package",
          arguments: {
            username: "lemonspace",
            caption: "Second post",
            hashtags: ["#second"],
            cta: "Try it.",
            altText: "Second visual.",
            visualPrompt: "Second prompt.",
          },
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "create_instagram_post_package may only be called once per run",
    });

    expect(created).toEqual(["package"]);
  });

  it("builds editable field artifacts and mockup bindings from a package", () => {
    const artifacts = buildInstagramPostPackageArtifacts({
      agentNodeId: "agent-1",
      runId: "run-1",
      data: {
        username: "lemonspace",
        caption: "Make your canvas campaign-ready.",
        hashtags: ["#lemonspace", "canvas"],
        cta: "Open the canvas.",
        altText: "A campaign canvas with image and copy nodes.",
        visualPrompt: "Generate a clean square product post.",
        imageUrl: "https://example.com/post.png",
        selectedImageNodeId: "image-1",
        sourceNodeIds: ["image-1", "brief-1"],
        syntheticPreviewFields: ["likesCount", "location"],
      },
    });

    expect(artifacts.fieldNodes.map((node) => node.role)).toEqual([
      "caption",
      "hashtags",
      "cta",
      "altText",
      "visualPrompt",
    ]);
    expect(artifacts.fieldNodes.map((node) => node.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "prompt",
    ]);
    expect(artifacts.mockupNode.type).toBe("instagram-post-mockup");
    expect(artifacts.mockupBindings.map((binding) => binding.targetHandle)).toEqual([
      "caption-in",
      "hashtags-in",
      "cta-in",
      "alt-text-in",
      "visual-prompt-in",
    ]);
    expect(artifacts.visualBinding).toEqual({
      sourceNodeId: "image-1",
      targetHandle: "visual-in",
    });
  });
});
