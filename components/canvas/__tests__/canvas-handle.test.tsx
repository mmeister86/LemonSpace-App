// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HANDLE_SNAP_RADIUS_PX } from "@/components/canvas/canvas-connection-magnetism";
import {
  CanvasConnectionMagnetismProvider,
  useCanvasConnectionMagnetism,
} from "@/components/canvas/canvas-connection-magnetism-context";

const connectionStateRef: { current: { inProgress: boolean } } = {
  current: { inProgress: false },
};

vi.mock("@xyflow/react", () => ({
  Handle: ({
    className,
    style,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    className?: string;
    style?: React.CSSProperties;
  }) => <div className={className} style={style} {...props} />,
  Position: { Left: "left", Right: "right" },
  useConnection: () => connectionStateRef.current,
}));

import CanvasHandle from "@/components/canvas/canvas-handle";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function MagnetTargetSetter({
  target,
}: {
  target:
    | {
        nodeId: string;
        handleId?: string;
        handleType: "source" | "target";
        centerX: number;
        centerY: number;
        distancePx: number;
      }
    | null;
}) {
  const { setActiveTarget } = useCanvasConnectionMagnetism();

  useEffect(() => {
    setActiveTarget(target);
  }, [setActiveTarget, target]);

  return null;
}

describe("CanvasHandle", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    connectionStateRef.current = { inProgress: false };
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

  async function renderHandle(args?: {
    inProgress?: boolean;
    activeTarget?: {
      nodeId: string;
      handleId?: string;
      handleType: "source" | "target";
      centerX: number;
      centerY: number;
      distancePx: number;
    } | null;
    props?: Partial<React.ComponentProps<typeof CanvasHandle>>;
  }) {
    connectionStateRef.current = { inProgress: args?.inProgress ?? false };

    await act(async () => {
      root?.render(
        <CanvasConnectionMagnetismProvider>
          <MagnetTargetSetter target={args?.activeTarget ?? null} />
          <CanvasHandle
            nodeId="node-1"
            nodeType="image"
            type="target"
            position="left"
            id="image-in"
            {...args?.props}
          />
        </CanvasConnectionMagnetismProvider>,
      );
    });
  }

  function getHandleElement() {
    const handle = container?.querySelector("[data-node-id='node-1'][data-handle-type]");
    if (!(handle instanceof HTMLElement)) {
      throw new Error("CanvasHandle element not found");
    }
    return handle;
  }

  it("renders default handle chrome with expected size and border", async () => {
    await renderHandle();

    const handle = getHandleElement();
    expect(handle.className).toContain("!h-3");
    expect(handle.className).toContain("!w-3");
    expect(handle.className).toContain("!border-2");
    expect(handle.className).toContain("!border-background");
    expect(handle.getAttribute("data-glow-state")).toBe("idle");
  });

  it("turns on near-target glow when this handle is active target", async () => {
    await renderHandle({
      inProgress: true,
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX + 2,
      },
    });

    const handle = getHandleElement();
    expect(handle.getAttribute("data-glow-state")).toBe("near");
  });

  it("renders a stronger glow in snapped state than near state", async () => {
    await renderHandle({
      inProgress: true,
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX + 6,
      },
    });

    const nearHandle = getHandleElement();
    const nearGlow = nearHandle.style.boxShadow;

    await renderHandle({
      inProgress: true,
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX - 4,
      },
    });

    const snappedHandle = getHandleElement();
    expect(snappedHandle.getAttribute("data-glow-state")).toBe("snapped");
    expect(snappedHandle.style.boxShadow).not.toBe(nearGlow);
  });

  it("does not glow for non-target handles during the same drag", async () => {
    await renderHandle({
      inProgress: true,
      activeTarget: {
        nodeId: "other-node",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX - 4,
      },
    });

    const handle = getHandleElement();
    expect(handle.getAttribute("data-glow-state")).toBe("idle");
  });

  it("emits stable handle geometry data attributes", async () => {
    await renderHandle({
      props: {
        nodeId: "node-2",
        id: undefined,
        type: "source",
        position: "right",
      },
    });

    const handle = container?.querySelector("[data-node-id='node-2'][data-handle-type='source']");
    if (!(handle instanceof HTMLElement)) {
      throw new Error("CanvasHandle source element not found");
    }

    expect(handle.getAttribute("data-node-id")).toBe("node-2");
    expect(handle.getAttribute("data-handle-id")).toBe("");
    expect(handle.getAttribute("data-handle-type")).toBe("source");
  });
});
