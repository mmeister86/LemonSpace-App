// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const resolveStorageUrlsForCanvasMock = vi.hoisted(() => vi.fn());

vi.mock("@/convex/_generated/api", () => ({
  api: {
    canvasGraph: { get: "canvasGraph.get" },
    canvases: { get: "canvases.get" },
    storage: { batchGetUrlsForCanvas: "storage.batchGetUrlsForCanvas" },
  },
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useMutation: () => resolveStorageUrlsForCanvasMock,
  useQuery: useQueryMock,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { email: "user@example.com" } },
      isPending: false,
    }),
  },
}));

import { useCanvasData } from "@/components/canvas/use-canvas-data";

const latestHookValue: {
  current: ReturnType<typeof useCanvasData> | null;
} = { current: null };

function HookHarness() {
  const value = useCanvasData({ canvasId: "canvas_1" as never });

  useEffect(() => {
    latestHookValue.current = value;
    return () => {
      latestHookValue.current = null;
    };
  }, [value]);

  return null;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useCanvasData", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    latestHookValue.current = null;
    useQueryMock.mockReset();
    resolveStorageUrlsForCanvasMock.mockReset();
  });

  it("subscribes to the shared graph query and derives nodes and edges from it", async () => {
    const graph = {
      nodes: [
        {
          _id: "node_1",
          canvasId: "canvas_1",
          data: { storageId: "storage_1" },
        },
      ],
      edges: [{ _id: "edge_1", canvasId: "canvas_1" }],
    };

    useQueryMock.mockImplementation((query: string) => {
      if (query === "canvasGraph.get") {
        return graph;
      }
      if (query === "canvases.get") {
        return { _id: "canvas_1" };
      }
      return undefined;
    });
    resolveStorageUrlsForCanvasMock.mockResolvedValue({ storage_1: "https://cdn.example.com/1" });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(HookHarness));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(useQueryMock).toHaveBeenCalledWith("canvasGraph.get", { canvasId: "canvas_1" });
    expect(latestHookValue.current?.convexNodes).toEqual(graph.nodes);
    expect(latestHookValue.current?.convexEdges).toEqual(graph.edges);
    expect(resolveStorageUrlsForCanvasMock).toHaveBeenCalledWith({
      canvasId: "canvas_1",
      storageIds: ["storage_1"],
    });
  });

  it("includes render last upload storage ids in batched URL resolution", async () => {
    const graph = {
      nodes: [
        {
          _id: "render_1",
          canvasId: "canvas_1",
          data: { lastUploadStorageId: "storage_render_1" },
        },
      ],
      edges: [],
    };

    useQueryMock.mockImplementation((query: string) => {
      if (query === "canvasGraph.get") {
        return graph;
      }
      if (query === "canvases.get") {
        return { _id: "canvas_1" };
      }
      return undefined;
    });
    resolveStorageUrlsForCanvasMock.mockResolvedValue({
      storage_render_1: "https://cdn.example.com/render.png",
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(HookHarness));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolveStorageUrlsForCanvasMock).toHaveBeenCalledWith({
      canvasId: "canvas_1",
      storageIds: ["storage_render_1"],
    });
  });
});
