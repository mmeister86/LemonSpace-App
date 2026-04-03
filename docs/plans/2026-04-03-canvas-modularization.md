# Canvas Modularization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `components/canvas/canvas.tsx` into clear, testable domain hooks while preserving all current canvas behavior and public APIs.

**Architecture:** Keep `components/canvas/canvas.tsx` as the composition root and extract the largest logic clusters into domain-specific hooks. Start with sync and reconciliation because they are the most complex and most reusable, then move connection and drop flows, and only then extract a presentational view if it still adds value.

**Tech Stack:** Next.js 16, React 19, Convex, React Flow, TypeScript

---

### Task 1: Lock in the current modularization seams

**Files:**
- Modify: `components/canvas/canvas.tsx`
- Reference: `components/canvas/CLAUDE.md`
- Reference: `docs/plans/2026-04-03-canvas-modularization-design.md`

**Step 1:** Annotate the major responsibility boundaries inside `components/canvas/canvas.tsx` by grouping the existing code into the future modules: sync engine, reconciliation, interactions, connections, drop, and render.

**Step 2:** List the exact state, refs, callbacks, and mutations owned by each future hook in a scratch note or temporary checklist before moving code.

**Step 3:** Identify cross-cutting refs that must stay shared at the orchestrator level, especially optimistic ID handoff state and React Flow instance access.

**Step 4:** Remove the scratch note once the extraction map is clear.

### Task 2: Extract pure helper logic from effect bodies first

**Files:**
- Modify: `components/canvas/canvas.tsx`
- Modify: `components/canvas/canvas-helpers.ts`
- Create: `components/canvas/canvas-flow-reconciliation-helpers.ts`
- Test: `components/canvas/__tests__/canvas-flow-reconciliation-helpers.test.ts`

**Step 1:** Move deterministic edge reconciliation helpers out of `useLayoutEffect` bodies into `components/canvas/canvas-flow-reconciliation-helpers.ts`.

**Step 2:** Move deterministic node reconciliation helpers out of `useLayoutEffect` bodies into `components/canvas/canvas-flow-reconciliation-helpers.ts`.

**Step 3:** Add tests for optimistic edge carry, endpoint remapping, and position pin cleanup.

**Step 4:** Update `components/canvas/canvas.tsx` to call the extracted helpers without changing behavior.

### Task 3: Extract the sync engine hook

**Files:**
- Create: `components/canvas/use-canvas-sync-engine.ts`
- Modify: `components/canvas/canvas.tsx`
- Reference: `lib/canvas-op-queue.ts`
- Reference: `lib/canvas-local-persistence.ts`
- Test: `components/canvas/__tests__/use-canvas-sync-engine.test.ts`

**Step 1:** Create `useCanvasSyncEngine` with the queue state, online state, and mutation wrappers that are currently centered around `components/canvas/canvas.tsx:258` and `components/canvas/canvas.tsx:984`.

**Step 2:** Move deferred optimistic-node handling into the new hook, including pending resize, pending data, and pending move-after-create behavior.

**Step 3:** Return a clear API from the hook for create, move, resize, update-data, remove-edge, batch-remove, and split-edge flows.

**Step 4:** Replace the local inline sync logic in `components/canvas/canvas.tsx` with the hook.

**Step 5:** Add focused tests for optimistic create handoff and deferred resize/update behavior.

### Task 4: Extract the flow reconciliation hook

**Files:**
- Create: `components/canvas/use-canvas-flow-reconciliation.ts`
- Modify: `components/canvas/canvas.tsx`
- Modify: `components/canvas/canvas-flow-reconciliation-helpers.ts`
- Test: `components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts`

**Step 1:** Create `useCanvasFlowReconciliation` to own the current Convex-to-local `useLayoutEffect` synchronization for nodes and edges.

**Step 2:** Pass in only the data it needs: Convex nodes, Convex edges, storage URLs, theme mode, local setters, and shared optimistic refs.

