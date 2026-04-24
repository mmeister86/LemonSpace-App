// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNodeWithIntersection: vi.fn(async () => undefined),
  getCenteredPosition: vi.fn(() => ({ x: 0, y: 0 })),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: mocks.createNodeWithIntersection,
  }),
}));

vi.mock("@/hooks/use-centered-flow-node-position", () => ({
  useCenteredFlowNodePosition: () => mocks.getCenteredPosition,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/canvas/credit-display", () => ({
  CreditDisplay: () => <div data-testid="credit-display" />,
}));

vi.mock("@/lib/canvas-node-catalog", () => ({
  NODE_CATEGORIES_ORDERED: [],
  NODE_CATEGORY_META: {},
  catalogEntriesByCategory: () => new Map(),
  getTemplateForCatalogType: () => null,
  isNodePaletteEnabled: () => false,
}));

import CanvasToolbar from "@/components/canvas/canvas-toolbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasToolbar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.createNodeWithIntersection.mockClear();
    mocks.getCenteredPosition.mockClear();

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

  it("renders the favorites filter button", async () => {
    await act(async () => {
      root?.render(
        <CanvasToolbar
          activeTool="select"
          onToolChange={vi.fn()}
          onFavoriteFilterChange={vi.fn()}
        />,
      );
    });

    const favoriteButton = container?.querySelector('button[title="Favoriten hervorheben"]');
    expect(favoriteButton).not.toBeNull();
    expect(container?.querySelector('[data-testid="credit-display"]')).not.toBeNull();
    expect(container?.textContent).not.toContain("Export ZIP");
  });

  it("reflects active state via aria-pressed", async () => {
    await act(async () => {
      root?.render(
        <CanvasToolbar
          activeTool="select"
          onToolChange={vi.fn()}
          favoriteFilterActive={false}
          onFavoriteFilterChange={vi.fn()}
        />,
      );
    });

    let favoriteButton = container?.querySelector('button[title="Favoriten hervorheben"]');
    expect(favoriteButton?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      root?.render(
        <CanvasToolbar
          activeTool="select"
          onToolChange={vi.fn()}
          favoriteFilterActive
          onFavoriteFilterChange={vi.fn()}
        />,
      );
    });

    favoriteButton = container?.querySelector('button[title="Favoriten hervorheben"]');
    expect(favoriteButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles and calls onFavoriteFilterChange", async () => {
    const onFavoriteFilterChange = vi.fn();

    await act(async () => {
      root?.render(
        <CanvasToolbar
          activeTool="select"
          onToolChange={vi.fn()}
          favoriteFilterActive={false}
          onFavoriteFilterChange={onFavoriteFilterChange}
        />,
      );
    });

    const favoriteButton = container?.querySelector('button[title="Favoriten hervorheben"]');
    if (!(favoriteButton instanceof HTMLButtonElement)) {
      throw new Error("Favorite filter button not found");
    }

    await act(async () => {
      favoriteButton.click();
    });

    expect(onFavoriteFilterChange).toHaveBeenCalledTimes(1);
    expect(onFavoriteFilterChange).toHaveBeenCalledWith(true);

    onFavoriteFilterChange.mockClear();

    await act(async () => {
      root?.render(
        <CanvasToolbar
          activeTool="select"
          onToolChange={vi.fn()}
          favoriteFilterActive
          onFavoriteFilterChange={onFavoriteFilterChange}
        />,
      );
    });

    const activeFavoriteButton = container?.querySelector('button[title="Favoriten hervorheben"]');
    if (!(activeFavoriteButton instanceof HTMLButtonElement)) {
      throw new Error("Active favorite filter button not found");
    }

    await act(async () => {
      activeFavoriteButton.click();
    });

    expect(onFavoriteFilterChange).toHaveBeenCalledTimes(1);
    expect(onFavoriteFilterChange).toHaveBeenCalledWith(false);
  });
});
