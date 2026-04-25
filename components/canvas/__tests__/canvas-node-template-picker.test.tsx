// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasNodeTemplatePicker } from "@/components/canvas/canvas-node-template-picker";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";

vi.mock("@/components/ui/command", () => ({
  CommandGroup: ({
    children,
    heading,
  }: {
    children: React.ReactNode;
    heading?: string;
  }) => (
    <div data-testid="command-group">
      {heading ? <div>{heading}</div> : null}
      {children}
    </div>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" data-testid="command-item" onClick={onSelect}>
      {children}
    </button>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasNodeTemplatePicker", () => {
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

  it("renders available templates without an undefined icon component", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <CanvasNodeTemplatePicker
          onPick={vi.fn<(template: CanvasNodeTemplate) => void>()}
          templates={CANVAS_NODE_TEMPLATES}
        />,
      );
    });

    expect(document.body.textContent).toContain(CANVAS_NODE_TEMPLATES[0]?.label);
  });
});
