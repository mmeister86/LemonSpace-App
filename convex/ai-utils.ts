type NodeCanvasRef = {
  canvasId: string;
};

export function assertNodeBelongsToCanvasOrThrow(node: NodeCanvasRef, canvasId: string): void {
  if (node.canvasId !== canvasId) {
    throw new Error("Node does not belong to canvas");
  }
}
