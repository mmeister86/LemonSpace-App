import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateImageViaOpenRouter } from "@/convex/openrouter";

function createOpenRouterSuccessResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => ({
      choices: [
        {
          message: {
            images: [
              {
                image_url: {
                  url: "data:image/png;base64,ZmFrZV9pbWFnZQ==",
                },
              },
            ],
          },
        },
      ],
    })),
  } as unknown as Response;
}

async function runRequestAndReadModalities(fetchMock: ReturnType<typeof vi.fn>, model: string) {
  fetchMock.mockResolvedValueOnce(createOpenRouterSuccessResponse());

  await generateImageViaOpenRouter("test-api-key", {
    model,
    prompt: "draw a fox",
  });

  const firstCallArgs = fetchMock.mock.calls[0];
  const init = firstCallArgs?.[1] as RequestInit | undefined;
  const bodyRaw = init?.body;
  const bodyText = typeof bodyRaw === "string" ? bodyRaw : "";
  const body = JSON.parse(bodyText) as { modalities?: string[] };
  return body.modalities;
}

async function runRequestAndReadBody(
  fetchMock: ReturnType<typeof vi.fn>,
  params: Parameters<typeof generateImageViaOpenRouter>[1],
) {
  fetchMock.mockResolvedValueOnce(createOpenRouterSuccessResponse());

  await generateImageViaOpenRouter("test-api-key", params);

  const firstCallArgs = fetchMock.mock.calls[0];
  const init = firstCallArgs?.[1] as RequestInit | undefined;
  const bodyRaw = init?.body;
  const bodyText = typeof bodyRaw === "string" ? bodyRaw : "";
  return JSON.parse(bodyText) as {
    image_config?: { aspect_ratio?: string };
    messages?: Array<{
      role: string;
      content:
        | string
        | Array<{
            type: string;
            text?: string;
            image_url?: { url?: string };
          }>;
    }>;
    modalities?: string[];
  };
}

describe("openrouter request body", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses image+text modalities for Gemini Flash Image", async () => {
    await expect(
      runRequestAndReadModalities(fetchMock, "google/gemini-2.5-flash-image"),
    ).resolves.toEqual(["image", "text"]);
  });

  it("uses image-only modalities for text+image->image models", async () => {
    const imageOnlyModels = [
      "black-forest-labs/flux.2-klein-4b",
      "bytedance-seed/seedream-4.5",
      "sourceful/riverflow-v2-fast",
      "sourceful/riverflow-v2-pro",
    ] as const;

    for (const model of imageOnlyModels) {
      await expect(runRequestAndReadModalities(fetchMock, model)).resolves.toEqual(["image"]);
    }
  });

  it("sends prompt text before all reference image_url parts", async () => {
    const body = await runRequestAndReadBody(fetchMock, {
      model: "google/gemini-2.5-flash-image",
      prompt: "Combine the product with the lighting style.",
      aspectRatio: "16:9",
      referenceImages: [
        {
          sourceNodeId: "image-1",
          sourceType: "image",
          label: "Ref 1",
          imageUrl: "https://cdn.example.com/product.png",
        },
        {
          sourceNodeId: "render-1",
          sourceType: "render",
          label: "Ref 2",
          imageUrl: "data:image/png;base64,cmVuZGVy",
          renderPipelineHash: "render-hash",
        },
      ],
    });

    expect(body.modalities).toEqual(["image", "text"]);
    expect(body.image_config?.aspect_ratio).toBe("16:9");
    const content = body.messages?.[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) {
      throw new Error("Expected multipart content");
    }

    expect(content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Ref 1"),
    });
    expect(content[0]?.text).toContain("Ref 2");
    expect(content.slice(1).map((part) => part.image_url?.url)).toEqual([
      "https://cdn.example.com/product.png",
      "data:image/png;base64,cmVuZGVy",
    ]);
  });
});
