---
id: TASK-020
title: Split canvas op queue
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:49'
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
- [x] #1 Canvas sync op types and constants are isolated.
- [x] #2 `normalizeOp` is split into per-operation payload normalizers.
- [x] #3 IndexedDB and localStorage fallback storage code is isolated.
- [x] #4 Remap/drop/touch predicates are isolated.
- [x] #5 Existing queue tests pass.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Split `lib/canvas-op-queue.ts` into `canvas-sync-op-types.ts`, `canvas-sync-op-normalize.ts`, `canvas-sync-op-storage.ts`, and `canvas-sync-op-mutations.ts`.
- Kept `lib/canvas-op-queue.ts` as the public compatibility entrypoint for existing imports and public type exports.
- Added `tests/lib/canvas-sync-op-normalize.test.ts` covering normalization for every supported operation type plus metadata defaults and invalid payload rejection.
- Verification: `npm test -- tests/lib/canvas-sync-op-normalize.test.ts` -> passed, 14 tests.
- Verification: `npm test -- components/canvas/__tests__/use-canvas-sync-engine.test.ts` -> passed, 7 tests.
- Verification: `npm test -- components/canvas/__tests__/use-canvas-sync-engine-hook.test.tsx` -> passed, 3 tests.
- Verification: `npm test -- tests/lib/canvas-sync-op-normalize.test.ts components/canvas/__tests__/use-canvas-sync-engine.test.ts components/canvas/__tests__/use-canvas-sync-engine-hook.test.tsx` -> passed, 3 files / 24 tests.
- Verification: `npm run lint` -> exited successfully with 0 errors and 9 pre-existing warnings in unrelated files.
- Additional check: `npx tsc --noEmit --incremental false` -> failed on existing unrelated type errors in canvas delete/presets tests, mixer exports, parameter slider, credits activity tests, splitter config, and pipeline preview tests; no errors were reported for the TASK-020 files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:SUMMARY:BEGIN -->
TASK-020 modularized the canvas sync queue into focused type/constants, normalization, storage, and mutation predicate modules while preserving the existing `@/lib/canvas-op-queue` public API. Focused normalization characterization coverage was added and targeted canvas sync tests plus lint verification were run.
<!-- SECTION:SUMMARY:END -->
