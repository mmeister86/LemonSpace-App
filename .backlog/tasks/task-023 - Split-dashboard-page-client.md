---
id: TASK-023
title: Split dashboard page client
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - app
  - dashboard
  - refactor
  - ui
  - tests
dependencies:
  - TASK-021
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `app/dashboard/page-client.tsx` into a media preview URL hook and focused dashboard section components while preserving dashboard behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Media preview URL resolution is isolated in a hook.
- [ ] #2 Dashboard header, workspace, activity, credits, and media preview sections are separate components.
- [ ] #3 Pure media item helper functions move out of the page file.
- [ ] #4 Existing dashboard snapshot and cache tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for media preview URL map behavior if missing.
2. Create a focused media preview URL map hook.
3. Extract dashboard section components without changing copy or layout behavior.
4. Move pure media helper functions to an existing or new media utility module.
5. Run `npm test -- tests/use-dashboard-snapshot.test.ts tests/lib/dashboard-snapshot-cache.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
