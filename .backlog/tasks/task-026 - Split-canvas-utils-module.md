---
id: TASK-026
title: Split canvas utils module
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:53'
labels:
  - lib
  - canvas
  - refactor
  - tests
dependencies:
  - TASK-022
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `lib/canvas-utils.ts` into focused modules for Convex/React Flow adapters, handle style/glow helpers, node defaults, media sizing, and bridge-edge creation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 React Flow adapter functions are isolated.
- [x] #2 Handle accent/glow style helpers are isolated.
- [x] #3 Node defaults align with node templates and remain available to current callers.
- [x] #4 Bridge-edge logic is isolated and tested.
- [x] #5 Existing canvas utility tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for RF adapter output, handle colors, media sizing, and bridge edges if missing.
2. Create `lib/canvas-rf-adapters.ts`.
3. Create `lib/canvas-handle-style.ts`.
4. Create `lib/canvas-node-defaults.ts` or align defaults with existing template module.
5. Create `lib/canvas-bridge-edges.ts`.
6. Preserve old imports through re-exports or update all consumers in one task.
7. Run `npm test -- components/canvas/__tests__/canvas-helpers.test.ts tests/canvas-connection-policy.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Split `lib/canvas-utils.ts` into `canvas-rf-adapters`, `canvas-handle-style`, `canvas-node-defaults`, and `canvas-bridge-edges`.
- Kept `lib/canvas-utils.ts` as a compatibility facade so current callers continue to work unchanged.
- Added `tests/lib/canvas-utils-modules.test.ts` to cover direct module imports plus facade parity, including bridge-edge creation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-026 completed. Canvas utility responsibilities are isolated into focused modules, legacy exports remain available via the facade, and targeted canvas utility/helper tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
