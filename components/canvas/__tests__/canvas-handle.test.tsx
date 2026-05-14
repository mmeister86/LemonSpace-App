// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HANDLE_GLOW_RADIUS_PX,
  HANDLE_SNAP_RADIUS_PX,
} from "@/components/canvas/canvas-connection-magnetism";
import {
  CanvasConnectionMagnetismProvider,
  useCanvasConnectionMagnetism,
} from "@/components/canvas/canvas-connection-magnetism-context";

const connectionStateRef: {
  current: {
    inProgress?: boolean;
    fromNode?: { id: string };
    fromHandle?: { id?: string; type?: "source" | "target" };
    toNode?: { id: string } | null;
    toHandle?: { id?: string | null; type?: "source" | "target" } | null;
    isValid?: boolean | null;
  };
} = {
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
    document.documentElement.classList.remove("dark");
    container = null;
    root = null;
  });

  async function renderHandle(args?: {
    connectionState?: {
      inProgress?: boolean;
      fromNode?: { id: string };
      fromHandle?: { id?: string; type?: "source" | "target" };
      toNode?: { id: string } | null;
      toHandle?: { id?: string | null; type?: "source" | "target" } | null;
      isValid?: boolean | null;
    };
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
    connectionStateRef.current = args?.connectionState ?? { inProgress: false };

    await act(async () => {
      root?.render(
        <CanvasConnectionMagnetismProvider>
          <MagnetTargetSetter target={args?.activeTarget ?? null} />
          <CanvasHandle
            nodeId="node-1"
            nodeType="image"
            type="target"
            position={"left" as React.ComponentProps<typeof CanvasHandle>["position"]}
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

  it("labels ai-text role handles for hover and accessibility", async () => {
    await renderHandle({
      props: {
        nodeType: "ai-text",
        id: "ai-text-instruction-in-2",
      },
    });

    let handle = getHandleElement();
    expect(handle.getAttribute("title")).toBe("Vorgaben-Input 2");
    expect(handle.getAttribute("aria-label")).toBe("Vorgaben-Input 2");

    await renderHandle({
      props: {
        nodeType: "ai-text",
        id: "ai-text-in",
      },
    });

    handle = getHandleElement();
    expect(handle.getAttribute("title")).toBe("Rohfassung-Input 1");
    expect(handle.getAttribute("aria-label")).toBe("Rohfassung-Input 1");
  });

  it("turns on near-target glow when this handle is active target", async () => {
    await renderHandle({
      connectionState: { inProgress: true },
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
      connectionState: { inProgress: true },
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
      connectionState: { inProgress: true },
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

  it("ramps up glow intensity as pointer gets closer within glow radius", async () => {
    await renderHandle({
      connectionState: { inProgress: true },
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_GLOW_RADIUS_PX - 1,
      },
    });

    const farHandle = getHandleElement();
    const farStrength = Number(farHandle.getAttribute("data-glow-strength") ?? "0");

    await renderHandle({
      connectionState: { inProgress: true },
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX + 1,
      },
    });

    const nearHandle = getHandleElement();
    const nearStrength = Number(nearHandle.getAttribute("data-glow-strength") ?? "0");

    expect(farHandle.getAttribute("data-glow-state")).toBe("near");
    expect(nearHandle.getAttribute("data-glow-state")).toBe("near");
    expect(nearStrength).toBeGreaterThan(farStrength);
  });

  it("does not glow for non-target handles during the same drag", async () => {
    await renderHandle({
      connectionState: { inProgress: true },
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

  it("shows glow while dragging when connection payload exists without inProgress", async () => {
    await renderHandle({
      connectionState: {
        fromNode: { id: "source-node" },
        fromHandle: { id: "image-out", type: "source" },
      },
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

  it("shows glow from native connection hover target even without custom magnet target", async () => {
    await renderHandle({
      connectionState: {
        inProgress: true,
        isValid: true,
        toNode: { id: "node-1" },
        toHandle: { id: "image-in", type: "target" },
      },
      activeTarget: null,
    });

    const handle = getHandleElement();
    expect(handle.getAttribute("data-glow-state")).toBe("snapped");
  });

  it("adapts glow rendering between light and dark modes", async () => {
    await renderHandle({
      connectionState: { inProgress: true },
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX + 1,
      },
    });

    const lightHandle = getHandleElement();
    const lightShadow = lightHandle.style.boxShadow;
    const lightMode = lightHandle.getAttribute("data-glow-mode");

    document.documentElement.classList.add("dark");

    await renderHandle({
      connectionState: { inProgress: true },
      activeTarget: {
        nodeId: "node-1",
        handleId: "image-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: HANDLE_SNAP_RADIUS_PX + 1,
      },
    });

    const darkHandle = getHandleElement();
    const darkShadow = darkHandle.style.boxShadow;
    const darkMode = darkHandle.getAttribute("data-glow-mode");

    expect(lightMode).toBe("light");
    expect(darkMode).toBe("dark");
    expect(darkShadow).not.toBe(lightShadow);
  });

  it("emits stable handle geometry data attributes", async () => {
    await renderHandle({
      props: {
        nodeId: "node-2",
        id: undefined,
        type: "source",
        position: "right" as React.ComponentProps<typeof CanvasHandle>["position"],
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
