/**
 * Onboarding note:
 * Development-only Canvas diagnostics. Keep this side-effect-light and avoid logging stable control nodes unless explicitly needed.
 */

const CANVAS_DEBUG_EXCLUDED_NODE_TYPES = new Set(["group", "comment", "note"]);

export function shouldLogCanvasNodeDebug(nodeType: string | null | undefined): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    typeof nodeType === "string" &&
    !CANVAS_DEBUG_EXCLUDED_NODE_TYPES.has(nodeType)
  );
}

export function logCanvasDebug(
  event: string,
  payload: Record<string, unknown>,
  options?: {
    nodeType?: string | null;
    trace?: boolean;
  },
): void {
  if (process.env.NODE_ENV === "production") return;
  if (options?.nodeType !== undefined && !shouldLogCanvasNodeDebug(options.nodeType)) {
    return;
  }

  const nodeId = typeof payload.nodeId === "string" ? ` ${payload.nodeId}` : "";
  const nodeType = options?.nodeType ? ` (${options.nodeType})` : "";
  console.groupCollapsed(`[Canvas debug] ${event}${nodeId}${nodeType}`);
  console.info(payload);
  if (options?.trace) {
    console.trace(`[Canvas debug trace] ${event}${nodeId}${nodeType}`);
  }
  console.groupEnd();
}
