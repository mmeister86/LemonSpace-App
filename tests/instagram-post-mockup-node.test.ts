// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CanvasGraphProvider,
  useCanvasGraphPreviewOverrides,
} from "@/components/canvas/canvas-graph-context";

const previewQualityMocks = vi.hoisted(() => ({
  usePipelinePreview: vi.fn(() => ({
    canvasRef: { current: null },
    hasSource: true,
    isRendering: false,
    previewAspectRatio: 0.8,
    error: null,
  })),
  useZoomAwarePreviewQuality: vi.fn(() => ({
    previewQuality: "medium",
    sourceQuality: "preview",
    zoom: 1,
  })),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, id }: { type: string; id?: string }) =>
    React.createElement("div", {
      "data-handle-type": type,
      "data-handle-id": id,
    }),
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

vi.mock("@/components/canvas/nodes/use-render-node-preview", () => ({
  useRenderNodePreview: () => ({
    hasSource: true,
    isAlphaBearing: false,
    targetAspectRatio: 1,
    preview: {
      canvasRef: { current: null },
      previewAspectRatio: 1,
      isRendering: false,
      error: null,
    },
  }),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: previewQualityMocks.usePipelinePreview,
}));

vi.mock("@/components/canvas/use-zoom-aware-preview-quality", () => ({
  useZoomAwarePreviewQuality: previewQualityMocks.useZoomAwarePreviewQuality,
}));

import InstagramPostMockupNode from "@/components/canvas/nodes/instagram-post-mockup-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CanvasGraphProviderProps = React.ComponentProps<typeof CanvasGraphProvider>;
const TestCanvasGraphProvider = CanvasGraphProvider as React.ComponentType<
  Omit<CanvasGraphProviderProps, "children"> & { children?: React.ReactNode }
>;

function renderMockup(args: {
  caption: string;
  visualPrompt: string;
  root: Root;
  visual?: { id: string; type: string; data: Record<string, unknown> };
  extraNodes?: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  extraEdges?: Array<{ source: string; target: string; targetHandle?: string }>;
  previewOverride?: { nodeId: string; data: Record<string, unknown> } | null;
  snapshotImageUrl?: string;
  syntheticPreviewFields?: string[];
}) {
  const visual = args.visual ?? {
    id: "image-1",
    type: "image",
    data: { url: "https://example.com/post.png" },
  };
  const nodes = [
    {
      id: "mockup-1",
      type: "instagram-post-mockup",
      data: {
        title: "Instagram post mockup",
        syntheticPreviewFields:
          args.syntheticPreviewFields ??
          (args.visual?.type === "render" || args.visual?.type === "crop"
            ? ["imageUrl"]
            : []),
        snapshot: {
          username: "lemonspace",
          caption: "Fallback caption",
          hashtags: ["#fallback"],
          imageUrl:
            args.snapshotImageUrl ??
            (args.visual?.type === "render" || args.visual?.type === "crop"
              ? "https://example.com/synthetic-preview.png"
              : undefined),
        },
      },
    },
    { id: "caption-1", type: "text", data: { content: args.caption } },
    { id: "hashtags-1", type: "text", data: { content: "#lemonspace #canvas" } },
    { id: "prompt-1", type: "prompt", data: { prompt: args.visualPrompt } },
    visual,
    ...(args.extraNodes ?? []),
  ];
  const edges = [
    { source: "caption-1", target: "mockup-1", targetHandle: "caption-in" },
    { source: "hashtags-1", target: "mockup-1", targetHandle: "hashtags-in" },
    { source: "prompt-1", target: "mockup-1", targetHandle: "visual-prompt-in" },
    { source: visual.id, target: "mockup-1", targetHandle: "visual-in" },
    ...(args.extraEdges ?? []),
  ];

  args.root.render(
    React.createElement(
      TestCanvasGraphProvider,
      {
        nodes,
        edges,
      },
      args.previewOverride ? (
        React.createElement(PreviewOverrideSetter, {
          nodeId: args.previewOverride.nodeId,
          data: args.previewOverride.data,
        })
      ) : null,
      React.createElement(InstagramPostMockupNode, {
        id: "mockup-1",
        selected: false,
        dragging: false,
        draggable: true,
        selectable: true,
        deletable: true,
        zIndex: 1,
        isConnectable: true,
        type: "instagram-post-mockup",
        data: nodes[0].data,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      }),
    ),
  );
}

function PreviewOverrideSetter({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const { setPreviewNodeDataOverride } = useCanvasGraphPreviewOverrides();

  React.useEffect(() => {
    setPreviewNodeDataOverride(nodeId, data);
  }, [data, nodeId, setPreviewNodeDataOverride]);

  return null;
}

async function advancePublishStep(count = 1) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      vi.advanceTimersByTime(650);
    });
  }
}

