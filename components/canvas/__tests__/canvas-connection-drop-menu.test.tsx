// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasConnectionDropMenu } from "@/components/canvas/canvas-connection-drop-menu";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input aria-label="command-input" />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/canvas/canvas-node-template-picker", () => ({
  CanvasNodeTemplatePicker: ({
    onPick,
  }: {
    onPick: (template: CanvasNodeTemplate) => void;
  }) => (
    <button
      type="button"
      data-testid="pick-template"
      onClick={() => onPick({ type: "note", label: "Notiz" } as CanvasNodeTemplate)}
    >
      pick
    </button>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasConnectionDropMenu", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("renders using a generic anchor and forwards template picks", () => {
    const onPick = vi.fn<(template: CanvasNodeTemplate) => void>();
    const onClose = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <CanvasConnectionDropMenu
          anchor={{ screenX: 140, screenY: 200 }}
          onClose={onClose}
          onPick={onPick}
        />,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const pickButton = document.querySelector('[data-testid="pick-template"]');
    if (!(pickButton instanceof HTMLButtonElement)) {
      throw new Error("Template pick button was not rendered");
    }

    act(() => {
      pickButton.click();
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
