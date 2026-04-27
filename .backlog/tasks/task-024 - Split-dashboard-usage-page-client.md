---
id: TASK-024
title: Split dashboard usage page client
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - app
  - dashboard
  - credits
  - refactor
  - tests
dependencies:
  - TASK-021
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `app/dashboard/usage/page-client.tsx` by moving credit activity filtering, sorting, pagination, and summary view-model logic into pure helpers or a hook.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Date parsing, bounds, filtering, sorting, and pagination are pure tested helpers.
- [ ] #2 Page component delegates view-model creation to a hook or helper.
- [ ] #3 Summary cards, filters, table, and pagination are separable UI sections.
- [ ] #4 Existing credit activity tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for credit activity filtering, sorting, date range, and pagination behavior.
2. Create `lib/credit-activity-filtering.ts` or equivalent focused helper module.
3. Optionally create `hooks/use-credit-activity-view-model.ts` if hook state remains significant.
4. Extract UI sections from the page file.
5. Run `npm test -- tests/lib/credit-activity-cache.test.ts tests/lib/credits-activity.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
