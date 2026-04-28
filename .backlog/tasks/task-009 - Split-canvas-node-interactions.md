---
id: TASK-009
title: Split canvas node interactions
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 10:14'
labels:
  - canvas
  - interactions
  - groups
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `components/canvas/use-canvas-node-interactions.ts` into helpers for resize persistence, group drop target computation, parent changes, and edge-split interaction logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resize persistence logic is isolated.
- [x] #2 Group/frame drop target computation is isolated.
- [x] #3 Parent change computation is isolated.
- [x] #4 Edge intersection split helpers are isolated.
- [x] #5 Existing node interaction tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for resize, group drop, parent assignment, and edge-split interaction flows.
2. Extract resize persistence helpers.
3. Extract group/frame drop target helpers.
4. Extract parent change helpers.
5. Extract edge intersection split helpers.
6. Keep `useCanvasNodeInteractions` as the hook composition layer.
7. Run `npm test -- components/canvas/__tests__/use-canvas-node-interactions.test.tsx` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted node interaction helpers into focused canvas modules while preserving `useCanvasNodeInteractions` as the hook composition/export layer.
- Added direct helper characterization coverage for resize persistence, group drop targeting, parent changes, and edge split payload computation.
- Validation passed: targeted node interaction/helper/grouping/canvas helper tests and `npm run lint` (lint emitted unrelated pre-existing warnings only).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-009 completed. `use-canvas-node-interactions.ts` now delegates resize persistence, group drop target, parent change, and edge intersection split logic to extracted helpers without changing the hook export or behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
