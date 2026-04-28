---
id: TASK-023
title: Split dashboard page client
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:55'
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
- [x] #1 Media preview URL resolution is isolated in a hook.
- [x] #2 Dashboard header, workspace, activity, credits, and media preview sections are separate components.
- [x] #3 Pure media item helper functions move out of the page file.
- [x] #4 Existing dashboard snapshot and cache tests pass.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `useDashboardMediaPreviewUrls` to resolve dashboard media preview storage IDs outside `page-client.tsx`.
- Split the dashboard client render into `DashboardHeader`, `DashboardCreditsSection`, `DashboardWorkspaceSection`, `DashboardActivitySection`, and `DashboardMediaPreviewSection`.
- Moved dashboard media card key, label, and metadata helpers into `lib/dashboard-media-preview.ts` with focused unit coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dashboard page client modularization is complete while preserving `DashboardPageClient` as the exported client entry point. Validation passed for the new media helper test, existing dashboard snapshot/cache tests, and targeted lint for TASK-023 files; global lint and broader TypeScript checking are currently blocked by unrelated pre-existing issues outside TASK-023 files.
<!-- SECTION:FINAL_SUMMARY:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for media preview URL map behavior if missing.
2. Create a focused media preview URL map hook.
3. Extract dashboard section components without changing copy or layout behavior.
4. Move pure media helper functions to an existing or new media utility module.
5. Run `npm test -- tests/use-dashboard-snapshot.test.ts tests/lib/dashboard-snapshot-cache.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
