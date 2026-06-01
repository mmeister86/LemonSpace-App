// @vitest-environment jsdom

import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RenderNodePreviewSurface } from "@/components/canvas/nodes/render-node-ui";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("RenderNodePreviewSurface", () => {
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
    container = null;
    root = null;
  });

  async function renderSurface(
    hasSource: boolean,
    isAlphaBearing = false,
    displaySize?: { width: number; height: number } | null,
  ) {
    const canvasRef = createRef<HTMLCanvasElement>();
    await act(async () => {
      root?.render(
        <RenderNodePreviewSurface
          hasSource={hasSource}
          canvasRef={canvasRef}
          isAlphaBearing={isAlphaBearing}
          displaySize={displaySize}
        />,
      );
    });
  }

  it("renders the render canvas preview directly when a source exists", async () => {
    await renderSurface(true);

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.querySelector("canvas")).toBeTruthy();
  });

  it("renders opaque previews through a full-size canvas", async () => {
    await renderSurface(true);

    expect(container?.querySelector("canvas")?.className).toContain("h-full w-full");
    expect(container?.querySelector("canvas")?.className).not.toContain("object-cover");
  });

  it("renders alpha-bearing previews over a transparency surface", async () => {
    await renderSurface(true, true);

    expect(container?.querySelector('[data-alpha-source="true"]')).toBeTruthy();
    expect(container?.querySelector("canvas")?.className).toContain("h-full w-full");
  });

  it("scales the rendered canvas to the ratio-locked preview display size", async () => {
    await renderSurface(true, false, { width: 320, height: 240 });

    const previewFrame = container?.querySelector('[data-testid="render-preview-frame"]') as HTMLElement | null;
    expect(previewFrame?.style.width).toBe("320px");
    expect(previewFrame?.style.height).toBe("240px");
    expect(container?.querySelector("canvas")?.className).toContain("h-full w-full");
  });

  it("does not mark opaque previews as alpha-bearing", async () => {
    await renderSurface(true);

    expect(container?.querySelector('[data-alpha-source="true"]')).toBeNull();
  });

  it("keeps the empty render placeholder outside media backlight", async () => {
    await renderSurface(false);

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.textContent).toContain("Verbinde eine Bild-, Asset- oder KI-Bild-Node");
  });
});
