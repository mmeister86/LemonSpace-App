"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { CanvasNodeTemplatePicker } from "@/components/canvas/canvas-node-template-picker";
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
          <CanvasNodeTemplatePicker onPick={handleAddNode} />
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
