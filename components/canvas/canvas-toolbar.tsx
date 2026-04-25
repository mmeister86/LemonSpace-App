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
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  GripVertical,
  Hand,
  MessageSquare,
  MousePointer2,
  Plus,
  Redo2,
  Scissors,
  Star,
  Undo2,
} from "lucide-react";

import { CreditDisplay } from "@/components/canvas/credit-display";
import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCenteredFlowNodePosition } from "@/hooks/use-centered-flow-node-position";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NODE_CATEGORY_META,
  NODE_CATEGORIES_ORDERED,
  catalogEntriesByCategory,
  getTemplateForCatalogType,
  isNodePaletteEnabled,
  type NodeCategoryId,
} from "@/lib/canvas-node-catalog";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import { cn } from "@/lib/utils";

export type CanvasNavTool = "select" | "hand" | "scissor" | "comment";

interface CanvasToolbarProps {
  canvasId: Id<"canvases">;
  canvasName?: string;
  activeTool: CanvasNavTool;
  onToolChange: (tool: CanvasNavTool) => void;
  favoriteFilterActive?: boolean;
  onFavoriteFilterChange?: (active: boolean) => void;
  favoriteCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

type ToolbarDockSide = "free" | "top" | "right" | "bottom" | "left";

type ToolbarPosition = {
  x: number;
  y: number;
  side: ToolbarDockSide;
};

type ToolbarPlacementState = {
  position: ToolbarPosition;
  hasCustomPosition: boolean;
};

type ToolbarOrientation = "horizontal" | "vertical";

type DragState = {
  offsetX: number;
  offsetY: number;
  parentRect: DOMRect;
};

type Point = {
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

function isToolbarDockSide(value: unknown): value is ToolbarDockSide {
  return (
    value === "free" ||
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function readStoredToolbarPosition(canvasId: string): ToolbarPosition | null {
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

function writeStoredToolbarPosition(canvasId: string, position: ToolbarPosition): void {
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
  } satisfies Record<Exclude<ToolbarDockSide, "free">, { x: number; y: number }>;
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
  } satisfies Record<Exclude<ToolbarDockSide, "free">, SnapHitbox>;
}

function pointInRect(point: Point, rect: SnapHitbox): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function normalizeSnappedPosition(
  position: ToolbarPosition,
  parentRect: DOMRect,
): ToolbarPosition {
  if (position.side === "top" || position.side === "bottom") {
    return {
      ...position,
      x: parentRect.width / 2,
    };
  }
  return position;
}

export function resolveToolbarSnapSide(
  point: Point,
  parentRect: DOMRect,
): Exclude<ToolbarDockSide, "free"> | null {
  const hitboxes = snapHitboxes(parentRect);
  if (pointInRect(point, hitboxes.top)) return "top";
  if (pointInRect(point, hitboxes.right)) return "right";
  if (pointInRect(point, hitboxes.bottom)) return "bottom";
  if (pointInRect(point, hitboxes.left)) return "left";
  return null;
}

export default function CanvasToolbar({
  canvasId,
  canvasName,
  activeTool,
  onToolChange,
  favoriteFilterActive = false,
  onFavoriteFilterChange,
  favoriteCount,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: CanvasToolbarProps) {
  const { createNodeWithIntersection } = useCanvasPlacement();
  const getCenteredPosition = useCenteredFlowNodePosition();
  const renameCanvas = useMutation(api.canvases.update);
  const nodeCountRef = useRef(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const latestPointerPointRef = useRef<Point | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const activeSnapSideRef = useRef<Exclude<ToolbarDockSide, "free"> | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const resolvedCanvasName = canvasName?.trim() || "Unbenannter Canvas";
  const [placement, setPlacement] = useState<ToolbarPlacementState>(() =>
    getInitialToolbarPlacement(canvasId),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [activeSnapSide, setActiveSnapSide] =
    useState<Exclude<ToolbarDockSide, "free"> | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(resolvedCanvasName);
  const { position, hasCustomPosition } = placement;
  const latestPositionRef = useRef<ToolbarPosition>(position);
  const orientation: ToolbarOrientation =
    position.side === "left" || position.side === "right" ? "vertical" : "horizontal";

  const handleAddNode = async (template: CanvasNodeTemplate) => {
    const stagger = (nodeCountRef.current % 8) * 24;
    nodeCountRef.current += 1;
    await createNodeWithIntersection({
      type: template.type,
      position: getCenteredPosition(template.width, template.height, stagger),
      width: template.width,
      height: template.height,
      data: template.defaultData,
      clientRequestId: crypto.randomUUID(),
    });
  };

  useEffect(() => {
    if (!isEditingName) return;
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditingName]);

  const applyToolbarPosition = useCallback((nextPosition: ToolbarPosition) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.style.left = `${nextPosition.x}px`;
    toolbar.style.top = `${nextPosition.y}px`;
    toolbar.style.transform = "none";
  }, []);

  const persistPosition = useCallback(
    (nextPosition: ToolbarPosition) => {
      latestPositionRef.current = nextPosition;
      setPlacement({ position: nextPosition, hasCustomPosition: true });
      writeStoredToolbarPosition(canvasId, nextPosition);
    },
    [canvasId],
  );

  const clampPosition = useCallback(
    (nextPosition: ToolbarPosition, parentRect: DOMRect): ToolbarPosition => {
      const toolbarRect = toolbarRef.current?.getBoundingClientRect();
      const maxX = Math.max(TOOLBAR_MARGIN, parentRect.width - (toolbarRect?.width ?? 360) - TOOLBAR_MARGIN);
      const maxY = Math.max(TOOLBAR_MARGIN, parentRect.height - (toolbarRect?.height ?? 52) - TOOLBAR_MARGIN);
      return {
        ...nextPosition,
        x: clamp(nextPosition.x, TOOLBAR_MARGIN, maxX),
        y: clamp(nextPosition.y, TOOLBAR_MARGIN, maxY),
      };
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
          const target = snapTargets(dragState.parentRect)[side];
          persistPosition(normalizeSnappedPosition({ ...target, side }, dragState.parentRect));
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

  const commitName = useCallback(async (nextName = nameDraft) => {
    const trimmed = nextName.trim();
    if (!trimmed) {
      toast.error("Name fehlt", "Gib einen Namen für dein Projekt ein.");
      setNameDraft(resolvedCanvasName);
      return;
    }
    if (trimmed === resolvedCanvasName) {
      setIsEditingName(false);
      return;
    }
    try {
      await renameCanvas({ canvasId, name: trimmed });
      toast.success("Projekt umbenannt");
      setIsEditingName(false);
    } catch {
      toast.error("Umbenennen fehlgeschlagen");
    }
  }, [canvasId, nameDraft, renameCanvas, resolvedCanvasName]);

  const byCategory = catalogEntriesByCategory();
  const favoritesLabel =
    typeof favoriteCount === "number"
      ? `Favoriten hervorheben (${favoriteCount})`
      : "Favoriten hervorheben";

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

  const toolBtn = (tool: CanvasNavTool, icon: React.ReactNode, label: string) => (
    <Button
      type="button"
      size="icon"
      variant={activeTool === tool ? "secondary" : "ghost"}
      className="size-9 shrink-0"
      aria-label={label}
      title={label}
      aria-pressed={activeTool === tool}
      onClick={() => onToolChange(tool)}
    >
      {icon}
    </Button>
  );

  return (
    <>
      {isDragging ? (
        <div className="pointer-events-none absolute inset-4 z-[9] rounded-3xl border border-foreground/20">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <div
              key={side}
              data-testid={`canvas-toolbar-snap-${side}`}
              className={cn(
                "absolute rounded-lg border-2 border-dotted border-foreground/55 bg-background/10 transition-colors",
                activeSnapSide === side && "border-primary bg-primary/10",
                side === "top" &&
                  "top-10 left-1/2 h-8 w-[min(38rem,52vw)] -translate-x-1/2",
                side === "bottom" &&
                  "bottom-10 left-1/2 h-8 w-[min(38rem,52vw)] -translate-x-1/2",
                side === "left" && "top-1/2 left-10 h-[min(30rem,60vh)] w-8 -translate-y-1/2",
                side === "right" &&
                  "top-1/2 right-10 h-[min(30rem,60vh)] w-8 -translate-y-1/2",
              )}
            />
          ))}
        </div>
      ) : null}
      <motion.div
        ref={toolbarRef}
        layout
        data-testid="canvas-toolbar"
        data-side={position.side}
        data-orientation={orientation}
        style={toolbarStyle}
        className={cn(
          "absolute top-4 left-1/2 z-10 flex max-w-[calc(100vw-8rem)] gap-0.5 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-sm",
          orientation === "horizontal"
            ? "w-max -translate-x-1/2 items-center"
            : "w-16 translate-x-0 flex-col items-center gap-1 rounded-2xl p-1.5",
          hasCustomPosition && "left-auto translate-x-0",
        )}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
      >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          "size-9 shrink-0 cursor-grab active:cursor-grabbing",
          orientation === "vertical" && "rotate-90",
        )}
        data-testid="canvas-toolbar-drag-handle"
        aria-label="Toolbar verschieben"
        title="Toolbar verschieben"
        onPointerDown={handleDragPointerDown}
      >
        <GripVertical className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            aria-label="Knoten hinzufügen"
            title="Knoten hinzufügen"
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(24rem,70vh)] w-56 overflow-y-auto"
        >
          {NODE_CATEGORIES_ORDERED.map((categoryId: NodeCategoryId) => {
            const entries = byCategory.get(categoryId) ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={categoryId}>
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  {NODE_CATEGORY_META[categoryId].label}
                </DropdownMenuLabel>
                {entries.map((entry) => {
                  const template = getTemplateForCatalogType(entry.type);
                  const enabled = isNodePaletteEnabled(entry) && Boolean(template);
                  return (
                    <DropdownMenuItem
                      key={entry.type}
                      disabled={!enabled}
                      onSelect={() => {
                        if (!template) return;
                        void handleAddNode(template);
                      }}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {toolBtn(
        "select",
        <MousePointer2 className="size-4" />,
        "Auswahl (V) — schwenken: Leertaste gedrückt halten und ziehen",
      )}
      {toolBtn(
        "hand",
        <Hand className="size-4" />,
        "Hand (H) — schwenken: Leertaste gedrückt halten und ziehen oder linke Maustaste",
      )}
      {toolBtn("scissor", <Scissors className="size-4" />, "Schere (K) — Verbindungen kappen")}

      {onFavoriteFilterChange ? (
        <Button
          type="button"
          size="icon"
          variant={favoriteFilterActive ? "secondary" : "ghost"}
          className="size-9 shrink-0"
          aria-label={favoritesLabel}
          title={favoritesLabel}
          aria-pressed={favoriteFilterActive}
          onClick={() => onFavoriteFilterChange(!favoriteFilterActive)}
        >
          <Star className={favoriteFilterActive ? "size-4 fill-current" : "size-4"} />
        </Button>
      ) : null}

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0"
        disabled
        aria-label="Kommentar (folgt)"
        title="Kommentar — folgt"
      >
        <MessageSquare className="size-4 opacity-50" />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0"
        disabled={!canUndo}
        aria-label="Rückgängig"
        title="Rückgängig"
        onClick={onUndo}
      >
        <Undo2 className={cn("size-4", !canUndo && "opacity-50")} />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0"
        disabled={!canRedo}
        aria-label="Wiederholen"
        title="Wiederholen"
        onClick={onRedo}
      >
        <Redo2 className={cn("size-4", !canRedo && "opacity-50")} />
      </Button>

      <div
        className={cn(
          "shrink-0 bg-border/80",
          orientation === "horizontal" ? "mx-1 h-6 w-px" : "my-1 h-px w-6",
        )}
      />

      <div
        data-testid="canvas-toolbar-meta"
        className={cn(
          "flex min-w-0 items-center gap-1",
          orientation === "vertical" && "w-full flex-col",
        )}
      >
        {isEditingName ? (
          <input
            ref={nameInputRef}
            data-testid="canvas-toolbar-name-input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={(event) => {
              if (skipNextBlurCommitRef.current) {
                skipNextBlurCommitRef.current = false;
                return;
              }
              void commitName(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitName(event.currentTarget.value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                skipNextBlurCommitRef.current = true;
                setNameDraft(resolvedCanvasName);
                setIsEditingName(false);
              }
            }}
            className={cn(
              "min-w-0 rounded-lg border border-border/70 bg-background/90 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm outline-none ring-0 focus-visible:border-primary",
              orientation === "horizontal" ? "w-44 max-w-52" : "h-36 w-10 px-1 text-center [writing-mode:vertical-rl]",
            )}
            aria-label="Canvas-Name bearbeiten"
          />
        ) : (
          <button
            type="button"
            data-testid="canvas-toolbar-name"
            className={cn(
              "min-w-0 rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              orientation === "horizontal"
                ? "max-w-28 sm:max-w-40 md:max-w-52"
                : "h-36 w-10 max-w-10 px-1 text-center [writing-mode:vertical-rl]",
            )}
            title={resolvedCanvasName}
            aria-label={`Canvas-Name bearbeiten: ${resolvedCanvasName}`}
            onClick={() => {
              setNameDraft(resolvedCanvasName);
              setIsEditingName(true);
            }}
          >
            <span className={orientation === "vertical" ? "block max-h-32 truncate" : "block truncate"}>
              {resolvedCanvasName}
            </span>
          </button>
        )}
        <div className={orientation === "vertical" ? "w-full" : undefined}>
          <CreditDisplay compact={orientation === "vertical"} />
        </div>
      </div>
      </motion.div>
    </>
  );
}
