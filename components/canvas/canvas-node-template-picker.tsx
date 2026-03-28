"use client";

import {
  FolderOpen,
  Frame,
  GitCompare,
  Image,
  Package,
  Sparkles,
  StickyNote,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";

import { CommandGroup, CommandItem } from "@/components/ui/command";
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
  group: FolderOpen,
  asset: Package,
  video: Video,
};

const NODE_SEARCH_KEYWORDS: Partial<
  Record<CanvasNodeTemplate["type"], string[]>
> = {
  image: ["image", "photo", "foto"],
  text: ["text", "typo"],
  prompt: ["prompt", "ai", "generate", "ki-bild", "ki", "bild"],
  note: ["note", "sticky", "notiz"],
  frame: ["frame", "artboard"],
  compare: ["compare", "before", "after", "vergleich"],
  group: ["group", "gruppe", "folder"],
  asset: ["asset", "freepik", "stock"],
  video: ["video", "pexels", "clip"],
};

export type CanvasNodeTemplatePickerProps = {
  onPick: (template: CanvasNodeTemplate) => void;
  groupHeading?: string;
};

/**
 * Knoten-Template-Liste für cmdk. Eltern: `<Command><CommandInput/><CommandList><CommandEmpty/> <CanvasNodeTemplatePicker /> …`.
 */
export function CanvasNodeTemplatePicker({
  onPick,
  groupHeading = "Knoten",
}: CanvasNodeTemplatePickerProps) {
  return (
    <CommandGroup heading={groupHeading}>
      {CANVAS_NODE_TEMPLATES.map((template) => {
        const Icon = NODE_ICONS[template.type];
        return (
          <CommandItem
            key={template.type}
            keywords={NODE_SEARCH_KEYWORDS[template.type] ?? []}
            onSelect={() => onPick(template)}
          >
            <Icon className="size-4" />
            {template.label}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
