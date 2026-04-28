---
id: TASK-011
title: Modularize image transform node
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:57'
labels:
  - canvas
  - freepik
  - node
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modularize `components/canvas/nodes/image-transform-node.tsx` by extracting operation config/defaults, transform runner logic, per-operation controls, and the Change Camera stage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Operation defaults and normalization are in focused helpers.
- [x] #2 Transform runner logic is isolated from UI rendering.
- [x] #3 Operation-specific controls are separate components or config-driven renderers.
- [x] #4 Change Camera visual stage is isolated.
- [x] #5 Existing transform node tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for each operation's defaults and run payload if missing.
2. Extract operation config and normalization helpers.
3. Extract transform runner hook.
4. Extract operation control renderers and `ChangeCameraStage`.
5. Keep the main node as a thin wrapper around config, runner, and UI sections.
6. Run `npm test -- tests/change-camera-node.test.ts tests/image-transform-node-utils.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added characterization coverage for operation defaults and normalization.
- Extracted operation config/defaults, operation controls, Change Camera stage rendering, and transform runner hook from `image-transform-node.tsx`.
- Preserved the existing default export and named helper exports from `image-transform-node.tsx`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-011 completed. Requested transform tests pass, and lint completes with warnings only in unrelated pre-existing files.
<!-- SECTION:FINAL_SUMMARY:END -->
