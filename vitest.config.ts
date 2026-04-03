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
      "components/canvas/__tests__/canvas-flow-reconciliation-helpers.test.ts",
      "components/canvas/__tests__/use-canvas-sync-engine.test.ts",
      "components/canvas/__tests__/use-canvas-sync-engine-hook.test.tsx",
    ],
  },
});
