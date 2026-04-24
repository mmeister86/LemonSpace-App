// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CanvasSidebar from "@/components/canvas/canvas-sidebar";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: () => ({ name: "Demo Canvas" }),
}));

vi.mock("@/components/canvas/canvas-user-menu", () => ({
  CanvasUserMenu: ({ compact }: { compact?: boolean }) => (
    <div data-testid={compact ? "canvas-user-menu-compact" : "canvas-user-menu-full"} />
  ),
}));

vi.mock("@/components/ui/progressive-blur", () => ({
  ProgressiveBlur: () => <div data-testid="progressive-blur" />,
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt ?? ""} />,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasSidebar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("shows divider-separated category sections with two-column grids in rail mode", async () => {
    await act(async () => {
      root?.render(
        <CanvasSidebar canvasId={"canvas-1" as Id<"canvases">} railMode />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).not.toContain("QUELLE");
    expect(text).not.toContain("KI-AUSGABE");

    const sourceGrid = container?.querySelector(
      '[data-testid="sidebar-rail-category-source-grid"]',
    );
    expect(sourceGrid).not.toBeNull();
    expect(sourceGrid?.className).toContain("grid-cols-2");

    const aiOutputDivider = container?.querySelector(
      '[data-testid="sidebar-rail-category-ai-output-divider"]',
    );
    expect(aiOutputDivider).not.toBeNull();

    const allCategoryGrids = container?.querySelectorAll('[data-testid$="-grid"]');
    expect(allCategoryGrids?.length ?? 0).toBeGreaterThan(1);
  });

  it("hides phase tags and system-generated output nodes", async () => {
    await act(async () => {
      root?.render(
        <CanvasSidebar canvasId={"canvas-1" as Id<"canvases">} />,
      );
    });

    const text = container?.textContent ?? "";
    expect(text).not.toContain("P2");
    expect(text).not.toContain("P3");
    expect(text).not.toContain("KI-Video-Ausgabe");
    expect(text).not.toContain("KI-Text-Ausgabe");
    expect(text).not.toContain("Agent-Ausgabe");
  });
});
