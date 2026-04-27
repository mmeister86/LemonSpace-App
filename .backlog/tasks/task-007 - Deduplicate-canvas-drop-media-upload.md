---
id: TASK-007
title: Deduplicate canvas drop media upload
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - upload
  - media
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deduplicate image and video drop upload handling in `components/canvas/use-canvas-drop.ts` without changing online-only upload behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Image and video drop flows share common upload and node-creation helpers.
- [ ] #2 File-type-specific metadata adapters remain explicit.
- [ ] #3 Upload error cleanup and optimistic state cleanup are preserved.
- [ ] #4 Existing drop tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for image drop, video drop, and failed upload cleanup.
2. Extract shared upload-to-storage and create-media-node helpers.
3. Keep image/video metadata extraction as small explicit adapters.
4. Replace duplicated branches in `use-canvas-drop.ts` with the shared helper.
5. Run `npm test -- tests/use-canvas-drop.test.ts components/canvas/__tests__/use-canvas-drop.test.tsx` and `npm run lint`.
<!-- SECTION:PLAN:END -->
