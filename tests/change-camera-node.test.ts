// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({
    getNode: () => ({ position: { x: 0, y: 0 }, measured: { width: 320 } }),
  }),
  useStore: (selector: (store: { edges: unknown[]; nodes: unknown[] }) => unknown) =>
    selector({
      edges: [{ source: "image-1", target: "camera-1" }],
      nodes: [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/source.jpg",
            width: 1200,
            height: 800,
          },
        },
      ],
    }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(async () => ({ queued: true })),
  useMutation: () => vi.fn(async () => "https://upload.test"),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      "labels.change-camera": "Change Camera",
      "descriptions.change-camera": "Changes camera angle, tilt, and zoom with Freepik.",
      "controls.horizontalAngle": "Horizontal",
      "controls.verticalAngle": "Vertical",
      "controls.zoom": "Zoom",
      "controls.format": "Format",
      "controls.seed": "Seed",
      "controls.seedPlaceholder": "Random",
      runButton: "Run",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeConnectedFromSource: vi.fn(async () => "output-1"),
  }),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: vi.fn(async () => undefined),
    status: { isOffline: false },
  }),
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

import ChangeCameraNode from "@/components/canvas/nodes/change-camera-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function parseStagePoint(point: string | undefined): { x: number; y: number } {
  const [x, y] = (point ?? "").split(",").map(Number);
  return { x, y };
}

