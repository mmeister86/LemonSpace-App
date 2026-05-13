"use client";

/**
 * Onboarding note:
 * Canvas adapter for the shared AI model selector. Keep model registry metadata as the source of truth.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import AIModelSelector, {
  type AIModelFeature,
  type AIModelProvider,
  type AIModelSelectorItem,
  type AIModelSelectorLabels,
} from "@/components/ui/ai-model-selector";
import { getAvailableAgentModels, type AgentModelAccessTier } from "@/lib/agent-models";
import { getAvailableAiTextModels, type AiTextModelAccessTier } from "@/lib/ai-text-models";
import { getAvailableImageModels, type AiModel } from "@/lib/ai-models";
import { getAvailableVideoModels, type VideoModelDurationSeconds } from "@/lib/ai-video-models";

export type CanvasModelSelectorKind = "image" | "video" | "ai-text" | "agent";
type ModelDescriptionFormatter = (modelId: string, fallback: string | undefined) => string | undefined;

export function inferModelProvider(modelId: string): AIModelProvider {
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("anthropic/")) return "anthropic";
  if (modelId.startsWith("google/")) return "google";
  if (modelId.startsWith("meta/")) return "meta";
  if (modelId.startsWith("mistral/")) return "mistral";
  if (modelId.startsWith("black-forest-labs/")) return "black-forest-labs";
  if (modelId.startsWith("sourceful/")) return "sourceful";
  if (modelId.startsWith("bytedance-seed/") || modelId.includes("seedance")) return "bytedance";
  if (modelId.startsWith("wan-")) return "wan";
  if (modelId.startsWith("kling-")) return "kling";
  return "unknown";
}

function withCredits(description: string | undefined, credits: number) {
  const creditText = `${credits} Cr`;
  return description ? `${description} · ${creditText}` : creditText;
}

function modelDescriptionMessageKey(modelId: string) {
  return `modelDescriptions.${modelId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function resolveDescription(
  modelId: string,
  fallback: string | undefined,
  formatDescription?: ModelDescriptionFormatter,
) {
  return formatDescription?.(modelId, fallback) ?? fallback;
}

function imageFeatures(model: AiModel): AIModelSelectorItem["features"] {
  const features: AIModelSelectorItem["features"] = ["image"];
  if (model.tier === "budget") features.push("fast");
  if (model.tier === "premium") features.push("multimodal");
  return features;
}

function videoFeatures(model: ReturnType<typeof getAvailableVideoModels>[number]): AIModelSelectorItem["features"] {
  return model.supportsImageToVideo ? ["multimodal", "video"] : ["video"];
}

export function buildImageModelSelectorOptions(
  tier: AiModel["minTier"],
  formatDescription?: ModelDescriptionFormatter,
  options?: { requiresImageReferences?: boolean },
): AIModelSelectorItem[] {
  return getAvailableImageModels(tier, options).map((model) => ({
    id: model.id,
    name: model.name,
    provider: inferModelProvider(model.id),
    description: withCredits(resolveDescription(model.id, model.description, formatDescription), model.creditCost),
    features: imageFeatures(model),
    isPreview: model.id.includes("preview"),
  }));
}

export function buildVideoModelSelectorOptions(
  durationSeconds: VideoModelDurationSeconds = 5,
  formatDescription?: ModelDescriptionFormatter,
): AIModelSelectorItem[] {
  return getAvailableVideoModels("pro").map((model) => ({
    id: model.id,
    name: model.label,
    provider: inferModelProvider(model.id),
    description: withCredits(
      resolveDescription(model.id, model.description, formatDescription),
      model.creditCost[durationSeconds],
    ),
    features: videoFeatures(model),
  }));
}

export function buildAiTextModelSelectorOptions(
  tier: AiTextModelAccessTier,
  formatDescription?: ModelDescriptionFormatter,
): AIModelSelectorItem[] {
  return getAvailableAiTextModels(tier).map((model) => ({
    id: model.id,
    name: model.label,
    provider: inferModelProvider(model.id),
    description: withCredits(resolveDescription(model.id, model.description, formatDescription), model.creditCost),
    features: model.id.includes("nano") || model.id.includes("mini") ? ["fast"] : ["reasoning"],
  }));
}

export function buildAgentModelSelectorOptions(
  tier: AgentModelAccessTier,
  formatDescription?: ModelDescriptionFormatter,
): AIModelSelectorItem[] {
  return getAvailableAgentModels(tier).map((model) => ({
    id: model.id,
    name: model.label,
    provider: inferModelProvider(model.id),
    description: withCredits(resolveDescription(model.id, model.description, formatDescription), model.creditCost),
    features: model.id.includes("nano") || model.id.includes("mini") ? ["fast"] : ["reasoning"],
  }));
}

export function CanvasAiModelSelector({
  kind,
  value,
  onValueChange,
  userTier = "free",
  durationSeconds = 5,
  className,
  placeholder,
  requiresImageReferences = false,
}: {
  kind: CanvasModelSelectorKind;
  value: string;
  onValueChange: (value: string) => void;
  userTier?: AiModel["minTier"] | AgentModelAccessTier;
  durationSeconds?: VideoModelDurationSeconds;
  className?: string;
  placeholder?: string;
  requiresImageReferences?: boolean;
}) {
  const t = useTranslations("aiModelSelector");
  const models = useMemo(() => {
    const formatDescription: ModelDescriptionFormatter = (modelId, fallback) => {
      const key = modelDescriptionMessageKey(modelId);
      const translator = t as unknown as {
        (translationKey: string): string;
        has?: (translationKey: string) => boolean;
      };
      if (typeof translator.has === "function") {
        return translator.has(key) ? translator(key) : fallback;
      }

      const translated = translator(key);
      return translated === key ? fallback : translated;
    };

    if (kind === "image") {
      return buildImageModelSelectorOptions(userTier as AiModel["minTier"], formatDescription, {
        requiresImageReferences,
      });
    }
    if (kind === "video") {
      return buildVideoModelSelectorOptions(durationSeconds, formatDescription);
    }
    if (kind === "ai-text") {
      return buildAiTextModelSelectorOptions(userTier as AiTextModelAccessTier, formatDescription);
    }
    return buildAgentModelSelectorOptions(userTier as AgentModelAccessTier, formatDescription);
  }, [durationSeconds, kind, requiresImageReferences, t, userTier]);
  const labels = useMemo<AIModelSelectorLabels>(() => {
    const featureKeys: AIModelFeature[] = [
      "fast",
      "turbo",
      "reasoning",
      "multimodal",
      "long-context",
      "image",
      "video",
    ];
    const features = Object.fromEntries(
      featureKeys.map((feature) => [feature, t(`features.${feature}`)] as const),
    ) as Record<AIModelFeature, string>;

    return {
      dialogTitle: t("dialogTitle"),
      dialogDescription: t("dialogDescription"),
      searchAriaLabel: t("searchAriaLabel"),
      searchPlaceholder: t("searchPlaceholder"),
      loading: t("loading"),
      emptyTitle: t("emptyTitle"),
      emptyDescription: t("emptyDescription"),
      noResultsTitle: t("noResultsTitle"),
      noResultsDescription: (query) => t("noResultsDescription", { query }),
      selectedModelAria: (model) => t("selectedModelAria", { model }),
      selectedStatus: t("selectedStatus"),
      newBadge: t("newBadge"),
      previewBadge: t("previewBadge"),
      features,
    };
  }, [t]);

  return (
    <AIModelSelector
      models={models}
      selectedModelId={value}
      onModelSelect={(model) => onValueChange(model.id)}
      className={className}
      placeholder={placeholder ?? t("modelLabel")}
      labels={labels}
    />
  );
}
