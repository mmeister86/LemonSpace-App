"use client";

import { useRef } from "react";
import {
  Hand,
  MessageSquare,
  MousePointer2,
  Plus,
  Redo2,
  Scissors,
  Undo2,
} from "lucide-react";

import { CreditDisplay } from "@/components/canvas/credit-display";
import { ExportButton } from "@/components/canvas/export-button";
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
}

export default function CanvasToolbar({
  canvasName,
  activeTool,
  onToolChange,
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
    <div className="absolute top-4 left-1/2 z-10 flex max-w-[min(calc(100vw-12rem),52rem)] -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-sm">
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
            const creatable = entries.filter(isNodePaletteEnabled);
            if (creatable.length === 0) return null;
            return (
              <div key={categoryId}>
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  {NODE_CATEGORY_META[categoryId].label}
                </DropdownMenuLabel>
                {creatable.map((entry) => {
                  const template = getTemplateForCatalogType(entry.type);
                  if (!template) return null;
                  return (
                    <DropdownMenuItem
                      key={entry.type}
                      onSelect={() => void handleAddNode(template)}
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
      {toolBtn("scissor", <Scissors className="size-4" />, "Kanten schneiden")}

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

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:flex-initial">
        <CreditDisplay />
        <ExportButton canvasName={canvasName ?? "canvas"} />
      </div>
    </div>
  );
}
