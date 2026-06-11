/**
 * Onboarding note:
 * Typed optimistic-store helper for the bundled canvasGraph query. All optimistic node/edge mutations should update this cache instead of legacy split queries.
 */

import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReference } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type CanvasGraphQueryResult = {
  canvas: Doc<"canvases">;
  nodes: Doc<"nodes">[];
  edges: Doc<"edges">[];
};

export const canvasGraphQuery = (api as unknown as {
  canvasGraph: {
    get: FunctionReference<
      "query",
      "public",
      { canvasId: Id<"canvases"> },
      CanvasGraphQueryResult
    >;
  };
}).canvasGraph.get;

type CanvasGraphArgs = {
  canvasId: Id<"canvases">;
};

function getCanvasGraphFromQuery(
  localStore: OptimisticLocalStore,
  args: CanvasGraphArgs,
): CanvasGraphQueryResult | undefined {
  return localStore.getQuery(canvasGraphQuery, args) as CanvasGraphQueryResult | undefined;
}

export function getCanvasGraphNodesFromQuery(
  localStore: OptimisticLocalStore,
  args: CanvasGraphArgs,
): Doc<"nodes">[] | undefined {
  return getCanvasGraphFromQuery(localStore, args)?.nodes;
}

export function getCanvasGraphEdgesFromQuery(
  localStore: OptimisticLocalStore,
  args: CanvasGraphArgs,
): Doc<"edges">[] | undefined {
  return getCanvasGraphFromQuery(localStore, args)?.edges;
}

export function setCanvasGraphNodesInQuery(
  localStore: OptimisticLocalStore,
  args: CanvasGraphArgs & { nodes: Doc<"nodes">[] },
): void {
  const current = getCanvasGraphFromQuery(localStore, {
    canvasId: args.canvasId,
  });
  if (!current) {
    return;
  }

  localStore.setQuery(canvasGraphQuery, { canvasId: args.canvasId }, {
    canvas: current.canvas,
    nodes: args.nodes,
    edges: current.edges,
  });
}

export function setCanvasGraphEdgesInQuery(
  localStore: OptimisticLocalStore,
  args: CanvasGraphArgs & { edges: Doc<"edges">[] },
): void {
  const current = getCanvasGraphFromQuery(localStore, {
    canvasId: args.canvasId,
  });
  if (!current) {
    return;
  }

  localStore.setQuery(canvasGraphQuery, { canvasId: args.canvasId }, {
    canvas: current.canvas,
    nodes: current.nodes,
    edges: args.edges,
  });
}
