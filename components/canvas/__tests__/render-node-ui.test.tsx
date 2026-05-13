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

  async function renderSurface(hasSource: boolean) {
    const canvasRef = createRef<HTMLCanvasElement>();
    await act(async () => {
      root?.render(<RenderNodePreviewSurface hasSource={hasSource} canvasRef={canvasRef} />);
    });
  }

  it("renders the render canvas preview directly when a source exists", async () => {
    await renderSurface(true);

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.querySelector("canvas")).toBeTruthy();
  });

  it("keeps the empty render placeholder outside media backlight", async () => {
    await renderSurface(false);

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.textContent).toContain("Verbinde eine Bild-, Asset- oder KI-Bild-Node");
  });
});
