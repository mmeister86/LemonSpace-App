# Canvas Presets Load Shedding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `presets:list` as a reactive canvas hot-path subscription while keeping adjustment preset UX intact.

**Architecture:** Move preset loading into `CanvasPresetsProvider` as a one-off client fetch using `useConvex().query(...)` when preset-aware nodes appear, then keep the provider state in sync locally after saves. Adjustment nodes continue to read presets through context, but they stop creating live Convex subscription pressure.

**Tech Stack:** Next.js 16, React 19, Convex, TypeScript, Vitest

---

### Task 1: Convert the provider to one-off loading

**Files:**
- Modify: `components/canvas/canvas-presets-context.tsx`
- Test: `tests/canvas-presets-context.test.ts`

**Step 1:** Write a failing test that expects the provider to fetch presets via an imperative Convex query and expose presets by node type.

**Step 2:** Run the targeted test and verify it fails for the expected reason.

**Step 3:** Implement provider-owned preset state, one-off loading, and derived per-type lookup.

**Step 4:** Re-run the targeted test and confirm it passes.

### Task 2: Keep local preset state fresh after saves

**Files:**
- Modify: `components/canvas/canvas-presets-context.tsx`
- Modify: `components/canvas/nodes/curves-node.tsx`
- Modify: `components/canvas/nodes/color-adjust-node.tsx`
- Modify: `components/canvas/nodes/light-adjust-node.tsx`
- Modify: `components/canvas/nodes/detail-adjust-node.tsx`
- Test: `tests/canvas-presets-context.test.ts`

**Step 1:** Write a failing test that expects saving a preset through context to update the provider state without a reactive query.

**Step 2:** Run the targeted test and verify it fails for the expected reason.

**Step 3:** Add a context-backed save helper and switch the adjustment nodes to use it.

**Step 4:** Re-run the targeted test and confirm it passes.

### Task 3: Verify the presets refactor

**Files:**
- Verify only

**Step 1:** Run the targeted preset tests.

**Step 2:** Run `pnpm test`.

**Step 3:** Run `pnpm lint` and confirm only pre-existing warnings remain.
