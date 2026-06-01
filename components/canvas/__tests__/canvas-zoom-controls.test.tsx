// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  Panel: ({
    children,
    className,
    position,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    position?: string;
  }) => (
    <div data-position={position} className={className} {...props}>
      {children}
    </div>
  ),
  useViewport: () => ({ zoom: 1 }),
  useStore: (selector: (state: { minZoom: number; maxZoom: number }) => unknown) =>
    selector({ minZoom: 0.1, maxZoom: 4 }),
  useReactFlow: () => ({
    fitView: mocks.fitView,
    zoomIn: mocks.zoomIn,
    zoomOut: mocks.zoomOut,
    zoomTo: mocks.zoomTo,
  }),
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    "aria-label": ariaLabel,
    onValueChange,
  }: {
    "aria-label"?: string;
    onValueChange?: (values: number[]) => void;
  }) => (
    <button
      aria-label={ariaLabel}
      type="button"
      onClick={() => onValueChange?.([1.5])}
    >
      slider
    </button>
  ),
}));

import { CanvasZoomSliderControls } from "@/components/canvas/canvas-zoom-controls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasZoomSliderControls", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.fitView.mockClear();
    mocks.zoomIn.mockClear();
    mocks.zoomOut.mockClear();
    mocks.zoomTo.mockClear();
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

  it("renders bottom-left semi-transparent controls with a hover reveal slider", async () => {
    await act(async () => {
      root?.render(<CanvasZoomSliderControls />);
    });

    const controls = container?.querySelector('[data-testid="canvas-zoom-controls"]');
    expect(controls?.getAttribute("data-position")).toBe("bottom-left");
    expect(controls?.className).toContain("opacity-55");
    expect(controls?.className).toContain("hover:opacity-100");
    expect(
      container?.querySelector('[data-testid="canvas-zoom-slider-reveal"]')?.className,
    ).toContain("group-hover/zoom:w-36");
  });

  it("wires zoom buttons, slider, reset, and fit view to React Flow", async () => {
    await act(async () => {
      root?.render(<CanvasZoomSliderControls />);
    });

    const zoomOut = container?.querySelector('button[aria-label="Verkleinern"]');
    const zoomIn = container?.querySelector('button[aria-label="Vergrößern"]');
    const reset = container?.querySelector('button[aria-label="Zoom auf 100%"]');
    const fit = container?.querySelector('button[aria-label="Ansicht einpassen"]');
    const slider = container?.querySelector('button[aria-label="Zoom"]');

    if (
      !(zoomOut instanceof HTMLButtonElement) ||
      !(zoomIn instanceof HTMLButtonElement) ||
      !(reset instanceof HTMLButtonElement) ||
      !(fit instanceof HTMLButtonElement) ||
      !(slider instanceof HTMLButtonElement)
    ) {
      throw new Error("Zoom controls not found");
    }

    await act(async () => {
      zoomOut.click();
      zoomIn.click();
      reset.click();
      fit.click();
      slider.click();
    });

    expect(mocks.zoomOut).toHaveBeenCalledWith({ duration: 220 });
    expect(mocks.zoomIn).toHaveBeenCalledWith({ duration: 220 });
    expect(mocks.zoomTo).toHaveBeenCalledWith(1, { duration: 220 });
    expect(mocks.zoomTo).toHaveBeenCalledWith(1.5);
    expect(mocks.fitView).toHaveBeenCalledWith({ duration: 220 });
  });
});
