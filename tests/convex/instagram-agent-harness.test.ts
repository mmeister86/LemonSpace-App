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

  it("drops synthetic image URLs instead of storing them as real preview images", () => {
    const resolved = resolveInstagramPostPackageArgs(
      {
        username: "lemonspace",
        profileImageUrl: "synthetic-profile-image",
        caption: "A synthetic preview post",
        hashtags: ["#lemonspace"],
        cta: "Try it.",
        altText: "A product screenshot.",
        visualPrompt: "Improve the screenshot lighting.",
        imageUrl: "https://example.com/synthetic-lemonspace-preview.png",
        selectedImageNodeId: "render-1",
        syntheticPreviewFields: ["imageUrl", "profileImageUrl", "likesCount"],
      },
      {
        nodes: [
          {
            nodeId: "render-1",
            type: "render",
            fields: {
              format: "png",
            },
          },
        ],
      },
    );

    expect(resolved).not.toHaveProperty("imageUrl");
    expect(resolved).not.toHaveProperty("profileImageUrl");
    expect(resolved.selectedImageNodeId).toBe("render-1");
    expect(resolved.syntheticPreviewFields).toEqual([
      "imageUrl",
      "profileImageUrl",
      "likesCount",
    ]);
  });

  it("prefers a connected render node over a lower-priority selected image node", () => {
    const resolved = resolveInstagramPostPackageArgs(
      {
        username: "lemonspace",
        caption: "A render-backed post",
        hashtags: ["#lemonspace"],
        cta: "Open it.",
        altText: "Rendered campaign visual.",
        visualPrompt: "Use the final render.",
        selectedImageNodeId: "logo-image",
        syntheticPreviewFields: ["imageUrl"],
      },
      {
        nodes: [
          {
            nodeId: "logo-image",
            type: "image",
            fields: {
              url: "https://cdn.example.com/lemonspace-logo.png",
              width: 640,
              height: 180,
            },
          },
          {
            nodeId: "render-1",
            type: "render",
            fields: {
              format: "png",
              width: 1200,
              height: 900,
            },
          },
        ],
      },
    );

    expect(resolved.selectedImageNodeId).toBe("render-1");
    expect(resolved.sourceNodeIds).toEqual(["render-1"]);
    expect(resolved.selectedImageWidth).toBe(1200);
    expect(resolved.selectedImageHeight).toBe(900);
    expect(resolved).not.toHaveProperty("imageUrl");
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
        selectedImageWidth: 1024,
        selectedImageHeight: 1024,
        sourceNodeIds: ["image-1", "brief-1"],
        syntheticPreviewFields: ["likesCount", "location"],
      },
    });

    expect(artifacts.fieldNodes.map((node) => node.role)).toEqual([
      "caption",
      "hashtags",
      "cta",
      "altText",
    ]);
    expect(artifacts.fieldNodes.map((node) => node.type)).toEqual([
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(artifacts.fieldNodes.some((node) => node.role === "visualPrompt")).toBe(false);
    expect(artifacts.mockupNode.type).toBe("instagram-post-mockup");
    expect(artifacts.mockupBindings.map((binding) => binding.targetHandle)).toEqual([
      "caption-in",
      "hashtags-in",
      "cta-in",
      "alt-text-in",
    ]);
    expect(artifacts.cropNode).toEqual({
      type: "crop",
      data: {
        agentNodeId: "agent-1",
        runId: "run-1",
        sourceNodeIds: ["image-1", "brief-1"],
        instagramFieldRole: "visual-crop",
        crop: {
          x: 0.1,
          y: 0,
          width: 0.8,
          height: 1,
        },
        resize: {
          mode: "custom",
          width: 1080,
          height: 1350,
          fit: "cover",
          keepAspect: true,
        },
      },
    });
    expect(artifacts.cropBinding).toEqual({
      sourceNodeId: "image-1",
    });
    expect(artifacts.visualBinding).toEqual({
      source: "crop",
      targetHandle: "visual-in",
    });
  });

  it("does not create a crop artifact when no ready visual is selected", () => {
    const artifacts = buildInstagramPostPackageArtifacts({
      agentNodeId: "agent-1",
      runId: "run-1",
      data: {
        username: "lemonspace",
        caption: "Text-only post.",
        hashtags: ["#lemonspace"],
        cta: "Open the canvas.",
        altText: "Canvas post.",
        visualPrompt: "Optional visual guidance.",
        sourceNodeIds: ["brief-1"],
      },
    });

    expect(artifacts.cropNode).toBeNull();
    expect(artifacts.cropBinding).toBeNull();
    expect(artifacts.visualBinding).toBeNull();
    expect(artifacts.fieldNodes.map((node) => node.role)).toEqual([
      "caption",
      "hashtags",
      "cta",
      "altText",
    ]);
    expect(artifacts.mockupBindings.map((binding) => binding.targetHandle)).toEqual([
      "caption-in",
      "hashtags-in",
      "cta-in",
      "alt-text-in",
    ]);
  });

  it("centers a 4:5 crop from portrait source dimensions", () => {
    const artifacts = buildInstagramPostPackageArtifacts({
      agentNodeId: "agent-1",
      runId: "run-1",
      data: {
        caption: "Portrait source.",
        hashtags: ["#lemonspace"],
        cta: "Open it.",
        altText: "Portrait visual.",
        visualPrompt: "Optional visual guidance.",
        selectedImageNodeId: "image-1",
        selectedImageWidth: 1200,
        selectedImageHeight: 1800,
        sourceNodeIds: ["image-1"],
      },
    });

    expect(artifacts.cropNode?.data.crop).toEqual({
      x: 0,
      y: 0.083333,
      width: 1,
      height: 0.833333,
    });
  });
});
