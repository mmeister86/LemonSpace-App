import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
}));

import type { Id } from "@/convex/_generated/dataModel";
import { create, swapMixerInputs } from "@/convex/edges";
import { requireAuth } from "@/convex/helpers";

type MockCanvas = {
  _id: Id<"canvases">;
  ownerId: string;
  updatedAt: number;
};

type MockNode = {
  _id: Id<"nodes">;
  canvasId: Id<"canvases">;
  type: string;
};

type MockEdge = {
  _id: Id<"edges">;
  canvasId: Id<"canvases">;
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  sourceHandle?: string;
  targetHandle?: string;
};

function createMockCtx(args?: {
  canvases?: MockCanvas[];
  nodes?: MockNode[];
  edges?: MockEdge[];
}) {
  const canvases = new Map((args?.canvases ?? []).map((canvas) => [canvas._id, { ...canvas }]));
  const nodes = new Map((args?.nodes ?? []).map((node) => [node._id, { ...node }]));
  const edges = new Map((args?.edges ?? []).map((edge) => [edge._id, { ...edge }]));
  const deletes: Id<"edges">[] = [];
  let insertedEdgeCount = 0;

  const ctx = {
    db: {
      get: vi.fn(async (id: string) => {
        if (canvases.has(id as Id<"canvases">)) {
          return canvases.get(id as Id<"canvases">) ?? null;
        }
        if (nodes.has(id as Id<"nodes">)) {
          return nodes.get(id as Id<"nodes">) ?? null;
        }
        if (edges.has(id as Id<"edges">)) {
          return edges.get(id as Id<"edges">) ?? null;
        }
        return null;
      }),
      query: vi.fn((table: "mutationRequests" | "edges") => {
        if (table === "mutationRequests") {
          return {
            withIndex: vi.fn(() => ({
              first: vi.fn(async () => null),
            })),
          };
        }

        if (table === "edges") {
          return {
            withIndex: vi.fn(
              (
                _index: "by_target",
                apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
              ) => {
                const clauses: Array<{ field: string; value: unknown }> = [];
                const queryBuilder = {
                  eq(field: string, value: unknown) {
                    clauses.push({ field, value });
                    return this;
                  },
                };
                apply(queryBuilder);

                const targetNodeId = clauses.find((clause) => clause.field === "targetNodeId")
                  ?.value as Id<"nodes"> | undefined;
                const incoming = Array.from(edges.values()).filter(
                  (edge) => edge.targetNodeId === targetNodeId,
                );

                return {
                  take: vi.fn(async (count: number) => incoming.slice(0, count)),
                };
              },
            ),
          };
        }

        throw new Error(`Unexpected query table: ${table}`);
      }),
      insert: vi.fn(async (table: "edges" | "mutationRequests", value: Record<string, unknown>) => {
        if (table === "mutationRequests") {
          return "mutation_request_1";
        }
        insertedEdgeCount += 1;
        const edgeId = `edge-new-${insertedEdgeCount}` as Id<"edges">;
        edges.set(edgeId, {
          _id: edgeId,
          canvasId: value.canvasId as Id<"canvases">,
          sourceNodeId: value.sourceNodeId as Id<"nodes">,
          targetNodeId: value.targetNodeId as Id<"nodes">,
          sourceHandle: value.sourceHandle as string | undefined,
          targetHandle: value.targetHandle as string | undefined,
        });
        return edgeId;
      }),
      patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        if (canvases.has(id as Id<"canvases">)) {
          const canvas = canvases.get(id as Id<"canvases">);
          if (!canvas) {
            throw new Error("Canvas missing");
          }
          canvases.set(id as Id<"canvases">, { ...canvas, ...patch });
          return;
        }

        if (edges.has(id as Id<"edges">)) {
          const edge = edges.get(id as Id<"edges">);
          if (!edge) {
            throw new Error("Edge missing");
          }
          edges.set(id as Id<"edges">, { ...edge, ...patch });
          return;
        }

        throw new Error("Record missing");
      }),
      delete: vi.fn(async (edgeId: Id<"edges">) => {
        deletes.push(edgeId);
        edges.delete(edgeId);
      }),
    },
  };

  return {
    ctx,
    listEdges: () => Array.from(edges.values()),
    listCanvases: () => Array.from(canvases.values()),
    deletes,
  };
}

