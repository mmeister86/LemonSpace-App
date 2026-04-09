"use client";

import {
  FolderOpen,
  Frame,
  Focus,
  GitCompare,
  Crop as CropIcon,
  Bot,
  ImageDown,
  Image,
  Package,
  Palette,
  Sparkles,
  StickyNote,
  Sun,
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
  "video-prompt": Video,
  agent: Bot,
  note: StickyNote,
  frame: Frame,
  compare: GitCompare,
  group: FolderOpen,
  asset: Package,
  video: Video,
  crop: CropIcon,
  curves: Sparkles,
  "color-adjust": Palette,
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
  "video-prompt": ["video", "ai", "ki-video", "ki", "prompt"],
  agent: ["agent", "campaign", "distribution", "social"],
  note: ["note", "sticky", "notiz"],
  frame: ["frame", "artboard"],
  compare: ["compare", "before", "after", "vergleich"],
  group: ["group", "gruppe", "folder"],
  asset: ["asset", "freepik", "stock"],
  video: ["video", "pexels", "clip"],
  crop: ["crop", "resize", "ratio"],
  curves: ["curves", "tone", "contrast"],
  "color-adjust": ["color", "hue", "saturation"],
  "light-adjust": ["light", "exposure", "brightness"],
  "detail-adjust": ["detail", "sharp", "grain"],
  render: ["render", "export", "download"],
};

export type CanvasNodeTemplatePickerProps = {
  onPick: (template: CanvasNodeTemplate) => void;
  groupHeading?: string;
  templates?: readonly CanvasNodeTemplate[];
};

/**
 * Knoten-Template-Liste für cmdk. Eltern: `<Command><CommandInput/><CommandList><CommandEmpty/> <CanvasNodeTemplatePicker /> …`.
 */
export function CanvasNodeTemplatePicker({
  onPick,
  groupHeading = "Knoten",
  templates = CANVAS_NODE_TEMPLATES,
}: CanvasNodeTemplatePickerProps) {
  return (
    <CommandGroup heading={groupHeading}>
      {templates.map((template) => {
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
