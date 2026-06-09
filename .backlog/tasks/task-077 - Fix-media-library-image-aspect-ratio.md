---
id: TASK-077
title: Fix media library image aspect ratio
status: In Progress
assignee: []
created_date: '2026-06-09 07:28'
updated_date: '2026-06-09 07:30'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure image nodes selected from the media library use reliable intrinsic dimensions for sizing. The bug is that the media library pick path trusts archived width and height blindly, unlike uploads that decode natural image dimensions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selecting an image from the media library without valid width/height decodes available image URLs and resizes the node using the detected aspect ratio
- [x] #2 Selecting an image with stale or wrong archived dimensions prefers decoded real image dimensions when available
- [x] #3 If decoding fails and no valid dimensions exist, the pick still applies safely without triggering a wrong resize
- [x] #4 Focused regression tests and lint pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing ImageNode regression tests for media-library picks with missing dimensions, stale dimensions, and decode failure fallback.
2. Update MediaLibraryDialog item mapping to include a transient resolved original storage URL separate from the preview URL.
3. Add ImageNode helper logic that resolves reliable media-library dimensions, preferring decoded image dimensions when available and falling back safely.
4. Run focused tests, lint, and update TASK-077 acceptance criteria/notes while keeping the task In Progress pending user confirmation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation started from user-approved plan. Remote task fetch failed inside sandbox due .git/FETCH_HEAD permission, but TASK-077 was created locally and will be maintained via backlog CLI.

Implemented TDD fix for media-library image picks. RED verification: image-node regressions failed for missing/stale dimensions; media-library-dialog regression failed for missing resolvedOriginalUrl. GREEN verification: npm test -- components/canvas/__tests__/image-node.test.tsx components/media/__tests__/media-library-dialog.test.tsx passed 16 tests. Lint verification: npm run lint exited 0 with 3 pre-existing warnings in unrelated image-pipeline files. Task remains In Progress pending user manual confirmation before Done.
<!-- SECTION:NOTES:END -->
