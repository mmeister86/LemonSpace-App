import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVideoTask,
  downloadVideoAsBlob,
  getVideoTaskStatus,
} from "@/convex/freepik";

type MockResponseInit = {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  blob?: Blob;
};

function createMockResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? "",
    json: vi.fn(async () => init.json),
    text: vi.fn(async () => init.text ?? JSON.stringify(init.json ?? {})),
    blob: vi.fn(async () => init.blob ?? new Blob([])),
    headers: new Headers(),
  } as unknown as Response;
}

describe("freepik video client", () => {
  const originalApiKey = process.env.FREEPIK_API_KEY;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.FREEPIK_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.FREEPIK_API_KEY = originalApiKey;
  });

  it("creates a video task", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: { data: { task_id: "task_123" } },
      }),
    );

    const result = await createVideoTask({
      endpoint: "/v1/ai/video/seedance-1-5-pro-1080p",
      prompt: "A cinematic city timelapse",
      durationSeconds: 5,
    });

    expect(result.task_id).toBe("task_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts root-level task_id responses for current video endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: { task_id: "task_root", status: "CREATED" },
      }),
    );

    const result = await createVideoTask({
      endpoint: "/v1/ai/image-to-video/kling-v2-1-std",
      prompt: "A cinematic city timelapse",
      durationSeconds: 5,
    });

    expect(result.task_id).toBe("task_root");
  });

  it("reads completed video task status", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        json: {
          data: {
            status: "COMPLETED",
            generated: [{ url: "https://cdn.example.com/video.mp4" }],
          },
        },
      }),
    );

    const result = await getVideoTaskStatus({
      taskId: "task_123",
      statusEndpointPath: "/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.generated?.[0]?.url).toBe("https://cdn.example.com/video.mp4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.freepik.com/v1/ai/text-to-video/wan-2-5-t2v-720p/task_123",
      expect.any(Object),
    );
  });

  it("downloads completed video as blob", async () => {
    const blob = new Blob(["video-bytes"], { type: "video/mp4" });
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        blob,
      }),
    );

    const result = await downloadVideoAsBlob("https://cdn.example.com/video.mp4");

    expect(result.type).toBe("video/mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps unauthorized responses to model_unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: { message: "invalid api key" },
      }),
    );

    await expect(
      createVideoTask({
        endpoint: "/v1/ai/video/seedance-1-5-pro-1080p",
        prompt: "A cinematic city timelapse",
        durationSeconds: 5,
      }),
    ).rejects.toMatchObject({
      source: "freepik",
      code: "model_unavailable",
      status: 401,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 503 and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: { message: "temporary outage" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          json: { data: { task_id: "task_after_retry" } },
        }),
      );

    const result = await createVideoTask({
      endpoint: "/v1/ai/video/seedance-1-5-pro-1080p",
      prompt: "A cinematic city timelapse",
      durationSeconds: 10,
    });

    expect(result.task_id).toBe("task_after_retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats task 404 during polling as retryable transient provider state", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: { message: "Not found" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: { message: "Not found" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: { message: "Not found" },
        }),
      );

    await expect(
      getVideoTaskStatus({
        taskId: "task_404",
        statusEndpointPath: "/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}",
      }),
    ).rejects.toMatchObject({
      source: "freepik",
      code: "transient",
      status: 404,
      retryable: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
