---
id: TASK-014
title: Split Convex nodes module
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Existing `nodes.*` public Convex exports remain available.
- [ ] #2 Create and create-with-edge helpers share common insertion/idempotency logic.
- [ ] #3 Grouping and parent-cycle logic is isolated.
- [ ] #4 Delete and bridge-edge cleanup helpers are isolated.
- [ ] #5 Existing node, edge, and batch validation tests pass.
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
