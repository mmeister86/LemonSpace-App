// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasAiModelSelector } from "@/components/canvas/nodes/canvas-ai-model-selector";
import AIModelSelector, { type AIModelSelectorItem } from "@/components/ui/ai-model-selector";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      dialogTitle: "Select AI model",
      dialogDescription: "Search and choose an AI model for this node.",
      modelLabel: "Model",
      searchAriaLabel: "Search AI models",
      searchPlaceholder: "Search models...",
      loading: "Loading models...",
      emptyTitle: "No models available",
      emptyDescription: "No models are currently available for this node.",
      noResultsTitle: "No models found",
      noResultsDescription: 'No model matches "{query}".',
      selectedModelAria: "{model} is selected. Click to change model.",
      selectedStatus: "Selected",
      newBadge: "New",
      previewBadge: "Preview",
      "features.fast": "Fast",
      "features.turbo": "Turbo",
      "features.reasoning": "Reasoning",
      "features.multimodal": "Multimodal",
      "features.long-context": "Long context",
      "features.image": "Image",
      "features.video": "Video",
    };
    let message = messages[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
    return message;
  },
}));

const models: AIModelSelectorItem[] = [
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    description: "15 Cr",
  },
  {
    id: "sourceful/riverflow-v2-pro",
    name: "Riverflow V2 Pro",
    provider: "sourceful",
    description: "12 Cr",
  },
];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

describe("AIModelSelector", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    vi.clearAllMocks();

    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
  });

  async function renderSelector(props: Partial<React.ComponentProps<typeof AIModelSelector>> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AIModelSelector, {
          models,
          selectedModelId: "openai/gpt-5.4-mini",
          ...props,
        }),
      );
    });
  }

  it("opens, filters models, and selects a model", async () => {
    const onModelSelect = vi.fn();
    await renderSelector({ onModelSelect });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(document.body.textContent).toContain("GPT-5.4 Mini");
    expect(document.body.textContent).toContain("Riverflow V2 Pro");

    await act(async () => {
      const input = document.querySelector<HTMLInputElement>("input[aria-label='Search AI models']");
      input!.value = "river";
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("GPT-5.4 Mini15 Cr");
    expect(document.body.textContent).toContain("Riverflow V2 Pro");

    await act(async () => {
      document.querySelector<HTMLElement>("[data-ai-model-id='sourceful/riverflow-v2-pro']")?.click();
    });

    expect(onModelSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sourceful/riverflow-v2-pro" }),
    );
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("shows an empty state when no models match", async () => {
    await renderSelector();

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    await act(async () => {
      const input = document.querySelector<HTMLInputElement>("input[aria-label='Search AI models']");
      input!.value = "no-match";
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("No models found");
  });

  it("renders injected localized picker copy", async () => {
    await renderSelector({
      labels: {
        dialogTitle: "KI-Modell auswählen",
        dialogDescription: "Suche und wähle ein KI-Modell.",
        searchAriaLabel: "KI-Modelle suchen",
        searchPlaceholder: "Modelle suchen...",
        loading: "Modelle werden geladen...",
        emptyTitle: "Keine Modelle verfügbar",
        emptyDescription: "Für diesen Node sind aktuell keine Modelle verfügbar.",
        noResultsTitle: "Keine Modelle gefunden",
        noResultsDescription: 'Kein Modell passt zu "{query}".',
        selectedModelAria: "{model} ist ausgewählt. Klicke, um das Modell zu wechseln.",
        selectedStatus: "Ausgewählt",
        newBadge: "Neu",
        previewBadge: "Vorschau",
        features: {
          fast: "Schnell",
          turbo: "Turbo",
          reasoning: "Reasoning",
          multimodal: "Multimodal",
          "long-context": "Langer Kontext",
          image: "Bild",
          video: "Video",
        },
      },
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(document.body.textContent).toContain("KI-Modell auswählen");

    await act(async () => {
      const input = document.querySelector<HTMLInputElement>("input[aria-label='KI-Modelle suchen']");
      input!.value = "no-match";
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Keine Modelle gefunden");
    expect(document.body.textContent).toContain('Kein Modell passt zu "no-match".');
  });

  it("passes selected canvas model ids through the adapter", async () => {
    const onValueChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(CanvasAiModelSelector, {
          kind: "agent",
          value: "openai/gpt-5.4-mini",
          onValueChange,
          userTier: "max",
        }),
      );
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button")?.click();
    });

    await act(async () => {
      document.querySelector<HTMLElement>("[data-ai-model-id='openai/gpt-5.4-pro']")?.click();
    });

    expect(onValueChange).toHaveBeenCalledWith("openai/gpt-5.4-pro");
  });
});
