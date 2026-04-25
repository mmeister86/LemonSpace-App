"use client";

import {
  FolderOpen,
  Frame,
  Focus,
  GitCompare,
  Crop as CropIcon,
  ImageOff,
  Maximize2,
  Bot,
  ImageDown,
  Image,
  Package,
  Palette,
  Layers,
  Sparkles,
  StickyNote,
  Sun,
  Type,
  Video,
  Wand2,
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
  "ai-text": Sparkles,
  prompt: Sparkles,
  "video-prompt": Video,
  agent: Bot,
  note: StickyNote,
  frame: Frame,
  compare: GitCompare,
  group: FolderOpen,
  asset: Package,
  "asset-video": Video,
  video: Video,
  crop: CropIcon,
  "bg-remove": ImageOff,
  upscale: Maximize2,
  "style-transfer": Wand2,
  "face-restore": Sparkles,
  curves: Sparkles,
  "color-adjust": Palette,
  "light-adjust": Sun,
  "detail-adjust": Focus,
  render: ImageDown,
  mixer: Layers,
};

const NODE_SEARCH_KEYWORDS: Partial<
  Record<CanvasNodeTemplate["type"], string[]>
> = {
  image: ["image", "photo", "foto"],
  text: ["text", "typo"],
  "ai-text": ["text", "ai-text", "rewrite", "copy", "ki-text", "copywriting"],
  prompt: ["prompt", "ai", "generate", "ki-bild", "ki", "bild"],
  "video-prompt": ["video", "ai", "ki-video", "ki", "prompt"],
  agent: ["agent", "campaign", "distribution", "social"],
  note: ["note", "sticky", "notiz"],
  frame: ["frame", "artboard"],
  compare: ["compare", "before", "after", "vergleich"],
  group: ["group", "gruppe", "folder"],
  asset: ["asset", "freepik", "stock"],
  video: ["video", "upload", "clip", "mp4", "webm"],
  "asset-video": ["video", "pexels", "asset", "stock", "clip"],
  crop: ["crop", "resize", "ratio"],
  "bg-remove": ["background", "remove", "freistellen", "hintergrund"],
  upscale: ["upscale", "size", "resolution", "auflösung"],
  "style-transfer": ["style", "transfer", "look", "prompt"],
  "face-restore": ["face", "restore", "portrait", "gesicht"],
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
