# Canvas Convex Load Shedding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Convex canvas-page load by removing non-essential hot-path queries and collapsing redundant read models.

**Architecture:** The canvas keeps `nodes:list`, `edges:list`, and `canvases:get` as the primary real-time model while shedding secondary reads. Storage URLs move to a client-derived fallback path, presets move to a shared context backed by one query, and the toolbar stops depending on the subscription query.

**Tech Stack:** Next.js 16, React 19, Convex, React Flow, TypeScript

---

### Task 1: Remove unnecessary canvas hot-path queries

**Files:**
- Modify: `components/canvas/canvas.tsx`
- Modify: `components/canvas/credit-display.tsx`
- Modify: `components/canvas/canvas-toolbar.tsx`

**Step 1:** Remove the debug-only `api.auth.safeGetAuthUser` query from `components/canvas/canvas.tsx`.

**Step 2:** Remove `api.credits.getSubscription` dependency from `components/canvas/credit-display.tsx` and keep the widget on the balance query only.

**Step 3:** Update toolbar rendering only as needed to match the leaner credit widget.

### Task 2: Remove server-side storage URL batching from the canvas hot path

**Files:**
- Modify: `components/canvas/canvas.tsx`
- Modify: `lib/canvas-utils.ts`

**Step 1:** Stop subscribing to `api.storage.batchGetUrlsForCanvas` from the canvas page.

**Step 2:** Extend `convexNodeDocWithMergedStorageUrl` to synthesize a stable fallback URL from `storageId` when no cached URL exists.

**Step 3:** Preserve previous merged URLs when available so existing anti-flicker behavior remains intact.

### Task 3: Collapse preset reads into one shared query

**Files:**
- Create: `components/canvas/canvas-presets-context.tsx`
- Modify: `components/canvas/canvas.tsx`
- Modify: `components/canvas/nodes/curves-node.tsx`
- Modify: `components/canvas/nodes/color-adjust-node.tsx`
- Modify: `components/canvas/nodes/light-adjust-node.tsx`
- Modify: `components/canvas/nodes/detail-adjust-node.tsx`

**Step 1:** Add a shared presets provider that executes one `api.presets.list` query.

**Step 2:** Filter presets client-side by node type via a small hook/helper.

**Step 3:** Replace per-node `useAuthQuery(api.presets.list, { nodeType })` calls with the shared presets hook.

### Task 4: Verify the refactor

**Files:**
- Verify only

**Step 1:** Run lint on touched files.

**Step 2:** Run targeted type-check or full type-check if feasible.

**Step 3:** Reproduce canvas placement flow and confirm Convex hot-path query count is reduced.
