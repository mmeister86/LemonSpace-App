// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  usePipelinePreview: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    status: { isOffline: false },
  }),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: mocks.usePipelinePreview,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

import CropNode from "@/components/canvas/nodes/crop-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestNode = {
  id: string;
  type: string;
  data?: unknown;
};

type TestEdge = {
  id: string;
  source: string;
  target: string;
};

function buildCropNodeProps(overrides?: Partial<React.ComponentProps<typeof CropNode>>) {
  return {
    id: "crop-1",
    data: {
      crop: {
        x: 0.25,
        y: 0.1,
        width: 0.5,
        height: 0.5,
      },
      resize: {
        mode: "source",
        fit: "cover",
        keepAspect: true,
      },
    },
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    type: "crop",
    width: 340,
    height: 620,
    sourcePosition: undefined,
    targetPosition: undefined,
    ...overrides,
  } as React.ComponentProps<typeof CropNode>;
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  init: { clientX: number; clientY: number; pointerId?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  target.dispatchEvent(event);
}

describe("CropNode preview steps", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    mocks.usePipelinePreview.mockReset();
    mocks.usePipelinePreview.mockReturnValue({
      canvasRef: { current: null },
      hasSource: true,
      isRendering: false,
      previewAspectRatio: 1,
      histogram: null,
      error: null,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    root = null;
    container = null;
  });

  async function renderCropNode(args: {
    nodes: TestNode[];
    edges: TestEdge[];
    props?: Partial<React.ComponentProps<typeof CropNode>>;
  }) {
    await act(async () => {
      root?.render(
        <CanvasGraphProvider nodes={args.nodes} edges={args.edges}>
          <CropNode {...buildCropNodeProps(args.props)} />
        </CanvasGraphProvider>,
      );
    });
  }

  function lastPreviewSteps(): PipelineStep[] {
    const lastCall = mocks.usePipelinePreview.mock.calls.at(-1);
    const options = lastCall?.[0] as { steps?: PipelineStep[] } | undefined;
    return options?.steps ?? [];
  }

  function mockPreviewRect(preview: HTMLDivElement) {
    return vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
  }

  it("renders a direct source crop preview without applying its own crop step", async () => {
    await renderCropNode({
      nodes: [
        { id: "image-1", type: "image", data: { url: "https://cdn.example.com/source.png" } },
        { id: "crop-1", type: "crop", data: buildCropNodeProps().data },
      ],
      edges: [{ id: "edge-1", source: "image-1", target: "crop-1" }],
    });

    expect(lastPreviewSteps()).toEqual([]);
  });

  it("keeps upstream adjustment steps but excludes the active crop step", async () => {
    await renderCropNode({
      nodes: [
        { id: "image-1", type: "image", data: { url: "https://cdn.example.com/source.png" } },
        { id: "curves-1", type: "curves", data: { exposure: 0.2 } },
        { id: "crop-1", type: "crop", data: buildCropNodeProps().data },
      ],
      edges: [
        { id: "edge-1", source: "image-1", target: "curves-1" },
        { id: "edge-2", source: "curves-1", target: "crop-1" },
      ],
    });

    expect(lastPreviewSteps()).toEqual([
      {
        nodeId: "curves-1",
        type: "curves",
        params: { exposure: 0.2 },
      },
    ]);
  });

  it("moves only the crop grid while keeping preview steps independent of crop data", async () => {
    await renderCropNode({
      nodes: [
        { id: "image-1", type: "image", data: { url: "https://cdn.example.com/source.png" } },
        { id: "crop-1", type: "crop", data: buildCropNodeProps().data },
      ],
      edges: [{ id: "edge-1", source: "image-1", target: "crop-1" }],
    });

    const preview = container?.querySelector('[data-testid="crop-preview-area"]');
    const overlay = container?.querySelector('[data-testid="crop-overlay"]');
    expect(preview).toBeInstanceOf(HTMLDivElement);
    expect(overlay).toBeInstanceOf(HTMLDivElement);

    const rectSpy = mockPreviewRect(preview as HTMLDivElement);
    await act(async () => {
      dispatchPointerEvent(overlay as HTMLDivElement, "pointerdown", {
        clientX: 10,
        clientY: 10,
      });
      dispatchPointerEvent(overlay as HTMLDivElement, "pointermove", {
        clientX: 30,
        clientY: 20,
      });
      dispatchPointerEvent(overlay as HTMLDivElement, "pointerup", {
        clientX: 30,
        clientY: 20,
      });
    });

    expect((overlay as HTMLDivElement).style.left).toBe("35%");
    expect((overlay as HTMLDivElement).style.top).toBe("20%");
    expect(lastPreviewSteps()).toEqual([]);
    rectSpy.mockRestore();
  });
});
