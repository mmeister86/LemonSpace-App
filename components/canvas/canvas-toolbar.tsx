"use client";

import { useRef } from "react";
import {
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

export type CanvasNavTool = "select" | "hand" | "scissor" | "comment";

interface CanvasToolbarProps {
  canvasName?: string;
  activeTool: CanvasNavTool;
  onToolChange: (tool: CanvasNavTool) => void;
  favoriteFilterActive?: boolean;
  onFavoriteFilterChange?: (active: boolean) => void;
  favoriteCount?: number;
}

export default function CanvasToolbar({
  canvasName,
  activeTool,
  onToolChange,
  favoriteFilterActive = false,
  onFavoriteFilterChange,
  favoriteCount,
}: CanvasToolbarProps) {
  const { createNodeWithIntersection } = useCanvasPlacement();
  const getCenteredPosition = useCenteredFlowNodePosition();
  const nodeCountRef = useRef(0);

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

  const byCategory = catalogEntriesByCategory();
  const resolvedCanvasName = canvasName?.trim() || "Unbenannter Canvas";
  const favoritesLabel =
    typeof favoriteCount === "number"
      ? `Favoriten hervorheben (${favoriteCount})`
      : "Favoriten hervorheben";

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
    <div className="absolute top-4 left-1/2 z-10 flex w-[min(calc(100vw-9rem),64rem)] items-center gap-0.5 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-sm -translate-x-1/2">
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
        disabled
        aria-label="Rückgängig (folgt)"
        title="Rückgängig — folgt"
      >
        <Undo2 className="size-4 opacity-50" />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0"
        disabled
        aria-label="Wiederholen (folgt)"
        title="Wiederholen — folgt"
      >
        <Redo2 className="size-4 opacity-50" />
      </Button>

      <div className="mx-1 h-6 w-px shrink-0 bg-border/80" />

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <div
          className="min-w-0 max-w-28 rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm sm:max-w-40 md:max-w-52"
          title={resolvedCanvasName}
          aria-label={`Canvas-Name: ${resolvedCanvasName}`}
        >
          <span className="block truncate">{resolvedCanvasName}</span>
        </div>
        <CreditDisplay />
      </div>
    </div>
  );
}
