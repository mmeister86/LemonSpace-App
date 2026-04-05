// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CanvasGraphProvider,
  useCanvasGraph,
  useCanvasGraphPreviewOverrides,
} from "@/components/canvas/canvas-graph-context";
import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";

type AdjustmentData = {
  exposure: number;
  label?: string;
};

type HookHarnessProps = {
  nodeId: string;
  data: AdjustmentData;
  onSave: (value: AdjustmentData) => Promise<void> | void;
};

const latestHookRef: {
  current:
    | {
        applyLocalData: (next: AdjustmentData) => void;
        updateLocalData: (updater: (current: AdjustmentData) => AdjustmentData) => void;
        localData: AdjustmentData;
      }
    | null;
} = { current: null };

const latestOverridesRef: {
  current: ReadonlyMap<string, unknown>;
} = { current: new Map() };

const canvasGraphSetOverrideRef: {
  current: ((nodeId: string, data: unknown) => void) | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({ nodeId, data, onSave }: HookHarnessProps) {
  const { localData, applyLocalData, updateLocalData } = useNodeLocalData<AdjustmentData>({
    nodeId,
    data,
    normalize: (value) => ({ ...(value as AdjustmentData) }),
    saveDelayMs: 1000,
    onSave,
    debugLabel: "curves",
  });

  useEffect(() => {
    latestHookRef.current = {
      applyLocalData,
      updateLocalData,
      localData,
    };

    return () => {
      latestHookRef.current = null;
    };
  }, [applyLocalData, localData, updateLocalData]);

  return null;
}

function GraphProbe() {
  const { previewNodeDataOverrides } = useCanvasGraph();
  const { setPreviewNodeDataOverride } = useCanvasGraphPreviewOverrides();

  useEffect(() => {
    latestOverridesRef.current = previewNodeDataOverrides;
    canvasGraphSetOverrideRef.current = setPreviewNodeDataOverride;

    return () => {
      canvasGraphSetOverrideRef.current = null;
    };
  }, [previewNodeDataOverrides, setPreviewNodeDataOverride]);

  return null;
}

function TestApp({
  nodeId,
  data,
  mounted,
  onSave,
}: {
  nodeId: string;
  data: AdjustmentData;
  mounted: boolean;
  onSave: (value: AdjustmentData) => Promise<void> | void;
}) {
  return (
    <CanvasGraphProvider nodes={[{ id: nodeId, type: "curves", data }]} edges={[]}>
      {mounted ? <HookHarness nodeId={nodeId} data={data} onSave={onSave} /> : null}
      <GraphProbe />
    </CanvasGraphProvider>
  );
}

describe("useNodeLocalData preview overrides", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHookRef.current = null;
    latestOverridesRef.current = new Map();
    canvasGraphSetOverrideRef.current = null;
    vi.clearAllMocks();

    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    root = null;
    container = null;
  });

  it("sets a preview override for local edits and clears it when persisted data catches up", async () => {
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.updateLocalData((current) => ({
        ...current,
        exposure: 0.8,
      }));
    });

    expect(latestOverridesRef.current).toEqual(
      new Map([["node-1", { exposure: 0.8, label: "persisted" }]]),
    );

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.8, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    expect(latestOverridesRef.current).toEqual(new Map());
  });

  it("does not update the canvas graph provider during render when updating local data", async () => {
    const onSave = vi.fn(async () => undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.updateLocalData((current) => ({
        ...current,
        exposure: 0.8,
      }));
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        "Cannot update a component (`CanvasGraphProvider`) while rendering a different component",
      ),
    );
  });

  it("does not write preview overrides from inside the local state updater", async () => {
    const onSave = vi.fn(async () => undefined);
    const originalSetPreviewNodeDataOverride = canvasGraphSetOverrideRef.current;
    let insideUpdater = false;

    canvasGraphSetOverrideRef.current = () => {
      if (insideUpdater) {
        throw new Error("setPreviewNodeDataOverride called during updater");
      }
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await expect(
      act(async () => {
        latestHookRef.current?.updateLocalData((current) => {
          insideUpdater = true;
          return {
            ...current,
            exposure: 0.8,
          };
        });
      }),
    ).resolves.toBeUndefined();

    insideUpdater = false;
    canvasGraphSetOverrideRef.current = originalSetPreviewNodeDataOverride;
  });

  it("clears its preview override on unmount", async () => {
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "persisted",
      });
    });

    expect(latestOverridesRef.current).toEqual(
      new Map([["node-1", { exposure: 0.8, label: "persisted" }]]),
    );

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted={false}
          onSave={onSave}
        />,
      );
    });

    expect(latestOverridesRef.current).toEqual(new Map());
  });

  it("cancels a pending debounced save when the node unmounts", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "persisted",
      });
    });

    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted={false}
          onSave={onSave}
        />,
      );
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(latestOverridesRef.current).toEqual(new Map());

    vi.useRealTimers();
  });

  it("clears pending preview state after a rejected save so persisted data can recover", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => {
      throw new Error("save failed");
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "persisted",
      });
    });

    expect(latestOverridesRef.current).toEqual(
      new Map([["node-1", { exposure: 0.8, label: "persisted" }]]),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestOverridesRef.current).toEqual(new Map());

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.3, label: "server" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(latestHookRef.current?.localData).toEqual({ exposure: 0.3, label: "server" });

    vi.useRealTimers();
  });

  it("accepts a non-identical persisted update after a successful save", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "client",
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.75, label: "server-normalized" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(latestHookRef.current?.localData).toEqual({
      exposure: 0.75,
      label: "server-normalized",
    });
    expect(latestOverridesRef.current).toEqual(new Map());

    vi.useRealTimers();
  });

  it("keeps local data when save resolves before Convex catches up", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "local",
      });
    });

    expect(latestHookRef.current?.localData).toEqual({
      exposure: 0.8,
      label: "local",
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(latestHookRef.current?.localData).toEqual({
      exposure: 0.8,
      label: "local",
    });

    vi.useRealTimers();
  });

  it("accepts a later normalized server value after blocking a stale rerender", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      latestHookRef.current?.applyLocalData({
        exposure: 0.8,
        label: "local",
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.2, label: "persisted" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(latestHookRef.current?.localData).toEqual({
      exposure: 0.8,
      label: "local",
    });

    await act(async () => {
      root?.render(
        <TestApp
          nodeId="node-1"
          data={{ exposure: 0.75, label: "server-normalized" }}
          mounted
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(latestHookRef.current?.localData).toEqual({
      exposure: 0.75,
      label: "server-normalized",
    });
    expect(latestOverridesRef.current).toEqual(new Map());

    vi.useRealTimers();
  });
});
