"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge as RFEdge,
  type EdgeChange,
  type Node as RFNode,
  type NodeChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexEdgeToRF, convexNodeToRF } from "@/lib/canvas-utils";

import { nodeTypes } from "./node-types";

interface CanvasProps {
  canvasId: Id<"canvases">;
}

export default function Canvas({ canvasId }: CanvasProps) {
  const convexNodes = useQuery(api.nodes.list, { canvasId });
  const convexEdges = useQuery(api.edges.list, { canvasId });

  const moveNode = useMutation(api.nodes.move);
  const createEdge = useMutation(api.edges.create);
  const removeNode = useMutation(api.nodes.remove);
  const removeEdge = useMutation(api.edges.remove);

  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);

  const isDragging = useRef(false);

  useEffect(() => {
    if (!convexNodes) return;
    if (!isDragging.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNodes(convexNodes.map(convexNodeToRF));
    }
  }, [convexNodes]);

  useEffect(() => {
    if (!convexEdges) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges(convexEdges.map(convexEdgeToRF));
  }, [convexEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: RFNode) => {
      isDragging.current = false;
      void moveNode({
        nodeId: node.id as Id<"nodes">,
        positionX: node.position.x,
        positionY: node.position.y,
      });
    },
    [moveNode],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      void createEdge({
        canvasId,
        sourceNodeId: connection.source as Id<"nodes">,
        targetNodeId: connection.target as Id<"nodes">,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      });
    },
    [canvasId, createEdge],
  );

  const onNodesDelete = useCallback(
    (deletedNodes: RFNode[]) => {
      for (const node of deletedNodes) {
        void removeNode({ nodeId: node.id as Id<"nodes"> });
      }
    },
    [removeNode],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: RFEdge[]) => {
      for (const edge of deletedEdges) {
        void removeEdge({ edgeId: edge.id as Id<"edges"> });
      }
    },
    [removeEdge],
  );

  if (convexNodes === undefined || convexEdges === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Canvas laedt...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls className="rounded-lg! border! bg-card! shadow-sm!" />
        <MiniMap
          className="rounded-lg! border! bg-card! shadow-sm!"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
