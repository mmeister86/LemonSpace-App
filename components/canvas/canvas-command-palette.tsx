"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Frame,
  GitCompare,
  Image,
  Moon,
  Sparkles,
  StickyNote,
  Sun,
  Type,
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
import {
  CANVAS_NODE_TEMPLATES,
  type CanvasNodeTemplate,
} from "@/lib/canvas-node-templates";

const NODE_ICONS: Record<CanvasNodeTemplate["type"], LucideIcon> = {
  image: Image,
  text: Type,
  prompt: Sparkles,
  note: StickyNote,
  frame: Frame,
  compare: GitCompare,
};

const NODE_SEARCH_KEYWORDS: Partial<
  Record<CanvasNodeTemplate["type"], string[]>
> = {
  image: ["image", "photo", "foto"],
  text: ["text", "typo"],
  prompt: ["prompt", "ai", "generate"],
  note: ["note", "sticky", "notiz"],
  frame: ["frame", "artboard"],
  compare: ["compare", "before", "after"],
};

export function CanvasCommandPalette() {
  const [open, setOpen] = useState(false);
  const { createNodeWithIntersection } = useCanvasPlacement();
  const getCenteredPosition = useCenteredFlowNodePosition();
  const { setTheme } = useTheme();
  const nodeCountRef = useRef(0);

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

  const handleAddNode = (
    type: CanvasNodeTemplate["type"],
    data: CanvasNodeTemplate["defaultData"],
    width: number,
    height: number,
  ) => {
    const stagger = (nodeCountRef.current % 8) * 24;
    nodeCountRef.current += 1;
    setOpen(false);
    void createNodeWithIntersection({
      type,
      position: getCenteredPosition(width, height, stagger),
      width,
      height,
      data,
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
          <CommandGroup heading="Knoten">
            {CANVAS_NODE_TEMPLATES.map((template) => {
              const Icon = NODE_ICONS[template.type];
              return (
                <CommandItem
                  key={template.type}
                  keywords={NODE_SEARCH_KEYWORDS[template.type] ?? []}
                  onSelect={() =>
                    handleAddNode(
                      template.type,
                      template.defaultData,
                      template.width,
                      template.height,
                    )
                  }
                >
                  <Icon className="size-4" />
                  {template.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
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
