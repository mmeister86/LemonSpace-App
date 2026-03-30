"use client";

import {
  FolderOpen,
  Focus,
  Frame,
  GitCompare,
  Image,
  ImageDown,
  Package,
  Sparkles,
  StickyNote,
  Sun,
  TrendingUp,
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
  curves: TrendingUp,
  "color-adjust": Sparkles,
  "light-adjust": Sun,
  "detail-adjust": Focus,
  render: ImageDown,
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
  curves: ["kurven", "curve", "tones"],
  "color-adjust": ["farbe", "color", "hsl", "balance"],
  "light-adjust": ["licht", "light", "exposure", "contrast"],
  "detail-adjust": ["detail", "sharpen", "grain", "denoise"],
  render: ["render", "export", "output"],
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
