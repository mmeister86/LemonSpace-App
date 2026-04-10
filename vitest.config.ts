import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "components/canvas/__tests__/canvas-helpers.test.ts",
      "components/canvas/__tests__/default-edge.test.tsx",
      "components/canvas/__tests__/canvas-connection-drop-menu.test.tsx",
      "components/canvas/__tests__/canvas-connection-drop-target.test.tsx",
      "components/canvas/__tests__/canvas-flow-reconciliation-helpers.test.ts",
      "components/canvas/__tests__/compare-node.test.tsx",
      "components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts",
      "components/canvas/__tests__/use-canvas-drop.test.tsx",
      "components/canvas/__tests__/use-canvas-connections.test.tsx",
      "components/canvas/__tests__/use-canvas-edge-insertions.test.tsx",
      "components/canvas/__tests__/use-canvas-edge-types.test.tsx",
      "components/canvas/__tests__/use-canvas-node-interactions.test.tsx",
      "components/canvas/__tests__/canvas-delete-handlers.test.tsx",
      "components/canvas/__tests__/canvas-media-utils.test.ts",
      "components/canvas/__tests__/base-node-wrapper.test.tsx",
      "components/canvas/__tests__/use-node-local-data.test.tsx",
      "components/canvas/__tests__/use-canvas-sync-engine.test.ts",
      "components/canvas/__tests__/use-canvas-sync-engine-hook.test.tsx",
      "components/canvas/__tests__/asset-browser-panel.test.tsx",
      "components/canvas/__tests__/video-browser-panel.test.tsx",
      "components/media/__tests__/media-preview-utils.test.ts",
    ],
  },
});
