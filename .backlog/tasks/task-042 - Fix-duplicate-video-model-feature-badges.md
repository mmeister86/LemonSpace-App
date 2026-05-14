---
id: TASK-042
title: Fix duplicate video model feature badges
status: Done
assignee: []
created_date: '2026-05-03 14:35'
updated_date: '2026-05-14 19:28'
labels:
  - bug
  - canvas
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve the React console warning in the Canvas AI model selector where text-to-video models render duplicate `video` feature badges with the same React key. The fix should address the duplicate feature data at its source while preserving expected feature metadata for image-to-video models.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Video model selector options do not include duplicate feature keys for any model
- [x] #2 Text-to-video models still expose the video feature badge
- [x] #3 Image-to-video models expose both multimodal and video feature badges
- [x] #4 A focused regression test covers duplicate-free video selector feature output
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect selector stack and model registry to find the source of duplicate feature keys.
2. Add a focused regression test for video selector feature output.
3. Fix the source data mapping so feature arrays are unique while preserving video/multimodal semantics.
4. Run targeted tests and check acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: buildVideoModelSelectorOptions emitted ["video", "video"] for text-to-video models because the conditional feature and the always-present video feature both resolved to video when supportsImageToVideo was false.

Added a regression in tests/lib/canvas-ai-model-selector.test.ts and verified red-green: it failed before the source fix with duplicate video features and passed after mapping text-to-video to ["video"] and image-to-video to ["multimodal", "video"].

Verification: npm test -- tests/lib/canvas-ai-model-selector.test.ts passed 5/5. npm run lint exited 0 with 4 pre-existing warnings in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
User confirmed completion. Acceptance criteria were already checked; targeted regression for duplicate-free video model feature badges passed, and lint had only unrelated pre-existing warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
