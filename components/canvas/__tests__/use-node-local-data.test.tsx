// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CanvasGraphProvider,
  useCanvasGraph,
  useCanvasGraphPreviewOverrides,
} from "@/components/canvas/canvas-graph-context";
import { useNodeLocalData } from "@/components/canvas/nodes/use-node-local-data";
import { readNodeFavorite } from "@/lib/canvas-node-favorite";

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

describe("favorite retention in strict local node flows", () => {
  type LocalDataConfig = {
    normalize: (value: unknown) => unknown;
    onSave: (value: unknown) => Promise<void> | void;
    data: unknown;
  };

  const createNodeProps = (data: Record<string, unknown>) =>
    ({
      id: "node-1",
      data,
      selected: false,
      width: 320,
      height: 240,
      dragging: false,
      zIndex: 0,
      isConnectable: true,
      type: "curves",
      xPos: 0,
      yPos: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }) as const;

  const setupNodeHarness = async (modulePath: string) => {
    vi.resetModules();

    let capturedConfig: LocalDataConfig | null = null;
    const queueNodeDataUpdate = vi.fn(async () => undefined);

    vi.doMock("@/components/canvas/canvas-sync-context", () => ({
      useCanvasSync: () => ({
        queueNodeDataUpdate,
        queueNodeResize: vi.fn(async () => undefined),
        status: { isOffline: false },
      }),
    }));

    vi.doMock("@/components/canvas/canvas-graph-context", () => ({
      useCanvasGraph: () => ({ nodes: [], edges: [], previewNodeDataOverrides: new Map() }),
    }));

    vi.doMock("@/components/canvas/canvas-presets-context", () => ({
      useCanvasAdjustmentPresets: () => [],
      useSaveCanvasAdjustmentPreset: () => vi.fn(async () => undefined),
    }));

    vi.doMock("@/components/canvas/nodes/base-node-wrapper", () => ({
      default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }));

    vi.doMock("@/components/canvas/nodes/adjustment-preview", () => ({
      default: () => null,
    }));

    vi.doMock("@/components/ui/select", () => ({
      Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SelectValue: () => null,
    }));

    vi.doMock("@/src/components/tool-ui/parameter-slider", () => ({
      ParameterSlider: () => null,
    }));

    vi.doMock("@/hooks/use-pipeline-preview", () => ({
      usePipelinePreview: () => ({
        canvasRef: { current: null },
        hasSource: false,
        isRendering: false,
        previewAspectRatio: 1,
        histogram: null,
        error: null,
      }),
    }));

    vi.doMock("@/lib/canvas-render-preview", () => ({
      collectPipelineFromGraph: () => [],
      getSourceImageFromGraph: () => null,
      shouldFastPathPreviewPipeline: () => false,
      findSourceNodeFromGraph: () => null,
      resolveRenderPreviewInputFromGraph: () => ({ sourceUrl: null, steps: [] }),
    }));

    vi.doMock("@/components/ui/dialog", () => ({
      Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));

    vi.doMock("@/components/canvas/nodes/use-node-local-data", () => ({
      useNodeLocalData: (config: LocalDataConfig) => {
        capturedConfig = config;
        return {
          localData: config.normalize(config.data),
          applyLocalData: vi.fn(),
          updateLocalData: vi.fn(),
        };
      },
    }));

    vi.doMock("next-intl", () => ({
      useTranslations: () => () => "",
    }));

    vi.doMock("@/lib/toast", () => ({
      toast: { success: vi.fn() },
    }));

    vi.doMock("@xyflow/react", () => ({
      Handle: () => null,
      Position: { Left: "left", Right: "right" },
      useConnection: () => ({ inProgress: false }),
    }));

    const importedModule = (await import(modulePath)) as {
      default: React.ComponentType<Record<string, unknown>>;
    };
    renderToStaticMarkup(React.createElement(importedModule.default, createNodeProps({ isFavorite: true })));

    if (capturedConfig === null) {
      throw new Error("useNodeLocalData config was not captured");
    }

    const resolvedConfig = capturedConfig as LocalDataConfig;
    return { capturedConfig: resolvedConfig, queueNodeDataUpdate };
  };

  it("preserves isFavorite in normalized local data and saved payloads", async () => {
    const targets = [
      "@/components/canvas/nodes/crop-node",
      "@/components/canvas/nodes/curves-node",
      "@/components/canvas/nodes/color-adjust-node",
      "@/components/canvas/nodes/light-adjust-node",
      "@/components/canvas/nodes/detail-adjust-node",
    ];

    for (const modulePath of targets) {
      const { capturedConfig, queueNodeDataUpdate } = await setupNodeHarness(modulePath);

      const normalizedWithFavorite = capturedConfig.normalize({ isFavorite: true });
      expect(readNodeFavorite(normalizedWithFavorite)).toBe(true);

      const strictNextData = capturedConfig.normalize({});
      expect(readNodeFavorite(strictNextData)).toBe(false);

      await capturedConfig.onSave(strictNextData);
      const queueCalls = (queueNodeDataUpdate as unknown as { mock: { calls: Array<Array<unknown>> } })
        .mock.calls;
      const queuedPayload = queueCalls[0]?.[0] as { data?: unknown } | undefined;
      expect(readNodeFavorite(queuedPayload?.data)).toBe(true);
    }
  });
});
