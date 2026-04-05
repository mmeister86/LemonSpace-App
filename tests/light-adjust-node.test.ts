// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";
import { DEFAULT_LIGHT_ADJUST_DATA, type LightAdjustData } from "@/lib/image-pipeline/adjustment-types";

type ParameterSliderProps = {
  values: Array<{ id: string; value: number }>;
  onChange: (values: Array<{ id: string; value: number }>) => void;
};

const parameterSliderState = vi.hoisted(() => ({
  latestProps: null as ParameterSliderProps | null,
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(async () => undefined),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  Sun: () => null,
}));

vi.mock("@/components/canvas/canvas-presets-context", () => ({
  useCanvasAdjustmentPresets: () => [],
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/canvas/nodes/adjustment-preview", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  SelectContent: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("@/src/components/tool-ui/parameter-slider", () => ({
  ParameterSlider: (props: ParameterSliderProps) => {
    parameterSliderState.latestProps = props;
    return null;
  },
}));

import LightAdjustNode from "@/components/canvas/nodes/light-adjust-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LightAdjustNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    parameterSliderState.latestProps = null;
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
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps the locally dragged slider value when stale node data rerenders", async () => {
    const staleData: LightAdjustData = {
      ...DEFAULT_LIGHT_ADJUST_DATA,
      vignette: {
        ...DEFAULT_LIGHT_ADJUST_DATA.vignette,
      },
    };

    const renderNode = (data: LightAdjustData) =>
      root?.render(
        createElement(
          CanvasGraphProvider as never,
          {
            nodes: [{ id: "light-1", type: "light-adjust", data }],
            edges: [],
          } as never,
          createElement(LightAdjustNode, {
            id: "light-1",
            data,
            selected: false,
            dragging: false,
            zIndex: 0,
            isConnectable: true,
            type: "light-adjust",
            xPos: 0,
            yPos: 0,
            width: 320,
            height: 300,
            sourcePosition: undefined,
            targetPosition: undefined,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
          } as never),
        ),
      );

    await act(async () => {
      renderNode({ ...staleData, vignette: { ...staleData.vignette } });
      vi.runOnlyPendingTimers();
    });

    const sliderPropsBeforeDrag = parameterSliderState.latestProps;
    expect(sliderPropsBeforeDrag).not.toBeNull();

    await act(async () => {
      sliderPropsBeforeDrag?.onChange(
        sliderPropsBeforeDrag.values.map((entry) =>
          entry.id === "brightness" ? { ...entry, value: 35 } : entry,
        ),
      );
    });

    expect(
      parameterSliderState.latestProps?.values.find((entry) => entry.id === "brightness")?.value,
    ).toBe(35);

    await act(async () => {
      renderNode({ ...staleData, vignette: { ...staleData.vignette } });
      vi.runOnlyPendingTimers();
    });

    expect(
      parameterSliderState.latestProps?.values.find((entry) => entry.id === "brightness")?.value,
    ).toBe(35);

    await act(async () => {
      renderNode({
        ...staleData,
        brightness: 35,
        vignette: { ...staleData.vignette },
      });
      vi.runOnlyPendingTimers();
    });

    await act(async () => {
      renderNode({
        ...staleData,
        brightness: 60,
        vignette: { ...staleData.vignette },
      });
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(
      parameterSliderState.latestProps?.values.find((entry) => entry.id === "brightness")?.value,
    ).toBe(60);
  });

  it("does not trigger a render-phase CanvasGraphProvider update while dragging sliders", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const staleData: LightAdjustData = {
      ...DEFAULT_LIGHT_ADJUST_DATA,
      vignette: {
        ...DEFAULT_LIGHT_ADJUST_DATA.vignette,
      },
    };

    const renderNode = (data: LightAdjustData) =>
      root?.render(
        createElement(
          CanvasGraphProvider as never,
          {
            nodes: [{ id: "light-1", type: "light-adjust", data }],
            edges: [],
          } as never,
          createElement(LightAdjustNode, {
            id: "light-1",
            data,
            selected: false,
            dragging: false,
            zIndex: 0,
            isConnectable: true,
            type: "light-adjust",
            xPos: 0,
            yPos: 0,
            width: 320,
            height: 300,
            sourcePosition: undefined,
            targetPosition: undefined,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
          } as never),
        ),
      );

    await act(async () => {
      renderNode({ ...staleData, vignette: { ...staleData.vignette } });
      vi.runOnlyPendingTimers();
    });

    const sliderProps = parameterSliderState.latestProps;
    expect(sliderProps).not.toBeNull();

    await act(async () => {
      sliderProps?.onChange(
        sliderProps.values.map((entry) =>
          entry.id === "brightness" ? { ...entry, value: 35 } : entry,
        ),
      );
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        "Cannot update a component (`CanvasGraphProvider`) while rendering a different component",
      ),
    );
  });
});
