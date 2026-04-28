---
id: TASK-018
title: Split Convex Freepik client
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:56'
labels:
  - convex
  - freepik
  - refactor
  - tests
dependencies:
  - TASK-013
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `convex/freepik.ts` into base HTTP client, task parsing, transform endpoint helpers, downloads, and asset search concerns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HTTP request/error mapping code is isolated.
- [x] #2 Task ID/status parsing is shared by video and image transforms.
- [x] #3 Transform endpoint helpers are separated from asset search.
- [x] #4 Existing Freepik tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for search, task creation, task status parsing, download, and error mapping.
2. Create `convex/freepik_client.ts` for base requests, downloads, and errors.
3. Create `convex/freepik_tasks.ts` for task ID/status/path parsing.
4. Create transform-specific helper module(s) and keep public action exports stable.
5. Run `npm test -- tests/convex/freepik-video-client.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Split `convex/freepik.ts` into a stable public facade plus `freepik_client.ts`, `freepik_tasks.ts`, `freepik_transforms.ts`, and `freepik_search.ts`.
- Kept public imports from `@/convex/freepik` stable for video creation/status/downloads, image transforms, error mapping, and asset search.
- `npm test -- tests/convex/freepik-video-client.test.ts tests/convex/image-transforms.test.ts` passes.
- `npm run lint` completes with warnings only from unrelated existing files.
- `npx tsc --noEmit` remains blocked by unrelated existing repository type errors outside the Freepik modules.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the Freepik client modularization while preserving the `convex/freepik.ts` public surface. HTTP requests, retries, downloads, and error mapping now live in `freepik_client.ts`; shared task ID/status parsing lives in `freepik_tasks.ts`; image transform endpoints live in `freepik_transforms.ts`; and asset search mapping lives in `freepik_search.ts` behind the existing `freepik.search` action export.
<!-- SECTION:FINAL_SUMMARY:END -->
