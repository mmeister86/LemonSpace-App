"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas sidebar. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import { useState } from "react";
import NextImage from "next/image";
import {
  Bot,
  Camera,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Crop,
  FolderOpen,
  Frame,
  GitBranch,
  GitCompare,
  Image,
  ImageOff,
  Layers,
  LayoutPanelTop,
  MessageSquare,
  Package,
  Palette,
  Presentation,
  Repeat,
  Sparkles,
  StickyNote,
  Type,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { CanvasUserMenu } from "@/components/canvas/canvas-user-menu";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import type { Id } from "@/convex/_generated/dataModel";
import {
  NODE_CATEGORY_META,
  NODE_CATEGORIES_ORDERED,
  catalogEntriesByCategory,
  isNodePaletteEnabled,
  type NodeCatalogEntry,
} from "@/lib/canvas-node-catalog";
import { CANVAS_NODE_DND_MIME } from "@/lib/canvas-connection-policy";
import { cn } from "@/lib/utils";

const CATALOG_ICONS: Partial<Record<string, LucideIcon>> = {
  image: Image,
  text: Type,
  prompt: Sparkles,
  "video-prompt": Video,
  color: Palette,
  video: Video,
  "asset-video": Video,
  asset: Package,
  "ai-image": Sparkles,
  "ai-text": Type,
  "ai-text-output": Type,
  "ai-video": Video,
  "agent-output": Bot,
  crop: Crop,
  "bg-remove": ImageOff,
  upscale: Wand2,
  "style-transfer": Wand2,
  "face-restore": Sparkles,
  "change-camera": Camera,
  curves: Sparkles,
  "color-adjust": Palette,
  "light-adjust": Sparkles,
  "detail-adjust": Wand2,
  render: Image,
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

function SidebarRow({
  entry,
  compact = false,
}: {
  entry: NodeCatalogEntry;
  compact?: boolean;
}) {
  const enabled = isNodePaletteEnabled(entry);
  const Icon = CATALOG_ICONS[entry.type] ?? ClipboardList;

  const onDragStart = (event: React.DragEvent) => {
    if (!enabled) return;
    event.dataTransfer.setData(CANVAS_NODE_DND_MIME, entry.type);
    event.dataTransfer.effectAllowed = "move";
  };

  const hint = entry.disabledHint ?? "Noch nicht verfügbar";

  return (
    <div
      draggable={enabled}
      onDragStart={onDragStart}
      title={enabled ? `${entry.label} — auf den Canvas ziehen` : hint}
      className={cn(
        "rounded-lg border transition-colors",
        compact
          ? "flex aspect-square min-h-0 w-full items-center justify-center rounded-md p-0"
          : "flex items-center gap-2 px-3 py-2 text-sm",
        enabled
          ? "cursor-grab border-border/80 bg-card hover:bg-accent active:cursor-grabbing"
          : "cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground",
      )}
    >
      <Icon className={cn("shrink-0 opacity-80", compact ? "size-[1.3rem]" : "size-4")} />
      {!compact ? <span className="min-w-0 flex-1 truncate">{entry.label}</span> : null}
      {compact ? <span className="sr-only">{entry.label}</span> : null}
    </div>
  );
}

type CanvasSidebarProps = {
  canvasId: Id<"canvases">;
  railMode?: boolean;
};

export default function CanvasSidebar({
  canvasId,
  railMode = false,
}: CanvasSidebarProps) {
  void canvasId;
  const byCategory = catalogEntriesByCategory();
  const [collapsedByCategory, setCollapsedByCategory] = useState<
    Partial<Record<(typeof NODE_CATEGORIES_ORDERED)[number], boolean>>
  >(() =>
    Object.fromEntries(
      NODE_CATEGORIES_ORDERED.map((categoryId) => [categoryId, false]),
    ),
  );

  return (
    <aside className="flex h-full w-full min-w-0 overflow-hidden flex-col border-r border-border/80 bg-background">
      {railMode ? (
        <div className="border-b border-border/80 px-2 py-3">
          <div className="flex items-center justify-center">
            <div className="relative">
              <NextImage
                src="/logos/lemonspace-logo-v2-black-rgb.svg"
                alt="LemonSpace"
                width={74}
                height={14}
                className="h-auto w-[4.625rem] dark:hidden"
                priority
              />
              <NextImage
                src="/logos/lemonspace-logo-v2-white-rgb.svg"
                alt="LemonSpace"
                width={74}
                height={14}
                className="hidden h-auto w-[4.625rem] dark:block"
                priority
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="border-b border-border/80 px-4 py-5">
          <div className="flex min-h-8 items-center">
            <div className="relative">
              <NextImage
                src="/logos/lemonspace-logo-v2-black-rgb.svg"
                alt="LemonSpace"
                width={140}
                height={27}
                className="h-auto w-[8.75rem] dark:hidden"
                priority
              />
              <NextImage
                src="/logos/lemonspace-logo-v2-white-rgb.svg"
                alt="LemonSpace"
                width={140}
                height={27}
                className="hidden h-auto w-[8.75rem] dark:block"
                priority
              />
            </div>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "h-full overflow-y-auto overscroll-contain",
            railMode ? "px-2 py-2 pb-20" : "p-3 pb-28",
          )}
        >
          {railMode ? (
            <div className="flex flex-col gap-3">
              {NODE_CATEGORIES_ORDERED.map((categoryId, index) => {
                const entries = (byCategory.get(categoryId) ?? []).filter(
                  (entry) => !entry.systemOutput && entry.type !== "splitter",
                );
                if (entries.length === 0) return null;
                return (
                  <section
                    key={categoryId}
                    className={cn("space-y-1.5", index === 0 ? "pt-0" : "border-t border-border/70 pt-2")}
                  >
                    {index > 0 ? (
                      <div data-testid={`sidebar-rail-category-${categoryId}-divider`} aria-hidden="true" />
                    ) : null}
                    <div
                      data-testid={`sidebar-rail-category-${categoryId}-grid`}
                      className="grid grid-cols-2 gap-1"
                    >
                      {entries.map((entry) => (
                        <SidebarRow key={entry.type} entry={entry} compact />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <>
              {NODE_CATEGORIES_ORDERED.map((categoryId) => {
                const entries = (byCategory.get(categoryId) ?? []).filter(
                  (entry) => !entry.systemOutput && entry.type !== "splitter",
                );
                if (entries.length === 0) return null;
                const { label } = NODE_CATEGORY_META[categoryId];
                const isCollapsed = collapsedByCategory[categoryId] ?? false;
                return (
                  <div key={categoryId} className="mb-4 last:mb-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedByCategory((prev) => ({
                          ...prev,
                          [categoryId]: !(prev[categoryId] ?? false),
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
            </>
          )}
        </div>
        <div aria-hidden="true">
          <ProgressiveBlur
            position="bottom"
            height={railMode ? "4rem" : "6rem"}
            blurLevels={[0.5, 1, 2, 4, 8, 12, 16, 24]}
          />
        </div>
      </div>

      <div className="relative z-20 bg-background">
        <CanvasUserMenu compact={railMode} />
      </div>
    </aside>
  );
}
