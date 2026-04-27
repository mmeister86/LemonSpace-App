---
id: TASK-010
title: Extract canvas toolbar placement
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - toolbar
  - ui
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract placement and snap geometry from `components/canvas/canvas-toolbar.tsx` into a hook and pure helpers while preserving toolbar UI behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toolbar placement state lives in a focused hook.
- [ ] #2 Snap/position math is covered by pure helper tests.
- [ ] #3 Node menu, name editor, and tool buttons are separable UI units.
- [ ] #4 Existing toolbar behavior is preserved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for snap geometry and placement persistence if missing.
2. Extract pure toolbar placement helpers.
3. Extract a placement hook used by `CanvasToolbar`.
4. Split obvious UI subcomponents without changing labels or event behavior.
5. Run focused toolbar/helper tests and `npm run lint`.
<!-- SECTION:PLAN:END -->
