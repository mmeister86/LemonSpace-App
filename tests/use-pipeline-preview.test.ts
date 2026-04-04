// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyHistogram } from "@/lib/image-pipeline/histogram";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const workerClientMocks = vi.hoisted(() => ({
  renderPreviewWithWorkerFallback: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/worker-client", () => ({
  isPipelineAbortError: () => false,
  renderPreviewWithWorkerFallback: workerClientMocks.renderPreviewWithWorkerFallback,
}));

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";

function PreviewHarness({
  sourceUrl,
  steps,
}: {
  sourceUrl: string | null;
  steps: PipelineStep[];
}) {
  const { canvasRef } = usePipelinePreview({
    sourceUrl,
    steps,
    nodeWidth: 320,
  });

  return createElement("canvas", { ref: canvasRef });
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePipelinePreview", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    workerClientMocks.renderPreviewWithWorkerFallback.mockReset();
    workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValue({
      width: 120,
      height: 80,
      imageData: { data: new Uint8ClampedArray(120 * 80 * 4) },
      histogram: emptyHistogram(),
    });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("does not restart preview rendering when only step references change", async () => {
    const stepsA: PipelineStep[] = [
      {
        nodeId: "light-1",
        type: "light-adjust",
        params: { brightness: 10 },
      },
    ];

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: stepsA,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    const stepsB: PipelineStep[] = [
      {
        nodeId: "light-1",
        type: "light-adjust",
        params: { brightness: 10 },
      },
    ];

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: stepsB,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
  });
});
