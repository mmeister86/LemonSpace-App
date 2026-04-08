# Canvas Graph Query Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce canvas hot-path Convex query overhead by collapsing `nodes:list` and `edges:list` into one shared graph query and keeping the optimistic client cache aligned with that query.

**Architecture:** Add a new Convex `canvasGraph.get` query that performs auth and canvas authorization once, then returns both node and edge collections together. Update the canvas data hook and optimistic local cache helpers to use this graph query as the primary reactive source while leaving the existing list queries available for other callers.

**Tech Stack:** Next.js 16, React 19, Convex, React Flow, TypeScript, Vitest

---

### Task 1: Add a shared Convex graph query

**Files:**
- Create: `convex/canvasGraph.ts`
- Test: `tests/convex/canvas-graph-query.test.ts`

**Step 1:** Write a failing test that expects one graph query to return both nodes and edges for an authorized canvas.

**Step 2:** Run the targeted test and verify it fails for the expected missing-module or missing-export reason.

**Step 3:** Implement `canvasGraph.get` with one auth check, one canvas authorization check, and indexed `nodes` + `edges` reads.

**Step 4:** Re-run the targeted test and confirm it passes.

### Task 2: Switch the canvas hook to the graph query

**Files:**
- Modify: `components/canvas/use-canvas-data.ts`
- Test: `tests/use-canvas-data.test.tsx`

**Step 1:** Write a failing hook test that expects `useCanvasData` to subscribe to the graph query and derive `convexNodes` / `convexEdges` from it.

**Step 2:** Run the targeted test and verify it fails for the expected reason.

**Step 3:** Update the hook to use the graph query result as the primary canvas model without changing the public hook return shape.

**Step 4:** Re-run the targeted test and confirm it passes.

### Task 3: Keep optimistic cache updates aligned with the graph query

**Files:**
- Modify: `components/canvas/use-canvas-sync-engine.ts`
- Create: `components/canvas/canvas-graph-query-cache.ts`
- Test: `components/canvas/__tests__/canvas-graph-query-cache.test.ts`

**Step 1:** Write failing tests for small cache helpers that read and update graph query data during optimistic mutations.

**Step 2:** Run the targeted helper tests and verify they fail for the expected missing-helper reason.

**Step 3:** Implement the helpers and update optimistic mutations to use them so online optimistic canvas updates still work with the new graph query.

**Step 4:** Re-run the targeted tests and confirm they pass.

### Task 4: Verify the hot-path refactor

**Files:**
- Verify only

**Step 1:** Run the targeted new tests for the graph query, hook, and cache helpers.

**Step 2:** Run `pnpm test` to confirm the full suite stays green.

**Step 3:** Run `pnpm lint` on the worktree and fix any regressions in touched files.
