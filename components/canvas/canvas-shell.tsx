"use client";

/**
 * Onboarding note:
 * Client layout shell for the editor. It owns sidebar sizing and rail-mode state, not graph or node persistence.
 */

import { useCallback, useState } from "react";

import Canvas from "@/components/canvas/canvas";
import ConnectionBanner from "@/components/canvas/connection-banner";
import CanvasSidebar from "@/components/canvas/canvas-sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Id } from "@/convex/_generated/dataModel";

const SIDEBAR_DEFAULT_SIZE = "18%";
const SIDEBAR_COLLAPSE_THRESHOLD = "10%";
const SIDEBAR_MAX_SIZE = "40%";
const SIDEBAR_COLLAPSED_SIZE = "84px";
const SIDEBAR_RAIL_MAX_WIDTH_PX = 148;
const MAIN_PANEL_MIN_SIZE = "40%";

type CanvasShellProps = {
  canvasId: Id<"canvases">;
};

type PanelSize = {
  asPercentage: number;
  inPixels: number;
};

export function CanvasShell({ canvasId }: CanvasShellProps) {
  const [isSidebarRail, setIsSidebarRail] = useState(false);

  const handleSidebarResize = useCallback((panelSize: PanelSize) => {
    setIsSidebarRail(panelSize.inPixels <= SIDEBAR_RAIL_MAX_WIDTH_PX);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden overscroll-none">
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full w-full min-h-0 min-w-0 overflow-hidden"
      >
        <ResizablePanel
          id="canvas-sidebar-panel"
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_COLLAPSE_THRESHOLD}
          maxSize={SIDEBAR_MAX_SIZE}
          collapsible
          collapsedSize={SIDEBAR_COLLAPSED_SIZE}
          className="min-h-0 min-w-0 overflow-hidden"
          onResize={handleSidebarResize}
        >
          <CanvasSidebar canvasId={canvasId} railMode={isSidebarRail} />
        </ResizablePanel>

        <ResizableHandle
          withHandle
          className="w-1 bg-border/80 transition-colors hover:bg-primary/30"
        />

        <ResizablePanel
          id="canvas-main-panel"
          minSize={MAIN_PANEL_MIN_SIZE}
          className="min-h-0 min-w-0"
        >
          <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden">
            <ConnectionBanner />
            <Canvas canvasId={canvasId} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
