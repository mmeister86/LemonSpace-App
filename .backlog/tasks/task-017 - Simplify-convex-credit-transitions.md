---
id: TASK-017
title: Simplify Convex credit transitions
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - convex
  - credits
  - refactor
  - tests
dependencies:
  - TASK-012
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Simplify repeated balance, tier, daily usage, reservation, release, and concurrency transition logic inside `convex/credits.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Balance and subscription/tier lookup helpers are centralized.
- [ ] #2 Daily usage and concurrency increment/decrement helpers are centralized.
- [ ] #3 Reservation release logic is shared where safe.
- [ ] #4 Existing credit activity and credit transition tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for reserve, commit, release, stale release, and concurrency decrement if missing.
2. Extract local helper functions inside `credits.ts` first.
3. Replace repeated balance/tier/daily usage code with helpers.
4. Replace repeated reservation release code where behavior is identical.
5. Run `npm test -- tests/convex/credit-activity-query.test.ts tests/lib/credits-activity.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
