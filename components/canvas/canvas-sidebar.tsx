"use client";

import { useState } from "react";
import {
  Bot,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Crop,
  FolderOpen,
  Frame,
  Focus,
  GitBranch,
  GitCompare,
  Image,
  ImageDown,
  ImageOff,
  Layers,
  LayoutPanelTop,
  MessageSquare,
  Package,
  Palette,
  Presentation,
  Repeat,
  Sparkles,
  Split,
  StickyNote,
  Sun,
  TrendingUp,
  Type,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { CanvasUserMenu } from "@/components/canvas/canvas-user-menu";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  NODE_CATEGORY_META,
  NODE_CATEGORIES_ORDERED,
  catalogEntriesByCategory,
  isNodePaletteEnabled,
  type NodeCatalogEntry,
} from "@/lib/canvas-node-catalog";
import { cn } from "@/lib/utils";

const CATALOG_ICONS: Partial<Record<string, LucideIcon>> = {
  image: Image,
  text: Type,
  prompt: Sparkles,
  color: Palette,
  video: Video,
  asset: Package,
  "ai-image": Sparkles,
  "ai-text": Type,
  "ai-video": Video,
  "agent-output": Bot,
  crop: Crop,
  "bg-remove": ImageOff,
  upscale: Wand2,
  "style-transfer": Wand2,
  "face-restore": Sparkles,
  curves: TrendingUp,
  "color-adjust": Palette,
  "light-adjust": Sun,
  "detail-adjust": Focus,
  render: ImageDown,
  splitter: Split,
  loop: Repeat,
  agent: Bot,
  mixer: Layers,
  switch: GitBranch,
  group: FolderOpen,
  frame: Frame,
  note: StickyNote,
  "text-overlay": LayoutPanelTop,
  compare: GitCompare,
  comment: MessageSquare,
  presentation: Presentation,
};

function SidebarRow({ entry }: { entry: NodeCatalogEntry }) {
  const enabled = isNodePaletteEnabled(entry);
  const Icon = CATALOG_ICONS[entry.type] ?? ClipboardList;

  const onDragStart = (event: React.DragEvent) => {
    if (!enabled) return;
    event.dataTransfer.setData("application/lemonspace-node-type", entry.type);
    event.dataTransfer.effectAllowed = "move";
  };

  const hint = entry.disabledHint ?? "Noch nicht verfügbar";

  return (
    <div
      draggable={enabled}
      onDragStart={onDragStart}
      title={enabled ? `${entry.label} — auf den Canvas ziehen` : hint}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
        enabled
          ? "cursor-grab border-border/80 bg-card hover:bg-accent active:cursor-grabbing"
          : "cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.phase > 1 ? (
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground/80">
          P{entry.phase}
        </span>
      ) : null}
    </div>
  );
}

type CanvasSidebarProps = {
  canvasId: Id<"canvases">;
};

export default function CanvasSidebar({ canvasId }: CanvasSidebarProps) {
  const canvas = useAuthQuery(api.canvases.get, { canvasId });
  const byCategory = catalogEntriesByCategory();
  const [collapsedByCategory, setCollapsedByCategory] = useState<
    Partial<Record<(typeof NODE_CATEGORIES_ORDERED)[number], boolean>>
  >(() =>
    Object.fromEntries(
      NODE_CATEGORIES_ORDERED.map((categoryId) => [categoryId, categoryId !== "source"]),
    ),
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/80 bg-background">
      <div className="border-b border-border/80 px-4 py-4">
        {canvas === undefined ? (
          <div className="h-12 animate-pulse rounded-md bg-muted/50" />
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Canvas
            </p>
            <h1 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-foreground">
              {canvas?.name ?? "…"}
            </h1>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {NODE_CATEGORIES_ORDERED.map((categoryId) => {
          const entries = byCategory.get(categoryId) ?? [];
          if (entries.length === 0) return null;
          const { label } = NODE_CATEGORY_META[categoryId];
          const isCollapsed = collapsedByCategory[categoryId] ?? categoryId !== "source";
          return (
            <div key={categoryId} className="mb-4 last:mb-0">
              <button
                type="button"
                onClick={() =>
                  setCollapsedByCategory((prev) => ({
                    ...prev,
                    [categoryId]: !(prev[categoryId] ?? categoryId !== "source"),
                  }))
                }
                className="mb-2 flex w-full items-center justify-between rounded-md px-0.5 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                aria-expanded={!isCollapsed}
                aria-controls={`sidebar-category-${categoryId}`}
              >
                <span>{label}</span>
                {isCollapsed ? (
                  <ChevronRight className="size-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0" />
                )}
              </button>
              {!isCollapsed ? (
                <div id={`sidebar-category-${categoryId}`} className="flex flex-col gap-1.5">
                  {entries.map((entry) => (
                    <SidebarRow key={entry.type} entry={entry} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <CanvasUserMenu />
    </aside>
  );
}
