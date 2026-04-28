---
id: TASK-006
title: Unify adjustment node shell
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:55'
labels:
  - canvas
  - node
  - adjustments
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unify `curves-node.tsx`, `color-adjust-node.tsx`, `light-adjust-node.tsx`, and `detail-adjust-node.tsx` behind a shared adjustment node shell/config path while preserving current preset behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The four adjustment nodes use one shared shell or factory-style composition path.
- [x] #2 Node-specific labels, controls, defaults, and preset types remain distinct and correct.
- [x] #3 No adjustment node adds its own `presets.list` query outside the existing provider flow.
- [x] #4 Existing adjustment preview and node tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for one representative preset apply/save flow per adjustment family if missing.
2. Create a shared `AdjustmentNodeShell` and typed config for each adjustment node.
3. Move duplicated preset selection, status, wrapper, and save/apply wiring into the shell.
4. Reduce each adjustment node file to its config and default export composition.
5. Run `npm test -- tests/light-adjust-node.test.ts tests/adjustment-preview.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `AdjustmentNodeShell` with typed configs for `curves`, `color-adjust`, `light-adjust`, and `detail-adjust`.
- Reduced the four adjustment node files to their default export composition while preserving exported node types.
- Kept preset access inside `CanvasPresetsProvider` flow via one `useCanvasAdjustmentPresets(config.nodeType)` call in the shared shell; no `presets.list` queries were added to node files.
- Added `tests/adjustment-node-shell.test.ts` to characterize the shared config path and node-specific shell metadata.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented TASK-006. Adjustment nodes now share one shell/config implementation for wrapper, handles, preset selection, save/apply wiring, preview, local-data persistence, and slider rendering while keeping distinct default exports and per-node configs.

Validation passed: `npm test -- tests/adjustment-node-shell.test.ts tests/light-adjust-node.test.ts tests/adjustment-preview.test.ts` and targeted ESLint for TASK-006 files. Full `npm run lint` is blocked by an unrelated `react-hooks/static-components` error in `components/canvas/nodes/image-transform-node.tsx`.
<!-- SECTION:FINAL_SUMMARY:END -->
