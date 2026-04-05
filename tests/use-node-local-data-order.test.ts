// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const canvasGraphMock = vi.hoisted(() => ({
  clearPreviewNodeDataOverride: vi.fn(),
  setPreviewNodeDataOverride: vi.fn(),
}));

vi.mock("@/components/canvas/canvas-graph-context", () => ({
  useCanvasGraphPreviewOverrides: () => canvasGraphMock,
}));

import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";

type AdjustmentData = {
  exposure: number;
};

const latestHookRef: {
  current:
    | {
        updateLocalData: (updater: (current: AdjustmentData) => AdjustmentData) => void;
      }
    | null;
} = { current: null };

function HookHarness() {
  const { updateLocalData } = useNodeLocalData<AdjustmentData>({
    nodeId: "node-1",
    data: { exposure: 0.2 },
    normalize: (value) => ({ ...(value as AdjustmentData) }),
    saveDelayMs: 1000,
    onSave: async () => undefined,
    debugLabel: "light-adjust",
  });

  useEffect(() => {
    latestHookRef.current = { updateLocalData };
    return () => {
      latestHookRef.current = null;
    };
  }, [updateLocalData]);

  return null;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useNodeLocalData ordering", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    latestHookRef.current = null;
    canvasGraphMock.clearPreviewNodeDataOverride.mockReset();
    canvasGraphMock.setPreviewNodeDataOverride.mockReset();
  });

  it("does not write preview overrides from inside the local state updater", async () => {
    let overrideWriteStack = "";

    canvasGraphMock.setPreviewNodeDataOverride.mockImplementation(() => {
      overrideWriteStack = new Error().stack ?? "";
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(HookHarness));
    });

    await act(async () => {
      latestHookRef.current?.updateLocalData((current) => ({
        ...current,
        exposure: 0.8,
      }));
    });

    expect(overrideWriteStack).not.toContain("basicStateReducer");
    expect(overrideWriteStack).not.toContain("updateReducerImpl");
  });
});
