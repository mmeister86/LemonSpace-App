// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ParameterSlider,
  shouldApplyResizeEntries,
} from "@/src/components/tool-ui/parameter-slider/parameter-slider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }

  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("ParameterSlider resize tracking", () => {
  it("ignores identical resize observations and accepts real size changes", () => {
    const sizes = new WeakMap<Element, { width: number; height: number }>();
    const track = document.createElement("span");
    const label = document.createElement("span");

    expect(
      shouldApplyResizeEntries(sizes, [
        { target: track, contentRect: { width: 320, height: 48 } },
        { target: label, contentRect: { width: 40, height: 24 } },
      ]),
    ).toBe(true);

    expect(
      shouldApplyResizeEntries(sizes, [
        { target: track, contentRect: { width: 320, height: 48 } },
        { target: label, contentRect: { width: 40, height: 24 } },
      ]),
    ).toBe(false);

    expect(
      shouldApplyResizeEntries(sizes, [
        { target: track, contentRect: { width: 321, height: 48 } },
        { target: label, contentRect: { width: 40, height: 24 } },
      ]),
    ).toBe(true);
  });
});

describe("ParameterSlider React Flow interactions", () => {
  it("marks the native range input as nodrag/nowheel so node dragging does not steal slider edits", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(ParameterSlider, {
          id: "adjustment-params",
          sliders: [
            {
              id: "brightness",
              label: "Brightness",
              min: -100,
              max: 100,
              value: 0,
            },
          ],
          values: [{ id: "brightness", value: 35 }],
          onChange: vi.fn(),
          actions: [],
        }),
      );
    });

    const rangeInput = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    expect(rangeInput).not.toBeNull();
    expect(rangeInput?.className).toContain("nodrag");
    expect(rangeInput?.className).toContain("nowheel");
    expect(rangeInput?.parentElement?.className).toContain("nodrag");
  });
});
