import { describe, expect, it } from "vitest";

import {
  createInstagramHarnessToolState,
  executeInstagramHarnessTool,
  INSTAGRAM_AGENT_TOOLS,
  resolveInstagramOutputArgs,
} from "@/convex/agent_instagram_harness";

describe("instagram agent harness tools", () => {
  it("registers only the bounded Instagram V1 tool set", () => {
    expect(INSTAGRAM_AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      "read_connected_context",
      "create_instagram_output",
      "create_text_node",
      "create_prompt_node",
    ]);
  });

  it("falls back to the first connected image URL when the model omits imageUrl", () => {
    const resolved = resolveInstagramOutputArgs(
      {
        username: "lemonspace",
        caption: "A connected-image post",
        hashtags: ["#lemonspace"],
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
        createInstagramOutput: async () => ({ nodeId: "unused" }),
        createTextNode: async () => ({ nodeId: "unused" }),
        createPromptNode: async () => ({ nodeId: "unused" }),
      },
    });

    expect(result).toEqual({
      ok: true,
      result: {
        nodes: [{ nodeId: "node-1", type: "text", fields: { content: "Launch brief" } }],
      },
    });
  });

  it("allows only one Instagram output, one text node, and one prompt node per run", async () => {
    const state = createInstagramHarnessToolState();
    const created: string[] = [];
    const ops = {
      readConnectedContext: async () => ({ nodes: [] }),
      createInstagramOutput: async () => {
        created.push("instagram");
        return { nodeId: "instagram-output-1" };
      },
      createTextNode: async () => {
        created.push("text");
        return { nodeId: "text-1" };
      },
      createPromptNode: async () => {
        created.push("prompt");
        return { nodeId: "prompt-1" };
      },
    };

    await expect(
      executeInstagramHarnessTool({
        state,
        ops,
        call: {
          id: "call-1",
          name: "create_instagram_output",
          arguments: {
            username: "lemonspace",
            caption: "Build campaigns visually.",
            hashtags: ["#lemonspace"],
          },
        },
      }),
    ).resolves.toEqual({
      ok: true,
      result: { nodeId: "instagram-output-1" },
    });

    await expect(
      executeInstagramHarnessTool({
        state,
        ops,
        call: {
          id: "call-2",
          name: "create_instagram_output",
          arguments: {
            username: "lemonspace",
            caption: "Second post",
            hashtags: ["#second"],
          },
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "create_instagram_output may only be called once per run",
    });

    await executeInstagramHarnessTool({
      state,
      ops,
      call: {
        id: "call-3",
        name: "create_text_node",
        arguments: { content: "Caption notes" },
      },
    });
    await executeInstagramHarnessTool({
      state,
      ops,
      call: {
        id: "call-4",
        name: "create_prompt_node",
        arguments: { prompt: "Create a bright product mockup" },
      },
    });

    expect(created).toEqual(["instagram", "text", "prompt"]);
  });
});