describe("edges.create", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats edgeIdToIgnore as replacement and removes ignored edge", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user-1" } as never);
    const canvasId = "canvas-1" as Id<"canvases">;
    const targetNodeId = "node-target" as Id<"nodes">;
    const oldEdgeId = "edge-old" as Id<"edges">;
    const mock = createMockCtx({
      canvases: [{ _id: canvasId, ownerId: "user-1", updatedAt: 1 }],
      nodes: [
        { _id: "node-source-1" as Id<"nodes">, canvasId, type: "image" },
        { _id: "node-source-2" as Id<"nodes">, canvasId, type: "image" },
        { _id: targetNodeId, canvasId, type: "mixer" },
      ],
      edges: [
        {
          _id: oldEdgeId,
          canvasId,
          sourceNodeId: "node-source-1" as Id<"nodes">,
          targetNodeId,
          targetHandle: "base",
        },
      ],
    });

    await (create as unknown as {
      _handler: (
        ctx: unknown,
        args: {
          canvasId: Id<"canvases">;
          sourceNodeId: Id<"nodes">;
          targetNodeId: Id<"nodes">;
          targetHandle?: string;
          edgeIdToIgnore?: Id<"edges">;
        },
      ) => Promise<Id<"edges">>;
    })._handler(mock.ctx, {
      canvasId,
      sourceNodeId: "node-source-2" as Id<"nodes">,
      targetNodeId,
      targetHandle: "base",
      edgeIdToIgnore: oldEdgeId,
    });

    const incomingToTarget = mock
      .listEdges()
      .filter((edge) => edge.targetNodeId === targetNodeId && edge.targetHandle === "base");

    expect(incomingToTarget).toHaveLength(1);
    expect(incomingToTarget[0]?._id).not.toBe(oldEdgeId);
    expect(mock.deletes).toEqual([oldEdgeId]);
  });
});

