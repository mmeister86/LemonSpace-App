---
id: TASK-047
title: Stabilize crop node preview
status: Done
assignee:
  - Codex
created_date: '2026-05-13 16:37'
updated_date: '2026-05-13 16:45'
labels:
  - canvas
  - crop
dependencies: []
modified_files:
  - components/canvas/nodes/crop-node.tsx
  - components/canvas/__tests__/crop-node.test.tsx
  - components/canvas/__tests__/canvas-helpers.test.ts
  - vitest.config.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keep the Crop / Resize node preview anchored to its input image while users move or resize only the crop grid. Downstream nodes must continue to consume the current crop output through the existing pipeline without data schema changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Crop-node preview renders the input pipeline before the active crop node and does not include the active crop step itself.
- [x] #2 Moving or resizing the crop grid updates only crop parameters and keeps the visible preview image stable.
- [x] #3 Downstream preview/render pipeline still includes the crop node with current local override data so connected nodes receive the selected crop output.
- [x] #4 Automated tests cover crop-node preview step selection and downstream pipeline crop override behavior.
- [x] #5 Targeted tests and lint are run, with any remaining issues reported.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add targeted tests before production changes: verify crop-node preview excludes the active crop step, preserves upstream adjustment steps, and downstream render/adjustment pipeline still includes crop node override data.
2. Run the targeted tests to confirm the new crop-node expectation fails against current behavior.
3. Update crop-node preview step selection so the in-node preview uses only upstream pipeline steps before the active crop node while keeping local crop data as the overlay/persisted source.
4. Run targeted tests until green, then lint.
5. Update task notes and check acceptance criteria that are verified by tests/lint. Do not mark Done until user confirms after review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented crop-node input preview step splitting: the in-node preview now excludes the active crop step while keeping upstream pipeline steps. Added component coverage for direct source, upstream adjustment, and grid movement staying independent from preview steps. Added downstream graph coverage to ensure local crop overrides still flow into render preview steps. Verification: `npm test -- components/canvas/__tests__/crop-node.test.tsx components/canvas/__tests__/canvas-helpers.test.ts` passed (20 tests). `npm run lint` exited 0 with 4 existing warnings in unrelated files: lib/canvas-node-favorite.ts, lib/image-pipeline/backend/webgl/webgl-backend.ts, tests/image-pipeline/parity/fixtures.ts. Manual browser smoke test attempted via dev server on port 3001, but the in-app browser blocked localhost/127.0.0.1 with ERR_BLOCKED_BY_CLIENT; no browser-side mutation was performed.

Additional verification: full `npm test` passed after the implementation (141 test files, 762 tests).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stabilized the Crop / Resize node preview by rendering only upstream input pipeline steps inside the crop node and excluding the active crop step from its own preview. The crop grid remains the source of the active crop parameters, so moving/resizing the grid no longer visually zooms the preview while downstream nodes still receive the selected crop via local graph preview overrides. Added component tests for direct source previews, upstream adjustment previews, and grid movement, plus graph helper coverage for downstream crop override propagation. Verification run during implementation: targeted crop/canvas-helper tests passed, full `npm test` passed with 141 test files and 762 tests, and `npm run lint` exited 0 with four existing unrelated warnings. User manually tested the branch and confirmed the crop node now behaves as desired.
<!-- SECTION:FINAL_SUMMARY:END -->