describe("InstagramPostMockupNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    previewQualityMocks.usePipelinePreview.mockClear();
    previewQualityMocks.usePipelinePreview.mockImplementation(() => ({
      canvasRef: { current: null },
      hasSource: true,
      isRendering: false,
      previewAspectRatio: 0.8,
      error: null,
    }));
    previewQualityMocks.useZoomAwarePreviewQuality.mockClear();
    previewQualityMocks.useZoomAwarePreviewQuality.mockImplementation(() => ({
      previewQuality: "medium",
      sourceQuality: "preview",
      zoom: 1,
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    vi.useRealTimers();
  });

  it("updates the preview from edited connected field node data", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "First editable caption",
        visualPrompt: "First visual prompt",
        root: testRoot,
      });
    });
    expect(container.textContent).toContain("First editable caption");
    expect(container.textContent).toContain("First visual prompt");
    expect(container.textContent).not.toContain("Updated editable caption");
    expect(container.textContent).not.toContain("Updated visual prompt");

    await act(async () => {
      renderMockup({
        caption: "Updated editable caption",
        visualPrompt: "Updated visual prompt",
        root: testRoot,
      });
    });
    expect(container.textContent).toContain("Updated editable caption");
    expect(container.textContent).toContain("Updated visual prompt");
    expect(container.textContent).not.toContain("First editable caption");
    expect(container.textContent).not.toContain("First visual prompt");
  });

  it("renders a live render preview slot when the visual input is a render node without URL", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Render-backed caption",
        visualPrompt: "Render-backed visual prompt",
        root: testRoot,
        visual: {
          id: "render-1",
          type: "render",
          data: { format: "png", outputResolution: "original" },
        },
      });
    });

    expect(container.querySelector('[data-testid="render-preview-frame"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://example.com/synthetic-preview.png"]')).toBeNull();
  });

  it("renders a live crop preview slot when the visual input is a crop node without URL", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Crop-backed caption",
        visualPrompt: "Crop-backed visual prompt",
        root: testRoot,
        visual: {
          id: "crop-1",
          type: "crop",
          data: {
            crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
        extraNodes: [
          {
            id: "source-image-1",
            type: "image",
            data: {
              url: "https://example.com/full-source.png",
              previewUrl: "https://example.com/preview-source.png",
            },
          },
        ],
        extraEdges: [{ source: "source-image-1", target: "crop-1" }],
      });
    });

    const imageArea = container.querySelector('[data-testid="instagram-post-image-area"]');
    expect(imageArea?.className).toContain("aspect-[4/5]");
    expect(imageArea?.className).not.toContain("aspect-square");
    const previewFrame = container.querySelector(
      '[data-testid="render-preview-frame"]',
    ) as HTMLElement | null;
    expect(previewFrame).not.toBeNull();
    expect(previewFrame?.style.width).toBe("100%");
    expect(previewFrame?.style.height).toBe("100%");
    expect(container.querySelector('img[src="https://example.com/synthetic-preview.png"]')).toBeNull();
  });

  it("prefers the live crop preview slot over a stored snapshot image URL", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Crop-backed caption",
        visualPrompt: "Crop-backed visual prompt",
        root: testRoot,
        visual: {
          id: "crop-1",
          type: "crop",
          data: {
            crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
        snapshotImageUrl: "https://example.com/stored-snapshot.png",
        syntheticPreviewFields: [],
        extraNodes: [
          {
            id: "source-image-1",
            type: "image",
            data: { url: "https://example.com/full-source.png" },
          },
        ],
        extraEdges: [{ source: "source-image-1", target: "crop-1" }],
      });
    });

    expect(container.querySelector('[data-testid="render-preview-frame"]')).not.toBeNull();
    expect(container.querySelector('img[src="https://example.com/stored-snapshot.png"]')).toBeNull();
  });

  it("uses crop output dimensions for the live crop preview quality bucket", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;
    previewQualityMocks.useZoomAwarePreviewQuality.mockReturnValue({
      previewQuality: "high",
      sourceQuality: "full",
      zoom: 3,
    });

    await act(async () => {
      renderMockup({
        caption: "High-resolution crop caption",
        visualPrompt: "High-resolution crop prompt",
        root: testRoot,
        visual: {
          id: "crop-1",
          type: "crop",
          data: {
            crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
      });
    });

    expect(previewQualityMocks.useZoomAwarePreviewQuality).toHaveBeenCalledWith({
      width: 1080,
      height: 1350,
      maxDevicePixelRatio: 2,
    });
    expect(previewQualityMocks.usePipelinePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        previewQuality: "high",
      }),
    );
  });

  it("updates the live crop preview when crop node local data changes", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Crop override caption",
        visualPrompt: "Crop override prompt",
        root: testRoot,
        visual: {
          id: "crop-1",
          type: "crop",
          data: {
            crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
        extraNodes: [
          {
            id: "source-image-1",
            type: "image",
            data: { url: "https://example.com/full-source.png" },
          },
        ],
        extraEdges: [{ source: "source-image-1", target: "crop-1" }],
      });
    });

    await act(async () => {
      renderMockup({
        caption: "Crop override caption",
        visualPrompt: "Crop override prompt",
        root: testRoot,
        visual: {
          id: "crop-1",
          type: "crop",
          data: {
            crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
        extraNodes: [
          {
            id: "source-image-1",
            type: "image",
            data: { url: "https://example.com/full-source.png" },
          },
        ],
        extraEdges: [{ source: "source-image-1", target: "crop-1" }],
        previewOverride: {
          nodeId: "crop-1",
          data: {
            crop: { x: 0.2, y: 0.15, width: 0.5, height: 0.6 },
            resize: {
              mode: "custom",
              width: 1080,
              height: 1350,
              fit: "cover",
              keepAspect: true,
            },
          },
        },
      });
    });

    expect(previewQualityMocks.usePipelinePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            nodeId: "crop-1",
            params: expect.objectContaining({
              crop: { x: 0.2, y: 0.15, width: 0.5, height: 0.6 },
            }),
          }),
        ]),
      }),
    );
  });

  it("simulates sending the mockup to Instagram and auto-closes after success", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    vi.useFakeTimers();
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Ready to publish",
        visualPrompt: "Publish-ready visual prompt",
        root: testRoot,
      });
    });

    const sendButton = container.querySelector(
      '[data-testid="instagram-post-mockup-send-button"]',
    ) as HTMLButtonElement | null;
    expect(sendButton).not.toBeNull();

    await act(async () => {
      sendButton?.click();
    });

    expect(document.body.textContent).toContain("Verbinde mit Instagram...");
    expect(document.body.textContent).toContain("12%");

    const expectedStages = [
      ["Prüfe Feed-Ziel...", "28%"],
      ["Lade Bild hoch...", "46%"],
      ["Erstelle Text...", "64%"],
      ["Setze Hashtags und Alt-Text...", "82%"],
      ["Veröffentliche im Feed...", "94%"],
      ["Beitrag veröffentlicht.", "100%"],
    ] as const;

    for (const [label, progress] of expectedStages) {
      await advancePublishStep();
      expect(document.body.textContent).toContain(label);
      expect(document.body.textContent).toContain(progress);
    }

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(document.body.textContent).not.toContain("Beitrag veröffentlicht.");
  });

  it("resets the publish simulation after manual close", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    vi.useFakeTimers();
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "Reset publish",
        visualPrompt: "Reset visual prompt",
        root: testRoot,
      });
    });

    const sendButton = container.querySelector(
      '[data-testid="instagram-post-mockup-send-button"]',
    ) as HTMLButtonElement | null;
    expect(sendButton).not.toBeNull();

    await act(async () => {
      sendButton?.click();
    });
    await advancePublishStep();
    expect(document.body.textContent).toContain("Prüfe Feed-Ziel...");

    const closeButton = document.body.querySelector(
      '[data-slot="dialog-close"]',
    ) as HTMLButtonElement | null;
    expect(closeButton).not.toBeNull();

    await act(async () => {
      closeButton?.click();
    });
    expect(document.body.textContent).not.toContain("Prüfe Feed-Ziel...");

    await act(async () => {
      sendButton?.click();
    });
    expect(document.body.textContent).toContain("Verbinde mit Instagram...");
    expect(document.body.textContent).toContain("12%");
  });
});