describe("edges.swapMixerInputs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("swaps handles between two mixer input edges and updates canvas timestamp", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user-1" } as never);
    const canvasId = "canvas-1" as Id<"canvases">;
    const mixerNodeId = "node-mixer" as Id<"nodes">;
    const mock = createMockCtx({
      canvases: [{ _id: canvasId, ownerId: "user-1", updatedAt: 1 }],
      nodes: [{ _id: mixerNodeId, canvasId, type: "mixer" }],
      edges: [
        {
          _id: "edge-base" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-1" as Id<"nodes">,
          targetNodeId: mixerNodeId,
          targetHandle: "base",
        },
        {
          _id: "edge-overlay" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-2" as Id<"nodes">,
          targetNodeId: mixerNodeId,
          targetHandle: "overlay",
        },
      ],
    });

    await (swapMixerInputs as unknown as {
      _handler: (
        ctx: unknown,
        args: {
          canvasId: Id<"canvases">;
          edgeId: Id<"edges">;
          otherEdgeId: Id<"edges">;
        },
      ) => Promise<void>;
    })._handler(mock.ctx, {
      canvasId,
      edgeId: "edge-base" as Id<"edges">,
      otherEdgeId: "edge-overlay" as Id<"edges">,
    });

    const swappedEdges = mock.listEdges();
    expect(swappedEdges.find((edge) => edge._id === ("edge-base" as Id<"edges">))?.targetHandle).toBe(
      "overlay",
    );
    expect(
      swappedEdges.find((edge) => edge._id === ("edge-overlay" as Id<"edges">))?.targetHandle,
    ).toBe("base");
    expect(mock.listCanvases()[0]?.updatedAt).toBeGreaterThan(1);
  });

  it("fails when one of the edge IDs does not exist", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user-1" } as never);
    const canvasId = "canvas-1" as Id<"canvases">;
    const mock = createMockCtx({
      canvases: [{ _id: canvasId, ownerId: "user-1", updatedAt: 1 }],
      edges: [
        {
          _id: "edge-base" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-1" as Id<"nodes">,
          targetNodeId: "node-mixer" as Id<"nodes">,
          targetHandle: "base",
        },
      ],
    });

    await expect(
      (swapMixerInputs as unknown as {
        _handler: (
          ctx: unknown,
          args: {
            canvasId: Id<"canvases">;
            edgeId: Id<"edges">;
            otherEdgeId: Id<"edges">;
          },
        ) => Promise<void>;
      })._handler(mock.ctx, {
        canvasId,
        edgeId: "edge-base" as Id<"edges">,
        otherEdgeId: "edge-missing" as Id<"edges">,
      }),
    ).rejects.toThrow("Edge not found");
  });

  it("fails when edges are not exactly one base and one overlay handle", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user-1" } as never);
    const canvasId = "canvas-1" as Id<"canvases">;
    const mixerNodeId = "node-mixer" as Id<"nodes">;
    const mock = createMockCtx({
      canvases: [{ _id: canvasId, ownerId: "user-1", updatedAt: 1 }],
      nodes: [{ _id: mixerNodeId, canvasId, type: "mixer" }],
      edges: [
        {
          _id: "edge-1" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-1" as Id<"nodes">,
          targetNodeId: mixerNodeId,
          targetHandle: "base",
        },
        {
          _id: "edge-2" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-2" as Id<"nodes">,
          targetNodeId: mixerNodeId,
          targetHandle: "base",
        },
      ],
    });

    await expect(
      (swapMixerInputs as unknown as {
        _handler: (
          ctx: unknown,
          args: {
            canvasId: Id<"canvases">;
            edgeId: Id<"edges">;
            otherEdgeId: Id<"edges">;
          },
        ) => Promise<void>;
      })._handler(mock.ctx, {
        canvasId,
        edgeId: "edge-1" as Id<"edges">,
        otherEdgeId: "edge-2" as Id<"edges">,
      }),
    ).rejects.toThrow("Mixer swap requires one base and one overlay edge");
  });

  it("fails when edges do not belong to the same mixer target on the same canvas", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: "user-1" } as never);
    const canvasId = "canvas-1" as Id<"canvases">;
    const mock = createMockCtx({
      canvases: [{ _id: canvasId, ownerId: "user-1", updatedAt: 1 }],
      nodes: [
        { _id: "node-mixer-a" as Id<"nodes">, canvasId, type: "mixer" },
        { _id: "node-mixer-b" as Id<"nodes">, canvasId, type: "mixer" },
      ],
      edges: [
        {
          _id: "edge-base" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-1" as Id<"nodes">,
          targetNodeId: "node-mixer-a" as Id<"nodes">,
          targetHandle: "base",
        },
        {
          _id: "edge-overlay" as Id<"edges">,
          canvasId,
          sourceNodeId: "source-2" as Id<"nodes">,
          targetNodeId: "node-mixer-b" as Id<"nodes">,
          targetHandle: "overlay",
        },
      ],
    });

    await expect(
      (swapMixerInputs as unknown as {
        _handler: (
          ctx: unknown,
          args: {
            canvasId: Id<"canvases">;
            edgeId: Id<"edges">;
            otherEdgeId: Id<"edges">;
          },
        ) => Promise<void>;
      })._handler(mock.ctx, {
        canvasId,
        edgeId: "edge-base" as Id<"edges">,
        otherEdgeId: "edge-overlay" as Id<"edges">,
      }),
    ).rejects.toThrow("Edges must target the same mixer node");
  });
});