**Step 3:** Keep drag-lock and resize-lock behavior unchanged while moving the effects.

**Step 4:** Add tests or targeted assertions for the drag-lock and optimistic carry behavior that are hardest to reason about from the UI.

### Task 5: Extract node interaction logic

**Files:**
- Create: `components/canvas/use-canvas-node-interactions.ts`
- Modify: `components/canvas/canvas.tsx`
- Reference: `components/canvas/canvas-node-change-helpers.ts`

**Step 1:** Move `onNodesChange`, edge intersection highlighting, drag start, drag, and drag stop into `useCanvasNodeInteractions`.

**Step 2:** Keep the returned API explicit: handlers plus any local highlight state helpers.

**Step 3:** Preserve all resize side effects and split-edge-on-drop behavior exactly.

**Step 4:** Manually verify drag, resize, and edge split interactions on the canvas page.

### Task 6: Extract connection flows

**Files:**
- Create: `components/canvas/use-canvas-connections.ts`
- Modify: `components/canvas/canvas.tsx`
- Reference: `components/canvas/canvas-reconnect.ts`
- Reference: `components/canvas/canvas-connection-drop-menu.tsx`

**Step 1:** Move `onConnect`, `onConnectEnd`, connection drop menu state, and `handleConnectionDropPick` into `useCanvasConnections`.

**Step 2:** Keep validation centralized around `validateCanvasConnection` and `validateCanvasConnectionByType`.

**Step 3:** Reuse the existing reconnect hook by adapting it through the new connection hook rather than rewriting reconnect behavior.

**Step 4:** Manually verify valid connection creation, invalid connection rejection, reconnect, and connection-drop node creation.

### Task 7: Extract drag-and-drop creation flows

**Files:**
- Create: `components/canvas/use-canvas-drop.ts`
- Modify: `components/canvas/canvas.tsx`
- Reference: `components/canvas/canvas-media-utils.ts`

**Step 1:** Move `onDragOver` and `onDrop` into `useCanvasDrop`.

**Step 2:** Keep support for both sidebar/browser JSON payloads and raw node type strings.

**Step 3:** Preserve file upload drop behavior, including image dimension lookup and upload error toasts.

**Step 4:** Manually verify node drop and image file drop flows.

### Task 8: Decide whether a presentational view extraction is still useful

**Files:**
- Create: `components/canvas/canvas-view.tsx`
- Modify: `components/canvas/canvas.tsx`

**Step 1:** Measure the remaining size and readability of `components/canvas/canvas.tsx` after hook extraction.

**Step 2:** If the file still mixes visual structure with too much prop assembly, move the JSX tree into `components/canvas/canvas-view.tsx`.

**Step 3:** Keep `canvas-view.tsx` presentational only; it should not own data-fetching, queue logic, or reconciliation effects.

**Step 4:** Skip this task entirely if the orchestrator is already clearly readable.

### Task 9: Verify behavior after each extraction phase

**Files:**
- Verify only

**Step 1:** Run `pnpm lint components/canvas/canvas.tsx components/canvas/*.ts components/canvas/*.tsx` or the project-equivalent lint command for touched files.

**Step 2:** Run `pnpm tsc --noEmit` or the project-equivalent type-check command.

**Step 3:** Run the targeted canvas tests added during the refactor.

**Step 4:** Manually verify these flows on the real canvas page: create node, drag node, resize node, connect nodes, reconnect edge, delete node, drop node from sidebar, and drop image file.

### Task 10: Finish with small, reviewable commits

**Files:**
- Commit only

**Step 1:** Commit after Task 3 with a message like `refactor(canvas): extract sync engine hook`.

**Step 2:** Commit after Task 4 with a message like `refactor(canvas): extract flow reconciliation hook`.

**Step 3:** Commit after Tasks 5 to 7 with messages scoped to interactions, connections, and drop handling.

**Step 4:** If Task 8 is done, commit it separately as `refactor(canvas): extract canvas view`.