describe("ChangeCameraNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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

  it("renders localized camera controls", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ChangeCameraNode, {
          id: "camera-1",
          data: {
            canvasId: "canvas-1",
            parameters: {
              type: "change-camera",
              horizontalAngle: 45,
              verticalAngle: 15,
              zoom: 7,
              outputFormat: "jpeg",
              seed: 42,
            },
          },
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "change-camera",
          width: 320,
          height: 440,
        } as React.ComponentProps<typeof ChangeCameraNode>),
      );
    });

    expect(container?.textContent).toContain("Change Camera");
    expect(container?.textContent).toContain("Horizontal");
    expect(container?.textContent).toContain("Vertical");
    expect(container?.textContent).toContain("Zoom");
    expect(container?.textContent).toContain("Seed");
    expect(container?.textContent).toContain("Run");
  });

  it("renders a live camera stage with the connected source image", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ChangeCameraNode, {
          id: "camera-1",
          data: {
            canvasId: "canvas-1",
            parameters: {
              type: "change-camera",
              horizontalAngle: 45,
              verticalAngle: 15,
              zoom: 7,
              outputFormat: "jpeg",
            },
          },
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "change-camera",
          width: 320,
          height: 440,
        } as React.ComponentProps<typeof ChangeCameraNode>),
      );
    });

    const stage = container?.querySelector<HTMLElement>(
      '[data-testid="change-camera-stage"]',
    );
    expect(stage).not.toBeNull();
    expect(stage?.dataset.horizontalAngle).toBe("45");
    expect(stage?.dataset.verticalAngle).toBe("15");
    expect(stage?.dataset.zoom).toBe("7");

    const preview = container?.querySelector<HTMLImageElement>(
      '[data-testid="change-camera-source-preview"]',
    );
    expect(preview?.src).toBe("https://cdn.example.com/source.jpg");

    const horizontalInput = container?.querySelector<HTMLInputElement>(
      '[data-testid="change-camera-control-horizontalAngle"]',
    );
    expect(horizontalInput).not.toBeNull();

    await act(async () => {
      if (!horizontalInput) return;
      horizontalInput.value = "90";
      horizontalInput.dispatchEvent(new Event("input", { bubbles: true }));
      horizontalInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(
      container?.querySelector<HTMLElement>('[data-testid="change-camera-stage"]')
        ?.dataset.horizontalAngle,
    ).toBe("90");
  });

  it("keeps horizontal and vertical markers coupled to their guide geometry", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ChangeCameraNode, {
          id: "camera-1",
          data: {
            canvasId: "canvas-1",
            parameters: {
              type: "change-camera",
              horizontalAngle: 140,
              verticalAngle: 9,
              zoom: 3,
              outputFormat: "png",
            },
          },
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "change-camera",
          width: 320,
          height: 440,
        } as React.ComponentProps<typeof ChangeCameraNode>),
      );
    });

    const stage = container?.querySelector<HTMLElement>(
      '[data-testid="change-camera-stage"]',
    );
    const orbit = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-orbit"]',
    );
    const horizontalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-horizontal-marker"]',
    );
    const verticalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-vertical-marker"]',
    );
    const sightline = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-sightline"]',
    );

    expect(stage?.dataset.geometry).toBe("coupled");
    expect(orbit).not.toBeNull();
    expect(horizontalMarker?.dataset.orbitBound).toBe("true");
    expect(horizontalMarker?.dataset.angle).toBe("140");
    expect(verticalMarker?.dataset.arcBound).toBe("true");
    expect(verticalMarker?.dataset.angle).toBe("9");
    expect(sightline?.dataset.from).toBe("camera");
    expect(sightline?.dataset.to).toBe("image-plane");

    const horizontalInput = container?.querySelector<HTMLInputElement>(
      '[data-testid="change-camera-control-horizontalAngle"]',
    );
    const verticalInput = container?.querySelector<HTMLInputElement>(
      '[data-testid="change-camera-control-verticalAngle"]',
    );
    const zoomInput = container?.querySelector<HTMLInputElement>(
      '[data-testid="change-camera-control-zoom"]',
    );
    const initialCameraPoint = horizontalMarker?.dataset.point;
    const initialTiltPoint = verticalMarker?.dataset.point;
    const initialZoomDistance = stage?.dataset.zoomDistance;

    await act(async () => {
      if (!horizontalInput || !verticalInput || !zoomInput) return;
      horizontalInput.value = "220";
      horizontalInput.dispatchEvent(new Event("input", { bubbles: true }));
      verticalInput.value = "40";
      verticalInput.dispatchEvent(new Event("input", { bubbles: true }));
      zoomInput.value = "8";
      zoomInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const updatedStage = container?.querySelector<HTMLElement>(
      '[data-testid="change-camera-stage"]',
    );
    const updatedHorizontalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-horizontal-marker"]',
    );
    const updatedVerticalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-vertical-marker"]',
    );

    expect(updatedHorizontalMarker?.dataset.angle).toBe("220");
    expect(updatedHorizontalMarker?.dataset.point).not.toBe(initialCameraPoint);
    expect(updatedVerticalMarker?.dataset.angle).toBe("40");
    expect(updatedVerticalMarker?.dataset.point).not.toBe(initialTiltPoint);
    expect(updatedStage?.dataset.zoom).toBe("8");
    expect(updatedStage?.dataset.zoomDistance).not.toBe(initialZoomDistance);
  });

  it("maps 180 horizontal behind the image and negative vertical below the image", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ChangeCameraNode, {
          id: "camera-1",
          data: {
            canvasId: "canvas-1",
            parameters: {
              type: "change-camera",
              horizontalAngle: 180,
              verticalAngle: -18,
              zoom: 3,
              outputFormat: "png",
            },
          },
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "change-camera",
          width: 320,
          height: 440,
        } as React.ComponentProps<typeof ChangeCameraNode>),
      );
    });

    const stage = container?.querySelector<HTMLElement>(
      '[data-testid="change-camera-stage"]',
    );
    const horizontalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-horizontal-marker"]',
    );
    const verticalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-vertical-marker"]',
    );
    const cameraPoint = parseStagePoint(horizontalMarker?.dataset.point);
    const tiltPoint = parseStagePoint(verticalMarker?.dataset.point);

    expect(stage?.dataset.horizontalAngle).toBe("180");
    expect(stage?.dataset.verticalAngle).toBe("-18");
    expect(cameraPoint.y).toBeLessThan(92);
    expect(tiltPoint.y).toBeGreaterThan(70);
  });

  it("layers the back horizontal marker behind the image plane", async () => {
    await act(async () => {
      root?.render(
        React.createElement(ChangeCameraNode, {
          id: "camera-1",
          data: {
            canvasId: "canvas-1",
            parameters: {
              type: "change-camera",
              horizontalAngle: 180,
              verticalAngle: -18,
              zoom: 3,
              outputFormat: "png",
            },
          },
          selected: false,
          dragging: false,
          zIndex: 0,
          isConnectable: true,
          type: "change-camera",
          width: 320,
          height: 440,
        } as React.ComponentProps<typeof ChangeCameraNode>),
      );
    });

    const backLayer = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-back-layer"]',
    );
    const imagePlane = container?.querySelector<HTMLElement>(
      '[data-testid="change-camera-image-plane"]',
    );
    const horizontalMarker = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-horizontal-marker"]',
    );
    const horizontalLabel = container?.querySelector<SVGElement>(
      '[data-testid="change-camera-horizontal-label"]',
    );

    expect(backLayer).not.toBeNull();
    expect(imagePlane?.dataset.layer).toBe("image-plane");
    expect(backLayer?.contains(horizontalMarker ?? null)).toBe(true);
    expect(backLayer?.contains(horizontalLabel ?? null)).toBe(true);
    expect(horizontalMarker?.dataset.depth).toBe("back");
    expect(horizontalLabel?.dataset.depth).toBe("back");
  });
});
