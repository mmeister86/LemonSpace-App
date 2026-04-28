import { describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { deleteNodeWithCleanup } from "@/convex/nodes/delete_cleanup";
import {
  getIdempotentNodeCreateResult,
  rememberIdempotentNodeCreateResult,
  resolveNodeReferenceForWrite,
} from "@/convex/nodes/idempotency";
import { assertParentAllowedForNode, isNodeDescendantOf } from "@/convex/nodes/grouping";
import { insertNodeForWrite } from "@/convex/nodes/write_helpers";

function makeCollectQuery<T>(items: T[]) {
  return {
    withIndex: vi.fn(() => ({
      collect: vi.fn(async () => items),
    })),
  };
}

describe("nodes helper modules", () => {
  it("shares insertion and idempotency helpers for node creates", async () => {
    const canvasId = "canvas-1" as Id<"canvases">;
    const nodeId = "node-1" as Id<"nodes">;
    const mutationRequestId = "request-1" as Id<"mutationRequests">;
    const mutationRequests: Array<Record<string, unknown>> = [];
    const ctx = {
      db: {
        insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
          if (table === "nodes") {
            expect(value).toMatchObject({
              canvasId,
              type: "text",
              positionX: 10,
              positionY: 20,
              width: 300,
              height: 120,
              status: "idle",
              retryCount: 0,
              data: { content: "Hello" },
              zIndex: 4,
            });
            return nodeId;
          }
          if (table === "mutationRequests") {
            mutationRequests.push(value);
            return mutationRequestId;
          }
          throw new Error(`Unexpected insert table ${table}`);
        }),
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            first: vi.fn(async () => ({ canvasId, nodeId })),
          })),
        })),
      },
    };

    const insertedNodeId = await insertNodeForWrite(ctx as never, {
      canvasId,
      type: "text",
      positionX: 10,
      positionY: 20,
      width: 300,
      height: 120,
      data: { content: "Hello" },
      zIndex: 4,
    });
    await rememberIdempotentNodeCreateResult(ctx as never, {
      userId: "user-1",
      mutation: "nodes.create",
      clientRequestId: "client-request-1",
      canvasId,
      nodeId: insertedNodeId,
    });

    await expect(
      getIdempotentNodeCreateResult(ctx as never, {
        userId: "user-1",
        mutation: "nodes.create",
        clientRequestId: "client-request-1",
        canvasId,
      }),
    ).resolves.toBe(nodeId);
    expect(mutationRequests).toEqual([
      expect.objectContaining({
        userId: "user-1",
        mutation: "nodes.create",
        clientRequestId: "client-request-1",
        canvasId,
        nodeId,
      }),
    ]);
  });

  it("resolves optimistic node references through remembered create requests", async () => {
    const canvasId = "canvas-1" as Id<"canvases">;
    const nodeId = "node-created" as Id<"nodes">;
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn((_index: string, apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
            const clauses: Array<{ field: string; value: unknown }> = [];
            const q = {
              eq(field: string, value: unknown) {
                clauses.push({ field, value });
                return q;
              },
            };
            apply(q);
            const mutation = clauses.find((clause) => clause.field === "mutation")?.value;
            return {
              first: vi.fn(async () =>
                mutation === "nodes.createWithEdgeFromSource" ? { canvasId, nodeId } : null,
              ),
            };
          }),
        })),
      },
    };

    await expect(
      resolveNodeReferenceForWrite(ctx as never, {
        userId: "user-1",
        canvasId,
        nodeId: "optimistic_client-request-1",
      }),
    ).resolves.toBe(nodeId);
  });

  it("isolates grouping parent validation and cycle detection", async () => {
    const canvasId = "canvas-1" as Id<"canvases">;
    const childId = "node-child" as Id<"nodes">;
    const parentId = "node-parent" as Id<"nodes">;
    const nodes = new Map([
      [childId, { _id: childId, canvasId, type: "text" }],
      [parentId, { _id: parentId, canvasId, type: "group", parentId: childId }],
    ]);
    const ctx = {
      db: {
        get: vi.fn(async (id: Id<"nodes">) => nodes.get(id) ?? null),
      },
    };

    await expect(isNodeDescendantOf(ctx as never, parentId, childId)).resolves.toBe(true);
    await expect(
      assertParentAllowedForNode(ctx as never, {
        nodeId: childId,
        canvasId,
        parentId,
      }),
    ).rejects.toThrow("Parent cycle is not allowed");
  });

  it("isolates delete cleanup for connected edges and child detachment", async () => {
    const canvasId = "canvas-1" as Id<"canvases">;
    const nodeId = "node-delete" as Id<"nodes">;
    const childId = "node-child" as Id<"nodes">;
    const sourceEdges = [{ _id: "edge-source" as Id<"edges"> }];
    const targetEdges = [{ _id: "edge-target" as Id<"edges"> }];
    const children = [{ _id: childId }];
    const deleted: string[] = [];
    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const ctx = {
      db: {
        query: vi.fn((table: "edges" | "nodes") => {
          if (table === "edges") {
            const call = vi.mocked(ctx.db.query).mock.calls.filter(([name]) => name === "edges").length;
            return makeCollectQuery(call === 1 ? sourceEdges : targetEdges);
          }
          return makeCollectQuery(children);
        }),
        delete: vi.fn(async (id: string) => {
          deleted.push(id);
        }),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          patches.push({ id, patch });
        }),
      },
    };

    await deleteNodeWithCleanup(ctx as never, { nodeId, canvasId });

    expect(deleted).toEqual(["edge-source", "edge-target", nodeId]);
    expect(patches).toEqual([
      { id: childId, patch: { parentId: undefined } },
      { id: canvasId, patch: expect.objectContaining({ updatedAt: expect.any(Number) }) },
    ]);
  });
});
