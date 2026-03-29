"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bot,
  ClipboardList,
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
  Moon,
  Package,
  Palette,
  Presentation,
  Repeat,
  Sparkles,
  Split,
  StickyNote,
  Sun,
  Type,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCenteredFlowNodePosition } from "@/hooks/use-centered-flow-node-position";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import {
  NODE_CATEGORY_META,
  NODE_CATEGORIES_ORDERED,
  catalogEntriesByCategory,
  getTemplateForCatalogType,
  isNodePaletteEnabled,
} from "@/lib/canvas-node-catalog";

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
  curves: Sparkles,
  "color-adjust": Palette,
  "light-adjust": Sparkles,
  "detail-adjust": Wand2,
  render: Image,
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

export function CanvasCommandPalette() {
  const [open, setOpen] = useState(false);
  const { createNodeWithIntersection } = useCanvasPlacement();
  const getCenteredPosition = useCenteredFlowNodePosition();
  const { setTheme } = useTheme();
  const nodeCountRef = useRef(0);
  const byCategory = catalogEntriesByCategory();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAddNode = (template: CanvasNodeTemplate) => {
    const stagger = (nodeCountRef.current % 8) * 24;
    nodeCountRef.current += 1;
    setOpen(false);
    void createNodeWithIntersection({
      type: template.type,
      position: getCenteredPosition(template.width, template.height, stagger),
      width: template.width,
      height: template.height,
      data: template.defaultData,
      clientRequestId: crypto.randomUUID(),
    }).catch((error) => {
      console.error("[CanvasCommandPalette] createNode failed", error);
    });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Befehle"
      description="Knoten hinzufuegen oder Erscheinungsbild aendern"
    >
      <Command>
        <CommandInput placeholder="Suchen …" />
        <CommandList>
          <CommandEmpty>Keine Treffer.</CommandEmpty>
          {NODE_CATEGORIES_ORDERED.map((categoryId) => {
            const entries = byCategory.get(categoryId) ?? [];
            if (entries.length === 0) return null;
            return (
              <CommandGroup
                key={categoryId}
                heading={NODE_CATEGORY_META[categoryId].label}
              >
                {entries.map((entry) => {
                  const template = getTemplateForCatalogType(entry.type);
                  const enabled = isNodePaletteEnabled(entry) && Boolean(template);
                  const Icon = CATALOG_ICONS[entry.type] ?? ClipboardList;
                  return (
                    <CommandItem
                      key={entry.type}
                      disabled={!enabled}
                      keywords={[
                        entry.label,
                        entry.type,
                        NODE_CATEGORY_META[categoryId].label,
                      ]}
                      onSelect={() => {
                        if (!template) return;
                        handleAddNode(template);
                      }}
                    >
                      <Icon className="size-4" />
                      {entry.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
          <CommandSeparator />
          <CommandGroup heading="Erscheinungsbild">
            <CommandItem
              keywords={["light", "hell", "day"]}
              onSelect={() => {
                setTheme("light");
                setOpen(false);
              }}
            >
              <Sun className="size-4" />
              Hell
            </CommandItem>
            <CommandItem
              keywords={["dark", "dunkel", "night"]}
              onSelect={() => {
                setTheme("dark");
                setOpen(false);
              }}
            >
              <Moon className="size-4" />
              Dunkel
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono tracking-wide">⌘K · Ctrl+K</span>
          <span className="ml-2">Palette umschalten</span>
        </div>
      </Command>
    </CommandDialog>
  );
}
