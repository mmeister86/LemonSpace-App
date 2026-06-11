/**
 * Onboarding note:
 * Shared TypeScript utility for canvas bridge edges. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import {
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  type Edge as RFEdge,
  type Node as RFNode,
} from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";

function reconnectEdgeKey(edge: RFEdge): string {
  return `${edge.source}\0${edge.target}\0${edge.sourceHandle ?? ""}\0${edge.targetHandle ?? ""}`;
}

export type BridgeCreatePayload = {
  sourceNodeId: Id<"nodes">;
  targetNodeId: Id<"nodes">;
  sourceHandle?: string;
  targetHandle?: string;
};

/**
 * Nach Löschen mittlerer Knoten: Kanten wie im React-Flow-Beispiel
 * „Delete Middle Node“ fortschreiben; nur Kanten zurückgeben, die neu
 * angelegt werden müssen (nicht bereits vor dem Löschen vorhanden).
 */
export function computeBridgeCreatesForDeletedNodes(
  deletedNodes: RFNode[],
  allNodes: RFNode[],
  allEdges: RFEdge[],
): BridgeCreatePayload[] {
  if (deletedNodes.length === 0) return [];

  const initialPersisted = allEdges.filter(
    (e) =>
      e.className !== "temp" &&
      e.className !== "provenance" &&
      (e.data as { kind?: string } | undefined)?.kind !== "provenance",
  );
  const initialKeys = new Set(initialPersisted.map(reconnectEdgeKey));

  let remainingNodes = [...allNodes];
  let acc = [...initialPersisted];

  for (const node of deletedNodes) {
    const incomers = getIncomers(node, remainingNodes, acc);
    const outgoers = getOutgoers(node, remainingNodes, acc);
    const connectedEdges = getConnectedEdges([node], acc);
    const remainingEdges = acc.filter((e) => !connectedEdges.includes(e));

    const createdEdges: RFEdge[] = [];
    for (const inc of incomers) {
      for (const out of outgoers) {
        const inEdge = connectedEdges.find(
          (e) => e.source === inc.id && e.target === node.id,
        );
        const outEdge = connectedEdges.find(
          (e) => e.source === node.id && e.target === out.id,
        );
        if (!inEdge || !outEdge || inc.id === out.id) continue;
        createdEdges.push({
          id: `reconnect-${inc.id}-${out.id}-${node.id}-${createdEdges.length}`,
          source: inc.id,
          target: out.id,
          sourceHandle: inEdge.sourceHandle,
          targetHandle: outEdge.targetHandle,
        });
      }
    }

    acc = [...remainingEdges, ...createdEdges];
    remainingNodes = remainingNodes.filter((rn) => rn.id !== node.id);
  }

  const result: BridgeCreatePayload[] = [];
  for (const e of acc) {
    if (!initialKeys.has(reconnectEdgeKey(e))) {
      result.push({
        sourceNodeId: e.source as Id<"nodes">,
        targetNodeId: e.target as Id<"nodes">,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      });
    }
  }
  return result;
}
