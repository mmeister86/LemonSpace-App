// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNodeWithIntersection: vi.fn(async () => undefined),
  getCenteredPosition: vi.fn(() => ({ x: 0, y: 0 })),
  renameCanvas: vi.fn(async () => undefined),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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

vi.mock("convex/react", () => ({
  useMutation: () => mocks.renameCanvas,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    canvases: {
      update: "canvases.update",
    },
  },
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/lib/canvas-node-catalog", () => ({
  NODE_CATEGORIES_ORDERED: [],
  NODE_CATEGORY_META: {},
  catalogEntriesByCategory: () => new Map(),
  getTemplateForCatalogType: () => null,
  isNodePaletteEnabled: () => false,
}));

import CanvasToolbar, { resolveToolbarSnapSide } from "@/components/canvas/canvas-toolbar";
import {
  clampToolbarPosition,
  getToolbarSnapTarget,
} from "@/components/canvas/canvas-toolbar-placement";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installLocalStorageMock() {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        entries.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        entries.delete(key);
      }),
      clear: vi.fn(() => {
        entries.clear();
      }),
    },
  });
}

describe("CanvasToolbar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    installLocalStorageMock();
    mocks.createNodeWithIntersection.mockClear();
    mocks.getCenteredPosition.mockClear();
    mocks.renameCanvas.mockClear();
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    window.localStorage.clear();

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
          canvasId={"canvas-1" as never}
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
          canvasId={"canvas-1" as never}
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
          canvasId={"canvas-1" as never}
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
          canvasId={"canvas-1" as never}
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
          canvasId={"canvas-1" as never}
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

  it("renders a drag handle and removes the full-width spacer layout", async () => {
    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Neuer Workspace"
          activeTool="select"
          onToolChange={vi.fn()}
        />,
      );
    });

    const toolbar = container?.querySelector('[data-testid="canvas-toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).not.toContain("w-[min(calc(100vw-9rem),64rem)]");
    expect(toolbar?.querySelector('[data-testid="canvas-toolbar-drag-handle"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-testid="canvas-toolbar-meta"]')?.className).not.toContain(
      "flex-1",
    );
  });

  it("renames the canvas inline when Enter is pressed", async () => {
    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Neuer Workspace"
          activeTool="select"
          onToolChange={vi.fn()}
        />,
      );
    });

    const nameButton = container?.querySelector('[data-testid="canvas-toolbar-name"]');
    if (!(nameButton instanceof HTMLButtonElement)) {
      throw new Error("Canvas name button not found");
    }

    await act(async () => {
      nameButton.click();
    });

    const input = container?.querySelector('[data-testid="canvas-toolbar-name-input"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Canvas name input not found");
    }

    await act(async () => {
      input.value = "Launch Board";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(mocks.renameCanvas).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      name: "Launch Board",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("cancels inline rename when Escape is pressed", async () => {
    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Neuer Workspace"
          activeTool="select"
          onToolChange={vi.fn()}
        />,
      );
    });

    const nameButton = container?.querySelector('[data-testid="canvas-toolbar-name"]');
    if (!(nameButton instanceof HTMLButtonElement)) {
      throw new Error("Canvas name button not found");
    }

    await act(async () => {
      nameButton.click();
    });

    const input = container?.querySelector('[data-testid="canvas-toolbar-name-input"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Canvas name input not found");
    }

    await act(async () => {
      input.value = "Temporary Name";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(mocks.renameCanvas).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("Neuer Workspace");
  });

  it("restores a vertical dock position from localStorage", async () => {
    window.localStorage.setItem(
      "lemonspace.canvas:toolbar:v1:canvas-1",
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        position: { x: 32, y: 96, side: "left" },
      }),
    );

    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Neuer Workspace"
          activeTool="select"
          onToolChange={vi.fn()}
        />,
      );
    });

    const toolbar = container?.querySelector('[data-testid="canvas-toolbar"]');
    expect(toolbar?.getAttribute("data-side")).toBe("left");
    expect(toolbar?.getAttribute("data-orientation")).toBe("vertical");
    expect(toolbar?.className).toContain("w-16");

    const nameButton = container?.querySelector('[data-testid="canvas-toolbar-name"]');
    expect(nameButton?.className).toContain("[writing-mode:vertical-rl]");
  });

  it("centers top and bottom dock positions with auto margins instead of transform", async () => {
    window.localStorage.setItem(
      "lemonspace.canvas:toolbar:v1:canvas-1",
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        position: { x: 992, y: 720, side: "bottom" },
      }),
    );

    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Never give up"
          activeTool="select"
          onToolChange={vi.fn()}
        />,
      );
    });

    const toolbar = container?.querySelector('[data-testid="canvas-toolbar"]');
    expect(toolbar?.getAttribute("data-side")).toBe("bottom");
    expect(toolbar?.getAttribute("data-orientation")).toBe("horizontal");
    expect((toolbar as HTMLElement | null)?.style.left).toBe("0px");
    expect((toolbar as HTMLElement | null)?.style.right).toBe("0px");
    expect((toolbar as HTMLElement | null)?.style.marginInline).toBe("auto");
    expect((toolbar as HTMLElement | null)?.style.transform).toBe("none");
  });

  it("enables undo and redo controls when history is available", async () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    await act(async () => {
      root?.render(
        <CanvasToolbar
          canvasId={"canvas-1" as never}
          canvasName="Neuer Workspace"
          activeTool="select"
          onToolChange={vi.fn()}
          canUndo
          canRedo
          onUndo={onUndo}
          onRedo={onRedo}
        />,
      );
    });

    const undoButton = container?.querySelector('button[title="Rückgängig"]');
    const redoButton = container?.querySelector('button[title="Wiederholen"]');
    if (!(undoButton instanceof HTMLButtonElement) || !(redoButton instanceof HTMLButtonElement)) {
      throw new Error("Undo/redo buttons not found");
    }

    await act(async () => {
      undoButton.click();
      redoButton.click();
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(container?.textContent).not.toContain("folgt");
  });
});

