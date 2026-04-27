---
id: TASK-018
title: Split Convex Freepik client
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 HTTP request/error mapping code is isolated.
- [ ] #2 Task ID/status parsing is shared by video and image transforms.
- [ ] #3 Transform endpoint helpers are separated from asset search.
- [ ] #4 Existing Freepik tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for search, task creation, task status parsing, download, and error mapping.
2. Create `convex/freepik_client.ts` for base requests, downloads, and errors.
3. Create `convex/freepik_tasks.ts` for task ID/status/path parsing.
4. Create transform-specific helper module(s) and keep public action exports stable.
5. Run `npm test -- tests/convex/freepik-video-client.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
