// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MediaBacklight } from "@/components/canvas/nodes/media-backlight";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MediaBacklight", () => {
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

  async function renderBacklight(enabled = true, blur?: number) {
    await act(async () => {
      root?.render(
        <MediaBacklight enabled={enabled} blur={blur} className="custom-backlight">
          {/* eslint-disable-next-line @next/next/no-img-element -- Test fixture for raw media children */}
          <img src="https://cdn.example.com/image.png" alt="Preview" />
        </MediaBacklight>,
      );
    });
  }

  it("wraps media with the Canvas test hook and sizing classes when enabled", async () => {
    await renderBacklight(true);

    const backlight = container?.querySelector('[data-testid="canvas-media-backlight"]');
    expect(backlight).toBeTruthy();
    expect(backlight?.className).toContain("h-full");
    expect(backlight?.className).toContain("w-full");
    expect(backlight?.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/image.png",
    );
    expect(container?.querySelector(".custom-backlight")).toBeTruthy();
  });

  it("passes blur through to the generated SVG filter", async () => {
    await renderBacklight(true, 11);

    const blur = container?.querySelector("feGaussianBlur");
    expect(blur?.getAttribute("stdDeviation")).toBe("11");
  });

  it("uses a visible Canvas default blur and keeps the halo behind the media", async () => {
    await renderBacklight(true);

    const wrapper = container?.querySelector('[data-testid="canvas-media-backlight"]');
    const blur = container?.querySelector("feGaussianBlur");
    const halo = container?.querySelector('[data-testid="canvas-media-backlight-halo"]');
    const haloLayer = halo?.parentElement?.parentElement;
    const content = container?.querySelector('[data-testid="canvas-media-backlight-content"]');
    expect(blur?.getAttribute("stdDeviation")).toBe("23");
    expect(haloLayer?.className).toContain("-z-10");
    expect(haloLayer?.className).toContain("opacity-70");
    expect(haloLayer?.className).toContain("p-24");
    expect(haloLayer?.className).toContain("mask-composite:exclude");
    expect(content?.className).toContain("z-10");
    expect(wrapper?.className).toContain("isolate");
  });

  it("renders children without the backlight hook when disabled", async () => {
    await renderBacklight(false);

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/image.png",
    );
  });
});
