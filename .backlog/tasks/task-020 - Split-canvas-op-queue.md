---
id: TASK-020
title: Split canvas op queue
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - lib
  - canvas
  - sync
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `lib/canvas-op-queue.ts` into types, operation normalization, storage adapters, and remap/touch predicate helpers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Canvas sync op types and constants are isolated.
- [ ] #2 `normalizeOp` is split into per-operation payload normalizers.
- [ ] #3 IndexedDB and localStorage fallback storage code is isolated.
- [ ] #4 Remap/drop/touch predicates are isolated.
- [ ] #5 Existing queue tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for normalization of every supported operation type if missing.
2. Create `lib/canvas-sync-op-types.ts`.
3. Create `lib/canvas-sync-op-normalize.ts`.
4. Create `lib/canvas-sync-op-storage.ts`.
5. Create `lib/canvas-sync-op-mutations.ts` for remap/touch/drop helpers.
6. Keep public queue functions exported from `canvas-op-queue.ts` or update all imports in the same task.
7. Run queue/local persistence tests and `npm run lint`.
<!-- SECTION:PLAN:END -->
