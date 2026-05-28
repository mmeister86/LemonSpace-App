// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/canvas-card", () => ({
  default: ({ canvas }: { canvas: { name: string } }) => <div>{canvas.name}</div>,
}));

import { DashboardWorkspaceSection } from "@/components/dashboard/dashboard-page-sections";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("dashboard onboarding targets", () => {
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

  it("marks the workspace section and create action for onboarding", async () => {
    await act(async () => {
      root?.render(
        <DashboardWorkspaceSection
          canvases={[]}
          isCreatingWorkspace={false}
          isCreateDisabled={false}
          isSessionPending={false}
          onCreateWorkspace={vi.fn()}
          onNavigateCanvas={vi.fn()}
        />,
      );
    });

    expect(container?.querySelector('[data-onboarding="dashboard-workspaces"]')).not.toBeNull();
    expect(container?.querySelector('[data-onboarding="dashboard-create-workspace"]')).not.toBeNull();
  });
});
