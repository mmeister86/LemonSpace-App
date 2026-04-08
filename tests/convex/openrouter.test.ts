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
});