describe("resolveToolbarSnapSide", () => {
  const parentRect = {
    width: 1200,
    height: 800,
  } as DOMRect;

  it("recognizes points across the full top and bottom snap hitboxes", () => {
    expect(resolveToolbarSnapSide({ x: 360, y: 48 }, parentRect)).toBe("top");
    expect(resolveToolbarSnapSide({ x: 600, y: 48 }, parentRect)).toBe("top");
    expect(resolveToolbarSnapSide({ x: 840, y: 48 }, parentRect)).toBe("top");

    expect(resolveToolbarSnapSide({ x: 360, y: 752 }, parentRect)).toBe("bottom");
    expect(resolveToolbarSnapSide({ x: 600, y: 752 }, parentRect)).toBe("bottom");
    expect(resolveToolbarSnapSide({ x: 840, y: 752 }, parentRect)).toBe("bottom");
  });

  it("recognizes points across the full left and right snap hitboxes", () => {
    expect(resolveToolbarSnapSide({ x: 48, y: 220 }, parentRect)).toBe("left");
    expect(resolveToolbarSnapSide({ x: 48, y: 400 }, parentRect)).toBe("left");
    expect(resolveToolbarSnapSide({ x: 48, y: 580 }, parentRect)).toBe("left");

    expect(resolveToolbarSnapSide({ x: 1152, y: 220 }, parentRect)).toBe("right");
    expect(resolveToolbarSnapSide({ x: 1152, y: 400 }, parentRect)).toBe("right");
    expect(resolveToolbarSnapSide({ x: 1152, y: 580 }, parentRect)).toBe("right");
  });

  it("returns null outside the snap hitboxes", () => {
    expect(resolveToolbarSnapSide({ x: 120, y: 120 }, parentRect)).toBeNull();
    expect(resolveToolbarSnapSide({ x: 600, y: 400 }, parentRect)).toBeNull();
    expect(resolveToolbarSnapSide({ x: 1080, y: 680 }, parentRect)).toBeNull();
  });
});

describe("canvas toolbar placement helpers", () => {
  const parentRect = {
    width: 1200,
    height: 800,
  } as DOMRect;
  const toolbarRect = {
    width: 420,
    height: 56,
  } as DOMRect;

  it("computes centered snap targets from parent and toolbar geometry", () => {
    expect(getToolbarSnapTarget("top", parentRect, toolbarRect)).toEqual({
      x: 390,
      y: 16,
      side: "top",
    });
    expect(getToolbarSnapTarget("bottom", parentRect, toolbarRect)).toEqual({
      x: 390,
      y: 728,
      side: "bottom",
    });
    expect(getToolbarSnapTarget("left", parentRect, toolbarRect)).toEqual({
      x: 16,
      y: 140,
      side: "left",
    });
    expect(getToolbarSnapTarget("right", parentRect, toolbarRect)).toEqual({
      x: 1120,
      y: 140,
      side: "right",
    });
  });

  it("clamps free placement inside the parent bounds with toolbar margins", () => {
    expect(
      clampToolbarPosition({ x: -120, y: 999, side: "free" }, parentRect, toolbarRect),
    ).toEqual({
      x: 16,
      y: 728,
      side: "free",
    });
  });
});
