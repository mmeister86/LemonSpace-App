"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CanvasToolbarDockSide = "free" | "top" | "right" | "bottom" | "left";

export type CanvasToolbarPosition = {
  x: number;
  y: number;
  side: CanvasToolbarDockSide;
};

type ToolbarPlacementState = {
  position: CanvasToolbarPosition;
  hasCustomPosition: boolean;
};

export type CanvasToolbarOrientation = "horizontal" | "vertical";

type DragState = {
  offsetX: number;
  offsetY: number;
  parentRect: DOMRect;
};

export type CanvasToolbarPoint = {
  x: number;
  y: number;
};

type SnapHitbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const TOOLBAR_STORAGE_VERSION = 1;
const TOOLBAR_MARGIN = 16;
const VERTICAL_TOOLBAR_WIDTH = 64;
const VERTICAL_TOOLBAR_HEIGHT_ESTIMATE = 520;
const SNAP_HITBOX_THICKNESS = 96;
const SNAP_HITBOX_MAX_LENGTH = 608;

function toolbarStorageKey(canvasId: string): string {
  return `lemonspace.canvas:toolbar:v${TOOLBAR_STORAGE_VERSION}:${canvasId}`;
}

function isToolbarDockSide(value: unknown): value is CanvasToolbarDockSide {
  return (
    value === "free" ||
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function readStoredToolbarPosition(canvasId: string): CanvasToolbarPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(toolbarStorageKey(canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      position?: { x?: unknown; y?: unknown; side?: unknown };
    };
    const position = parsed.position;
    if (
      parsed.version !== TOOLBAR_STORAGE_VERSION ||
      !position ||
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      !isToolbarDockSide(position.side)
    ) {
      return null;
    }
    return { x: position.x, y: position.y, side: position.side };
  } catch {
    return null;
  }
}

function writeStoredToolbarPosition(canvasId: string, position: CanvasToolbarPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      toolbarStorageKey(canvasId),
      JSON.stringify({
        version: TOOLBAR_STORAGE_VERSION,
        updatedAt: Date.now(),
        position,
      }),
    );
  } catch {
    // Ignore storage failures for optional UI placement persistence.
  }
}

