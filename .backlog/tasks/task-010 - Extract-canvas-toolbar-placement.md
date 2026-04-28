---
id: TASK-010
title: Extract canvas toolbar placement
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:55'
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
- [x] #1 Toolbar placement state lives in a focused hook.
- [x] #2 Snap/position math is covered by pure helper tests.
- [x] #3 Node menu, name editor, and tool buttons are separable UI units.
- [x] #4 Existing toolbar behavior is preserved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for snap geometry and placement persistence if missing.
2. Extract pure toolbar placement helpers.
3. Extract a placement hook used by `CanvasToolbar`.
4. Split obvious UI subcomponents without changing labels or event behavior.
5. Run focused toolbar/helper tests and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted `useCanvasToolbarPlacement` and pure snap/clamp helpers into `components/canvas/canvas-toolbar-placement.ts`.
- Preserved `resolveToolbarSnapSide` as an export from `components/canvas/canvas-toolbar.tsx` for existing callers/tests.
- Split toolbar UI into `CanvasToolbarNodeMenu`, `CanvasToolbarToolButtons`, and `CanvasToolbarNameEditor` within the toolbar module to keep behavior unchanged.
- Added pure helper coverage for snap target geometry and clamped free placement.
- Validation: `npm test -- components/canvas/__tests__/canvas-toolbar.test.tsx components/canvas/__tests__/canvas-selection-toolbar.test.tsx` passed; changed files lint passed via `npx eslint components/canvas/canvas-toolbar.tsx components/canvas/canvas-toolbar-placement.ts components/canvas/__tests__/canvas-toolbar.test.tsx`.
- Full `npm run lint` is blocked by pre-existing unrelated errors in `app/dashboard/page-client.tsx` plus unrelated warnings in other files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-010 is complete. Toolbar placement state now lives in a focused hook, snap geometry helpers are pure and covered by tests, the main toolbar UI is split into separable units, and existing toolbar behavior is covered by the focused toolbar test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
