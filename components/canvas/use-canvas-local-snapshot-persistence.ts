import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  readCanvasSnapshot,
  writeCanvasSnapshot,
} from "@/lib/canvas-local-persistence";

type UseCanvasLocalSnapshotPersistenceParams<TNode, TEdge> = {
  canvasId: string;
  nodes: TNode[];
  edges: TEdge[];
  setNodes: Dispatch<SetStateAction<TNode[]>>;
  setEdges: Dispatch<SetStateAction<TEdge[]>>;
  debounceMs?: number;
};

type PendingSnapshot<TNode, TEdge> = {
  canvasId: string;
  nodes: TNode[];
  edges: TEdge[];
};

const DEFAULT_SNAPSHOT_DEBOUNCE_MS = 350;

export function useCanvasLocalSnapshotPersistence<TNode, TEdge>({
  canvasId,
  nodes,
  edges,
  setNodes,
  setEdges,
  debounceMs = DEFAULT_SNAPSHOT_DEBOUNCE_MS,
}: UseCanvasLocalSnapshotPersistenceParams<TNode, TEdge>): void {
  const hasHydratedLocalSnapshotRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<PendingSnapshot<TNode, TEdge> | null>(null);

  const flushPendingSnapshot = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const pendingSnapshot = pendingSnapshotRef.current;
    if (!pendingSnapshot) return;

    writeCanvasSnapshot(pendingSnapshot.canvasId, {
      nodes: pendingSnapshot.nodes,
      edges: pendingSnapshot.edges,
    });
    pendingSnapshotRef.current = null;
  }, []);

  useEffect(() => {
    hasHydratedLocalSnapshotRef.current = false;
    flushPendingSnapshot();

    const snapshot = readCanvasSnapshot<TNode, TEdge>(canvasId);
    if (snapshot) {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    }

    hasHydratedLocalSnapshotRef.current = true;
  }, [canvasId, flushPendingSnapshot, setEdges, setNodes]);

  useEffect(() => {
    if (!hasHydratedLocalSnapshotRef.current) return;

    pendingSnapshotRef.current = { canvasId, nodes, edges };

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const pendingSnapshot = pendingSnapshotRef.current;
      if (!pendingSnapshot) return;

      writeCanvasSnapshot(pendingSnapshot.canvasId, {
        nodes: pendingSnapshot.nodes,
        edges: pendingSnapshot.edges,
      });
      pendingSnapshotRef.current = null;
      timeoutRef.current = null;
    }, debounceMs);
  }, [canvasId, debounceMs, edges, nodes]);

  useEffect(() => {
    return () => flushPendingSnapshot();
  }, [flushPendingSnapshot]);

  useEffect(() => {
    window.addEventListener("beforeunload", flushPendingSnapshot);
    window.addEventListener("pagehide", flushPendingSnapshot);
    return () => {
      window.removeEventListener("beforeunload", flushPendingSnapshot);
      window.removeEventListener("pagehide", flushPendingSnapshot);
    };
  }, [flushPendingSnapshot]);
}
