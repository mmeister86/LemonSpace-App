---
id: TASK-014
title: Split Convex nodes module
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:50'
labels:
  - convex
  - nodes
  - refactor
  - tests
dependencies:
  - TASK-015
  - TASK-019
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `convex/nodes.ts` into focused helper modules for write helpers, idempotency, grouping, delete cleanup, and validation while preserving current public Convex exports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Existing `nodes.*` public Convex exports remain available.
- [x] #2 Create and create-with-edge helpers share common insertion/idempotency logic.
- [x] #3 Grouping and parent-cycle logic is isolated.
- [x] #4 Delete and bridge-edge cleanup helpers are isolated.
- [x] #5 Existing node, edge, and batch validation tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for idempotent create, edge split, grouping, ungrouping, and batch remove if missing.
2. Extract node write helpers and data normalization.
3. Extract idempotency helpers.
4. Extract grouping and parent-cycle helpers.
5. Extract delete cleanup helpers.
6. Keep `convex/nodes.ts` as the public API facade.
7. Run `npm test -- tests/convex/batch-validation-utils.test.ts tests/convex/edges-create.test.ts tests/convex/canvas-graph-query.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `tests/convex/nodes-helper-modules.test.ts` as helper-boundary characterization coverage. Initial red run: `npm test -- tests/convex/nodes-helper-modules.test.ts` failed with `Cannot find module '@/convex/nodes/delete_cleanup'`, confirming the missing extracted modules.
- Extracted node write/data normalization helpers to `convex/nodes/write_helpers.ts`, idempotency and optimistic reference resolution to `convex/nodes/idempotency.ts`, grouping/parent-cycle validation to `convex/nodes/grouping.ts`, connection/batch validation to `convex/nodes/validation.ts`, and delete/edge/child cleanup to `convex/nodes/delete_cleanup.ts`.
- Kept `convex/nodes.ts` as the public Convex facade; existing exported queries/mutations remain in that file.
- Verification: `npm test -- tests/convex/nodes-helper-modules.test.ts` passed, 1 file / 4 tests.
- Verification: `npm test -- tests/convex/batch-validation-utils.test.ts tests/convex/edges-create.test.ts tests/convex/canvas-graph-query.test.ts tests/convex/nodes-helper-modules.test.ts` passed, 4 files / 13 tests.
- Verification: `npm run lint` completed with 0 errors and 6 warnings in pre-existing unrelated files (`components/canvas/nodes/mixer-node.tsx`, `lib/canvas-node-favorite.ts`, `lib/image-pipeline/backend/webgl/webgl-backend.ts`, `tests/image-pipeline/parity/fixtures.ts`).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-014 complete. `convex/nodes.ts` now delegates focused helper responsibilities for write/idempotency/grouping/validation/delete cleanup while preserving public Convex exports and behavior, backed by new helper module characterization tests plus the requested Convex regression tests.
<!-- SECTION:FINAL_SUMMARY:END -->
