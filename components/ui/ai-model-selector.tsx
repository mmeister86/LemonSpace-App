"use client";

/**
 * Onboarding note:
 * Local HextaUI-derived AI model selector. Keep it keyboard-searchable, Canvas-friendly,
 * and free of global shortcuts because the Canvas command palette owns Cmd/Ctrl+K.
 */

import { Bot, Check, ChevronDown, Cpu, ImageIcon, Search, Sparkles, Video, Zap } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AIModelProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "mistral"
  | "black-forest-labs"
  | "sourceful"
  | "bytedance"
  | "wan"
  | "kling"
  | "unknown";

export type AIModelFeature = "fast" | "turbo" | "reasoning" | "multimodal" | "long-context" | "image" | "video";

export interface AIModelSelectorItem {
  id: string;
  name: string;
  provider: AIModelProvider;
  description?: string;
  features?: AIModelFeature[];
  isNew?: boolean;
  isPreview?: boolean;
}

export interface AIModelSelectorProps {
  models?: AIModelSelectorItem[];
  selectedModelId?: string;
  onModelSelect?: (model: AIModelSelectorItem) => void;
  trigger?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  isLoading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  labels?: Partial<AIModelSelectorLabels>;
}

export interface AIModelSelectorLabels {
  dialogTitle: string;
  dialogDescription: string;
  searchAriaLabel: string;
  searchPlaceholder: string;
  loading: string;
  emptyTitle: string;
  emptyDescription: string;
  noResultsTitle: string;
  noResultsDescription: string;
  selectedModelAria: string;
  selectedStatus: string;
  newBadge: string;
  previewBadge: string;
  features: Record<AIModelFeature, string>;
}

const DEFAULT_LABELS: AIModelSelectorLabels = {
  dialogTitle: "AI model selector",
  dialogDescription: "Search and select an AI model",
  searchAriaLabel: "Search AI models",
  searchPlaceholder: "Search models...",
  loading: "Loading models...",
  emptyTitle: "No models available",
  emptyDescription: "There are no AI models available at this time.",
  noResultsTitle: "No models found",
  noResultsDescription: 'No models match "{query}".',
  selectedModelAria: "Selected model: {model}. Click to change model.",
  selectedStatus: "Selected",
  newBadge: "New",
  previewBadge: "Preview",
  features: {
    fast: "Fast",
    turbo: "Turbo",
    reasoning: "Reasoning",
    multimodal: "Multimodal",
    "long-context": "Long context",
    image: "Image",
    video: "Video",
  },
};

const PROVIDER_CONFIGS: Record<AIModelProvider, { name: string; icon: React.ReactNode; order: number }> = {
  openai: { name: "OpenAI", icon: <Sparkles className="size-4" />, order: 10 },
  anthropic: { name: "Anthropic", icon: <Bot className="size-4" />, order: 20 },
  google: { name: "Google", icon: <Sparkles className="size-4" />, order: 30 },
  meta: { name: "Meta", icon: <Cpu className="size-4" />, order: 40 },
  mistral: { name: "Mistral", icon: <Zap className="size-4" />, order: 50 },
  "black-forest-labs": { name: "Black Forest Labs", icon: <ImageIcon className="size-4" />, order: 60 },
  sourceful: { name: "Sourceful", icon: <ImageIcon className="size-4" />, order: 70 },
  bytedance: { name: "ByteDance", icon: <ImageIcon className="size-4" />, order: 80 },
  wan: { name: "WAN", icon: <Video className="size-4" />, order: 90 },
  kling: { name: "Kling", icon: <Video className="size-4" />, order: 100 },
  unknown: { name: "Other", icon: <Cpu className="size-4" />, order: 999 },
};

const FEATURE_ICONS: Record<AIModelFeature, React.ReactNode> = {
  fast: <Zap className="size-3" />,
  turbo: <Zap className="size-3" />,
  reasoning: <Sparkles className="size-3" />,
  multimodal: <ImageIcon className="size-3" />,
  "long-context": <Cpu className="size-3" />,
  image: <ImageIcon className="size-3" />,
  video: <Video className="size-3" />,
};

