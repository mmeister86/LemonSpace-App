// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const saveMutationMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ isAuthenticated: true }));
const convexClient = vi.hoisted(() => ({ query: queryMock }));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    presets: {
      list: "presets.list",
      save: "presets.save",
    },
  },
}));

vi.mock("convex/react", () => ({
  useConvex: () => convexClient,
  useConvexAuth: () => ({ isAuthenticated: authState.isAuthenticated }),
  useMutation: (key: string) => {
    if (key === "presets.save") {
      return saveMutationMock;
    }
    return vi.fn();
  },
}));

import {
  CanvasPresetsProvider,
  useCanvasAdjustmentPresets,
  useSaveCanvasAdjustmentPreset,
} from "@/components/canvas/canvas-presets-context";

function createEnabledPresetsProvider(children: React.ReactNode) {
  const props = { enabled: true } as React.ComponentProps<typeof CanvasPresetsProvider>;
  return React.createElement(CanvasPresetsProvider, props, children);
}

type PresetConsumerSnapshot = {
  curves: string[];
  colorAdjust: string[];
};

const latestSnapshotRef: { current: PresetConsumerSnapshot | null } = { current: null };
const latestSaveRef: {
  current:
    | ((args: {
        name: string;
        nodeType: "curves" | "color-adjust" | "light-adjust" | "detail-adjust";
        params: unknown;
      }) => Promise<unknown>)
    | null;
} = { current: null };

function Harness() {
  const curves = useCanvasAdjustmentPresets("curves");
  const colorAdjust = useCanvasAdjustmentPresets("color-adjust");
  const savePreset = useSaveCanvasAdjustmentPreset();

  useEffect(() => {
    latestSnapshotRef.current = {
      curves: curves.map((preset) => preset.name),
      colorAdjust: colorAdjust.map((preset) => preset.name),
    };
    latestSaveRef.current = savePreset;

    return () => {
      latestSnapshotRef.current = null;
      latestSaveRef.current = null;
    };
  }, [colorAdjust, curves, savePreset]);

  return null;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasPresetsProvider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    vi.useRealTimers();
    container?.remove();
    container = null;
    root = null;
    latestSnapshotRef.current = null;
    latestSaveRef.current = null;
    authState.isAuthenticated = true;
    queryMock.mockReset();
    saveMutationMock.mockReset();
  });

  it("loads presets with an imperative one-off query and exposes them by node type", async () => {
    queryMock.mockResolvedValue([
      { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      { _id: "preset-2", name: "Warm Pop", nodeType: "color-adjust", params: {} },
      { _id: "preset-3", name: "Crisp Contrast", nodeType: "curves", params: {} },
    ]);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current).toEqual({
        curves: ["Film Fade", "Crisp Contrast"],
        colorAdjust: ["Warm Pop"],
      });
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith("presets.list", {});
  });

  it("refreshes provider state after saving a preset through context", async () => {
    queryMock
      .mockResolvedValueOnce([
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ])
      .mockResolvedValueOnce([
        { _id: "preset-2", name: "Studio Glow", nodeType: "curves", params: {} },
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ]);
    saveMutationMock.mockResolvedValue("preset-2");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Film Fade"]);
    });

    await act(async () => {
      await latestSaveRef.current?.({
        name: "Studio Glow",
        nodeType: "curves",
        params: { contrast: 10 },
      });
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Studio Glow", "Film Fade"]);
    });

    expect(saveMutationMock).toHaveBeenCalledWith({
      name: "Studio Glow",
      nodeType: "curves",
      params: { contrast: 10 },
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("waits for auth before fetching presets", async () => {
    authState.isAuthenticated = false;
    queryMock.mockResolvedValue([
      { _id: "preset-1", name: "Recovered", nodeType: "curves", params: {} },
    ]);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    expect(queryMock).not.toHaveBeenCalled();
    expect(latestSnapshotRef.current).toEqual({ curves: [], colorAdjust: [] });

    authState.isAuthenticated = true;
    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Recovered"]);
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("retries after repeated transient preset fetch failures", async () => {
    vi.useFakeTimers();
    queryMock
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValueOnce([
        { _id: "preset-1", name: "Recovered", nodeType: "curves", params: {} },
      ]);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(latestSnapshotRef.current?.curves).toEqual([]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Recovered"]);
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("does not fail the save flow when only the refresh step fails", async () => {
    vi.useFakeTimers();
    queryMock
      .mockResolvedValueOnce([
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ])
      .mockRejectedValueOnce(new Error("refresh-temporary"))
      .mockResolvedValueOnce([
        { _id: "preset-2", name: "Studio Glow", nodeType: "curves", params: {} },
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ]);
    saveMutationMock.mockResolvedValue("preset-2");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Film Fade"]);
    });

    const savePromise = latestSaveRef.current?.({
      name: "Studio Glow",
      nodeType: "curves",
      params: { contrast: 10 },
    });

    await act(async () => {
      await savePromise;
    });

    expect(saveMutationMock).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Studio Glow", "Film Fade"]);
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
  it("ignores stale failed refreshes after a newer refresh succeeds", async () => {
    vi.useFakeTimers();

    let rejectOlderRefresh: ((error: Error) => void) | null = null;
    const olderRefreshPromise = new Promise<never>((_, reject) => {
      rejectOlderRefresh = reject;
    });

    queryMock
      .mockResolvedValueOnce([
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ])
      .mockImplementationOnce(() => olderRefreshPromise)
      .mockResolvedValueOnce([
        { _id: "preset-3", name: "Cinematic Glow", nodeType: "curves", params: {} },
        { _id: "preset-2", name: "Studio Glow", nodeType: "curves", params: {} },
        { _id: "preset-1", name: "Film Fade", nodeType: "curves", params: {} },
      ]);
    saveMutationMock.mockResolvedValue("preset-2");

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createEnabledPresetsProvider(React.createElement(Harness)),
      );
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual(["Film Fade"]);
    });

    const firstSavePromise = latestSaveRef.current?.({
      name: "Studio Glow",
      nodeType: "curves",
      params: { contrast: 10 },
    });

    await act(async () => {
      await Promise.resolve();
    });

    const secondSavePromise = latestSaveRef.current?.({
      name: "Cinematic Glow",
      nodeType: "curves",
      params: { contrast: 20 },
    });

    await act(async () => {
      await secondSavePromise;
    });

    await vi.waitFor(() => {
      expect(latestSnapshotRef.current?.curves).toEqual([
        "Cinematic Glow",
        "Studio Glow",
        "Film Fade",
      ]);
    });

    await act(async () => {
      rejectOlderRefresh?.(new Error("older refresh failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await firstSavePromise;
    });

    expect(latestSnapshotRef.current?.curves).toEqual([
      "Cinematic Glow",
      "Studio Glow",
      "Film Fade",
    ]);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
  });

});
