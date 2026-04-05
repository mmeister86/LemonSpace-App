// @vitest-environment jsdom

import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCanvasEdgeTypes } from "@/components/canvas/use-canvas-edge-types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookHarnessProps = {
  edgeInsertMenuEdgeId: string | null;
  scissorsMode: boolean;
  onInsertClick: ReturnType<typeof vi.fn>;
};

const latestRef: {
  current: ReturnType<typeof useCanvasEdgeTypes> | null;
} = { current: null };

function HookHarness({
  edgeInsertMenuEdgeId,
  scissorsMode,
  onInsertClick,
}: HookHarnessProps) {
  const edgeTypes = useCanvasEdgeTypes({
    edgeInsertMenuEdgeId,
    scissorsMode,
    onInsertClick,
  });

  useEffect(() => {
    latestRef.current = edgeTypes;
  }, [edgeTypes]);

  return null;
}

describe("useCanvasEdgeTypes", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    latestRef.current = null;
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("keeps edgeTypes reference stable while using latest UI state", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onInsertClickA = vi.fn();
    const onInsertClickB = vi.fn();

    act(() => {
      root?.render(
        <HookHarness
          edgeInsertMenuEdgeId={null}
          scissorsMode={false}
          onInsertClick={onInsertClickA}
        />,
      );
    });

    const firstEdgeTypes = latestRef.current;
    if (!firstEdgeTypes) {
      throw new Error("edgeTypes not initialized");
    }

    const renderer = firstEdgeTypes["canvas-default"] as
      | ((props: { id: string }) => React.JSX.Element)
      | undefined;
    if (!renderer) {
      throw new Error("canvas-default edge renderer missing");
    }

    act(() => {
      const renderedEdge = renderer({ id: "edge-1" });
      expect(renderedEdge.props).toEqual(
        expect.objectContaining({
          edgeId: "edge-1",
          isMenuOpen: false,
          disabled: false,
          onInsertClick: onInsertClickA,
        }),
      );
    });

    act(() => {
      root?.render(
        <HookHarness
          edgeInsertMenuEdgeId="edge-1"
          scissorsMode
          onInsertClick={onInsertClickB}
        />,
      );
    });

    expect(latestRef.current).toBe(firstEdgeTypes);

    act(() => {
      const renderedEdge = renderer({ id: "edge-1" });
      expect(renderedEdge.props).toEqual(
        expect.objectContaining({
          edgeId: "edge-1",
          isMenuOpen: true,
          disabled: true,
          onInsertClick: onInsertClickB,
        }),
      );
    });
  });
});