function ModelFeatureBadge({ feature, label }: { feature: AIModelFeature; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className="flex size-7 cursor-help items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          role="img"
        >
          {FEATURE_ICONS[feature]}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ModelBadge({ children, variant }: { children: React.ReactNode; variant: "new" | "preview" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        variant === "new" && "bg-primary/10 text-primary ring-1 ring-primary/20",
        variant === "preview" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function EmptyState({
  searchQuery,
  labels,
}: {
  searchQuery: string;
  labels: AIModelSelectorLabels;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{searchQuery ? labels.noResultsTitle : labels.emptyTitle}</EmptyTitle>
        <EmptyDescription>
          {searchQuery
            ? labels.noResultsDescription.replace("{query}", searchQuery)
            : labels.emptyDescription}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DefaultTrigger({
  selectedModel,
  className,
  placeholder,
  onClick,
  selectedModelAria,
}: {
  selectedModel: AIModelSelectorItem | undefined;
  className?: string;
  placeholder: string;
  onClick: () => void;
  selectedModelAria: string;
}) {
  return (
    <Button
      aria-label={selectedModel ? selectedModelAria.replace("{model}", selectedModel.name) : placeholder}
      className={cn("nodrag nowheel min-h-8 w-full justify-between gap-2", className)}
      onClick={onClick}
      type="button"
      variant="outline"
      size="sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        {selectedModel ? (
          <>
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              {PROVIDER_CONFIGS[selectedModel.provider].icon}
            </span>
            <span className="truncate">{selectedModel.name}</span>
          </>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );
}

export default function AIModelSelector({
  models = [],
  selectedModelId,
  onModelSelect,
  trigger,
  className,
  contentClassName,
  isLoading = false,
  placeholder = "Select model",
  searchPlaceholder = "Search models...",
  emptyTitle = "No models available",
  emptyDescription = "There are no AI models available at this time.",
  labels,
}: AIModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const resolvedLabels: AIModelSelectorLabels = {
    ...DEFAULT_LABELS,
    searchPlaceholder,
    emptyTitle,
    emptyDescription,
    ...labels,
    features: {
      ...DEFAULT_LABELS.features,
      ...labels?.features,
    },
  };

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId],
  );

  const groupedModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? models.filter((model) => {
          const providerName = PROVIDER_CONFIGS[model.provider].name;
          return [model.name, model.id, model.description, model.provider, providerName, ...(model.features ?? [])]
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .some((value) => value.toLowerCase().includes(query));
        })
      : models;

    const groups = new Map<AIModelProvider, AIModelSelectorItem[]>();
    for (const model of filtered) {
      groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
    }

    return [...groups.entries()].sort(
      ([left], [right]) => PROVIDER_CONFIGS[left].order - PROVIDER_CONFIGS[right].order,
    );
  }, [models, searchQuery]);

  const handleSelect = useCallback(
    (model: AIModelSelectorItem) => {
      onModelSelect?.(model);
      setOpen(false);
      setSearchQuery("");
    },
    [onModelSelect],
  );

  return (
    <TooltipProvider>
      <CommandDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearchQuery("");
        }}
        title={resolvedLabels.dialogTitle}
        description={resolvedLabels.dialogDescription}
        className={cn("max-w-2xl p-0", contentClassName)}
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label={resolvedLabels.searchAriaLabel}
            disabled={isLoading}
            placeholder={resolvedLabels.searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
            onInput={(event) => setSearchQuery(event.currentTarget.value)}
          />
          <CommandList className="max-h-[400px]">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">{resolvedLabels.loading}</div>
            ) : groupedModels.length === 0 ? (
              <CommandEmpty>
                <EmptyState
                  searchQuery={searchQuery}
                  labels={resolvedLabels}
                />
              </CommandEmpty>
            ) : (
              groupedModels.map(([provider, providerModels], groupIndex) => (
                <div key={provider}>
                  {groupIndex > 0 && <CommandSeparator />}
                  <CommandGroup
                    heading={PROVIDER_CONFIGS[provider].name}
                    aria-label={`${PROVIDER_CONFIGS[provider].name} models`}
                  >
                    {providerModels.map((model) => {
                      const isSelected = model.id === selectedModelId;
                      return (
                        <CommandItem
                          key={model.id}
                          value={model.id}
                          data-ai-model-id={model.id}
                          data-checked={isSelected ? "true" : undefined}
                          onSelect={() => handleSelect(model)}
                          className="min-h-12 py-2"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                              {PROVIDER_CONFIGS[model.provider].icon}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">{model.name}</span>
                                {model.isNew && <ModelBadge variant="new">{resolvedLabels.newBadge}</ModelBadge>}
                                {model.isPreview && <ModelBadge variant="preview">{resolvedLabels.previewBadge}</ModelBadge>}
                              </span>
                              {model.description && (
                                <span className="truncate text-xs text-muted-foreground">{model.description}</span>
                              )}
                            </span>
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {model.features?.map((feature) => (
                              <ModelFeatureBadge
                                feature={feature}
                                key={feature}
                                label={resolvedLabels.features[feature]}
                              />
                            ))}
                            {isSelected && <Check aria-label={resolvedLabels.selectedStatus} className="size-4 text-primary" />}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </div>
              ))
            )}
          </CommandList>
        </Command>
      </CommandDialog>

      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <DefaultTrigger
          selectedModel={selectedModel}
          className={className}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          selectedModelAria={resolvedLabels.selectedModelAria}
        />
      )}
    </TooltipProvider>
  );
}
