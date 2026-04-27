---
id: TASK-003
title: Modularize canvas sync engine
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Existing exports from `use-canvas-sync-engine.ts` remain available to current callers.
- [ ] #2 Optimistic node and edge remapping logic is isolated in a focused module.
- [ ] #3 Queue flush dispatch is isolated from React hook state wiring.
- [ ] #4 Pending move, resize, data, and edge split coordination is isolated behind clear helper functions.
- [ ] #5 Existing canvas sync, offline queue, and local persistence tests pass.
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
