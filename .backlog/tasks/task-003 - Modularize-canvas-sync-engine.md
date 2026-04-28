---
id: TASK-003
title: Modularize canvas sync engine
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 10:05'
labels:
  - canvas
  - refactor
  - sync
  - offline
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `components/canvas/use-canvas-sync-engine.ts` into focused modules for optimistic local patches, queue flushing, pending operation coordination, and node-create action helpers. Preserve the current `useCanvasSyncEngine` and `createCanvasSyncEngineController` public behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing exports from `use-canvas-sync-engine.ts` remain available to current callers.
- [x] #2 Optimistic node and edge remapping logic is isolated in a focused module.
- [x] #3 Queue flush dispatch is isolated from React hook state wiring.
- [x] #4 Pending move, resize, data, and edge split coordination is isolated behind clear helper functions.
- [x] #5 Existing canvas sync, offline queue, and local persistence tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or extend focused tests around queue replay, optimistic node remapping, and create-node-with-edge flows before extraction.
2. Extract pure optimistic update helpers into `components/canvas/canvas-sync-optimistic-updates.ts`.
3. Extract pending operation helpers into `components/canvas/canvas-sync-pending-controller.ts`.
4. Extract queue flush handler dispatch into `components/canvas/canvas-sync-queue-flusher.ts`.
5. Extract online-only create-node action helpers into `components/canvas/canvas-sync-node-create-actions.ts`.
6. Keep `use-canvas-sync-engine.ts` as the hook/controller composition layer.
7. Run targeted canvas sync tests and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted pending operation coordination into `components/canvas/canvas-sync-pending-controller.ts` while preserving `createCanvasSyncEngineController` as a public re-export.
- Extracted optimistic id/remap helpers, queue dispatch/retry helpers, and create-node client-request helpers into focused canvas sync modules.
- Added boundary coverage for the new modules in `components/canvas/__tests__/use-canvas-sync-engine.test.ts`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-003 completed. `use-canvas-sync-engine.ts` now composes focused modules for pending operation coordination, optimistic local patches/remapping, queue flush dispatch, and online-only create-node helper behavior without changing the existing hook/controller exports.
<!-- SECTION:FINAL_SUMMARY:END -->