function getInitialToolbarPlacement(canvasId: string): ToolbarPlacementState {
  const storedPosition = readStoredToolbarPosition(canvasId);
  if (storedPosition) {
    return { position: storedPosition, hasCustomPosition: true };
  }
  return {
    position: { x: 0, y: TOOLBAR_MARGIN, side: "top" },
    hasCustomPosition: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapTargets(parentRect: DOMRect, toolbarRect?: DOMRect) {
  const width = toolbarRect?.width ?? 360;
  const height = toolbarRect?.height ?? 52;
  const centerX = parentRect.width / 2 - width / 2;
  const verticalHeight = Math.min(
    VERTICAL_TOOLBAR_HEIGHT_ESTIMATE,
    Math.max(height, parentRect.height - TOOLBAR_MARGIN * 2),
  );
  const verticalCenterY = parentRect.height / 2 - verticalHeight / 2;

  return {
    top: { x: centerX, y: TOOLBAR_MARGIN },
    right: {
      x: parentRect.width - VERTICAL_TOOLBAR_WIDTH - TOOLBAR_MARGIN,
      y: verticalCenterY,
    },
    bottom: { x: centerX, y: parentRect.height - height - TOOLBAR_MARGIN },
    left: { x: TOOLBAR_MARGIN, y: verticalCenterY },
  } satisfies Record<Exclude<CanvasToolbarDockSide, "free">, { x: number; y: number }>;
}

function snapHitboxes(parentRect: DOMRect) {
  const horizontalWidth = Math.min(SNAP_HITBOX_MAX_LENGTH, parentRect.width * 0.52);
  const verticalHeight = Math.min(SNAP_HITBOX_MAX_LENGTH, parentRect.height * 0.6);

  return {
    top: {
      x: parentRect.width / 2 - horizontalWidth / 2,
      y: TOOLBAR_MARGIN,
      width: horizontalWidth,
      height: SNAP_HITBOX_THICKNESS,
    },
    right: {
      x: parentRect.width - TOOLBAR_MARGIN - SNAP_HITBOX_THICKNESS,
      y: parentRect.height / 2 - verticalHeight / 2,
      width: SNAP_HITBOX_THICKNESS,
      height: verticalHeight,
    },
    bottom: {
      x: parentRect.width / 2 - horizontalWidth / 2,
      y: parentRect.height - TOOLBAR_MARGIN - SNAP_HITBOX_THICKNESS,
      width: horizontalWidth,
      height: SNAP_HITBOX_THICKNESS,
    },
    left: {
      x: TOOLBAR_MARGIN,
      y: parentRect.height / 2 - verticalHeight / 2,
      width: SNAP_HITBOX_THICKNESS,
      height: verticalHeight,
    },
  } satisfies Record<Exclude<CanvasToolbarDockSide, "free">, SnapHitbox>;
}

function pointInRect(point: CanvasToolbarPoint, rect: SnapHitbox): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function getToolbarSnapTarget(
  side: Exclude<CanvasToolbarDockSide, "free">,
  parentRect: DOMRect,
  toolbarRect?: DOMRect,
): CanvasToolbarPosition {
  return { ...snapTargets(parentRect, toolbarRect)[side], side };
}

export function clampToolbarPosition(
  position: CanvasToolbarPosition,
  parentRect: DOMRect,
  toolbarRect?: DOMRect,
): CanvasToolbarPosition {
  const maxX = Math.max(
    TOOLBAR_MARGIN,
    parentRect.width - (toolbarRect?.width ?? 360) - TOOLBAR_MARGIN,
  );
  const maxY = Math.max(
    TOOLBAR_MARGIN,
    parentRect.height - (toolbarRect?.height ?? 52) - TOOLBAR_MARGIN,
  );
  return {
    ...position,
    x: clamp(position.x, TOOLBAR_MARGIN, maxX),
    y: clamp(position.y, TOOLBAR_MARGIN, maxY),
  };
}

export function normalizeSnappedToolbarPosition(
  position: CanvasToolbarPosition,
  parentRect: DOMRect,
): CanvasToolbarPosition {
  if (position.side === "top" || position.side === "bottom") {
    return {
      ...position,
      x: parentRect.width / 2,
    };
  }
  return position;
}

export function resolveToolbarSnapSide(
  point: CanvasToolbarPoint,
  parentRect: DOMRect,
): Exclude<CanvasToolbarDockSide, "free"> | null {
  const hitboxes = snapHitboxes(parentRect);
  if (pointInRect(point, hitboxes.top)) return "top";
  if (pointInRect(point, hitboxes.right)) return "right";
  if (pointInRect(point, hitboxes.bottom)) return "bottom";
  if (pointInRect(point, hitboxes.left)) return "left";
  return null;
}

export function useCanvasToolbarPlacement(canvasId: string) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const latestPointerPointRef = useRef<CanvasToolbarPoint | null>(null);
  const activeSnapSideRef = useRef<Exclude<CanvasToolbarDockSide, "free"> | null>(null);
  const [placement, setPlacement] = useState<ToolbarPlacementState>(() =>
    getInitialToolbarPlacement(canvasId),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [activeSnapSide, setActiveSnapSide] =
    useState<Exclude<CanvasToolbarDockSide, "free"> | null>(null);
  const { position, hasCustomPosition } = placement;
  const latestPositionRef = useRef<CanvasToolbarPosition>(position);
  const orientation: CanvasToolbarOrientation =
    position.side === "left" || position.side === "right" ? "vertical" : "horizontal";

  const applyToolbarPosition = useCallback((nextPosition: CanvasToolbarPosition) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.style.left = `${nextPosition.x}px`;
    toolbar.style.top = `${nextPosition.y}px`;
    toolbar.style.transform = "none";
  }, []);

  const persistPosition = useCallback(
    (nextPosition: CanvasToolbarPosition) => {
      latestPositionRef.current = nextPosition;
      setPlacement({ position: nextPosition, hasCustomPosition: true });
      writeStoredToolbarPosition(canvasId, nextPosition);
    },
    [canvasId],
  );

  const clampPosition = useCallback(
    (nextPosition: CanvasToolbarPosition, parentRect: DOMRect): CanvasToolbarPosition => {
      return clampToolbarPosition(nextPosition, parentRect, toolbarRef.current?.getBoundingClientRect());
    },
    [],
  );

  const handleDragPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const toolbar = toolbarRef.current;
    const parent = toolbar?.parentElement;
    if (!toolbar || !parent) return;
    event.preventDefault();
    event.stopPropagation();

    const toolbarRect = toolbar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    latestPointerPointRef.current = {
      x: event.clientX - parentRect.left,
      y: event.clientY - parentRect.top,
    };
    dragStateRef.current = {
      offsetX: event.clientX - toolbarRect.left,
      offsetY: event.clientY - toolbarRect.top,
      parentRect,
    };
    setIsDragging(true);
    const nextPosition = {
      x: toolbarRect.left - parentRect.left,
      y: toolbarRect.top - parentRect.top,
      side: "free" as const,
    };
    latestPositionRef.current = nextPosition;
    setPlacement({
      position: nextPosition,
      hasCustomPosition: true,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const nextPosition = clampPosition(
        {
          x: event.clientX - dragState.parentRect.left - dragState.offsetX,
          y: event.clientY - dragState.parentRect.top - dragState.offsetY,
          side: "free",
        },
        dragState.parentRect,
      );
      latestPositionRef.current = nextPosition;
      const nextPointerPoint = {
        x: event.clientX - dragState.parentRect.left,
        y: event.clientY - dragState.parentRect.top,
      };
      latestPointerPointRef.current = nextPointerPoint;
      if (dragFrameRef.current === null) {
        dragFrameRef.current = window.requestAnimationFrame(() => {
          dragFrameRef.current = null;
          applyToolbarPosition(latestPositionRef.current);
        });
      }

      const nextSnapSide = resolveToolbarSnapSide(nextPointerPoint, dragState.parentRect);
      if (nextSnapSide !== activeSnapSideRef.current) {
        activeSnapSideRef.current = nextSnapSide;
        setActiveSnapSide(nextSnapSide);
      }
    };

    const handlePointerUp = () => {
      const dragState = dragStateRef.current;
      const latestPosition = latestPositionRef.current;
      const latestPointerPoint = latestPointerPointRef.current;
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      if (dragState && latestPosition && latestPointerPoint) {
        const side = resolveToolbarSnapSide(latestPointerPoint, dragState.parentRect);
        if (side) {
          const target = getToolbarSnapTarget(
            side,
            dragState.parentRect,
            toolbarRef.current?.getBoundingClientRect(),
          );
          persistPosition(normalizeSnappedToolbarPosition(target, dragState.parentRect));
        } else {
          persistPosition(clampPosition({ ...latestPosition, side: "free" }, dragState.parentRect));
        }
      }
      dragStateRef.current = null;
      latestPointerPointRef.current = null;
      activeSnapSideRef.current = null;
      setActiveSnapSide(null);
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
  }, [applyToolbarPosition, clampPosition, isDragging, persistPosition]);

  const toolbarStyle = useMemo<CSSProperties>(() => {
    if (!hasCustomPosition && position.side === "top") {
      return {};
    }
    if (position.side === "top" && !hasCustomPosition) {
      return {};
    }
    if (position.side === "top" || position.side === "bottom") {
      return {
        left: 0,
        right: 0,
        top: position.y,
        marginInline: "auto",
        transform: "none",
      };
    }
    return {
      left: position.x,
      top: position.y,
      transform: "none",
    };
  }, [hasCustomPosition, position.side, position.x, position.y]);

  return {
    activeSnapSide,
    handleDragPointerDown,
    hasCustomPosition,
    isDragging,
    orientation,
    position,
    toolbarRef,
    toolbarStyle,
  };
}
