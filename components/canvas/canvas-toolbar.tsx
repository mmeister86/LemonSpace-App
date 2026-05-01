"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas toolbar. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import {
  type RefObject,
  type ReactNode,
  useCallback,
  useEffect,
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
import {
  resolveToolbarSnapSide,
  useCanvasToolbarPlacement,
} from "@/components/canvas/canvas-toolbar-placement";
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

export { resolveToolbarSnapSide };

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

function CanvasToolbarNodeMenu({ onAddNode }: { onAddNode: (template: CanvasNodeTemplate) => void }) {
  const byCategory = catalogEntriesByCategory();

  return (
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
                      onAddNode(template);
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
  );
}

function ToolbarToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="size-9 shrink-0"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

function CanvasToolbarToolButtons({
  activeTool,
  canRedo,
  canUndo,
  favoriteCount,
  favoriteFilterActive,
  onFavoriteFilterChange,
  onRedo,
  onToolChange,
  onUndo,
}: Pick<
  CanvasToolbarProps,
  | "activeTool"
  | "canRedo"
  | "canUndo"
  | "favoriteCount"
  | "favoriteFilterActive"
  | "onFavoriteFilterChange"
  | "onRedo"
  | "onToolChange"
  | "onUndo"
>) {
  const favoritesLabel =
    typeof favoriteCount === "number"
      ? `Favoriten hervorheben (${favoriteCount})`
      : "Favoriten hervorheben";

  return (
    <>
      <ToolbarToolButton
        active={activeTool === "select"}
        icon={<MousePointer2 className="size-4" />}
        label="Auswahl (V) — schwenken: Leertaste gedrückt halten und ziehen"
        onClick={() => onToolChange("select")}
      />
      <ToolbarToolButton
        active={activeTool === "hand"}
        icon={<Hand className="size-4" />}
        label="Hand (H) — schwenken: Leertaste gedrückt halten und ziehen oder linke Maustaste"
        onClick={() => onToolChange("hand")}
      />
      <ToolbarToolButton
        active={activeTool === "scissor"}
        icon={<Scissors className="size-4" />}
        label="Schere (K) — Verbindungen kappen"
        onClick={() => onToolChange("scissor")}
      />

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
    </>
  );
}

function CanvasToolbarNameEditor({
  commitName,
  isEditingName,
  nameDraft,
  nameInputRef,
  orientation,
  resolvedCanvasName,
  setIsEditingName,
  setNameDraft,
  skipNextBlurCommitRef,
}: {
  commitName: (nextName?: string) => Promise<void>;
  isEditingName: boolean;
  nameDraft: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  orientation: "horizontal" | "vertical";
  resolvedCanvasName: string;
  setIsEditingName: (value: boolean) => void;
  setNameDraft: (value: string) => void;
  skipNextBlurCommitRef: { current: boolean };
}) {
  return isEditingName ? (
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
        orientation === "horizontal"
          ? "w-44 max-w-52"
          : "h-36 w-10 px-1 text-center [writing-mode:vertical-rl]",
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
  );
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
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const {
    activeSnapSide,
    handleDragPointerDown,
    hasCustomPosition,
    isDragging,
    orientation,
    position,
    toolbarRef,
    toolbarStyle,
  } = useCanvasToolbarPlacement(canvasId);
  const resolvedCanvasName = canvasName?.trim() || "Unbenannter Canvas";
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(resolvedCanvasName);

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

      <CanvasToolbarNodeMenu onAddNode={(template) => void handleAddNode(template)} />

      <CanvasToolbarToolButtons
        activeTool={activeTool}
        canRedo={canRedo}
        canUndo={canUndo}
        favoriteCount={favoriteCount}
        favoriteFilterActive={favoriteFilterActive}
        onFavoriteFilterChange={onFavoriteFilterChange}
        onRedo={onRedo}
        onToolChange={onToolChange}
        onUndo={onUndo}
      />

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
        <CanvasToolbarNameEditor
          commitName={commitName}
          isEditingName={isEditingName}
          nameDraft={nameDraft}
          nameInputRef={nameInputRef}
          orientation={orientation}
          resolvedCanvasName={resolvedCanvasName}
          setIsEditingName={setIsEditingName}
          setNameDraft={setNameDraft}
          skipNextBlurCommitRef={skipNextBlurCommitRef}
        />
        <div className={orientation === "vertical" ? "w-full" : undefined}>
          <CreditDisplay compact={orientation === "vertical"} />
        </div>
      </div>
      </motion.div>
    </>
  );
}
