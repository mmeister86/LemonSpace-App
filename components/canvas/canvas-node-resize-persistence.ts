/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas node resize persistence. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import type { MutableRefObject } from "react";
import type { NodeChange } from "@xyflow/react";

export type ResizePersistChange = {
  nodeId: string;
  width: number;
  height: number;
};

export function updateResizeInteractionState(
  changes: NodeChange[],
  isResizing: MutableRefObject<boolean>,
  resizeHistoryCapturedRef: MutableRefObject<boolean>,
  onHistoryCapture?: () => void,
) {
  for (const change of changes) {
    if (change.type !== "dimensions") continue;

    if (change.resizing === true) {
      if (!resizeHistoryCapturedRef.current) {
        resizeHistoryCapturedRef.current = true;
        onHistoryCapture?.();
      }
      isResizing.current = true;
    } else if (change.resizing === false) {
      isResizing.current = false;
      resizeHistoryCapturedRef.current = false;
    }
  }
}

export function computeResizeChangesToPersist(
  changes: NodeChange[],
  removedIds: ReadonlySet<string>,
): ResizePersistChange[] {
  return changes.flatMap((change) => {
    if (change.type !== "dimensions") return [];
    if (!change.dimensions) return [];
    if (removedIds.has(change.id)) return [];
    if (change.resizing !== false) return [];

    return [
      {
        nodeId: change.id,
        width: change.dimensions.width,
        height: change.dimensions.height,
      },
    ];
  });
}
