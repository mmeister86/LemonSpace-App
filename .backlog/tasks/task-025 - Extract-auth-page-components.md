---
id: TASK-025
title: Extract auth page components
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - app
  - auth
  - ui
  - refactor
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared auth card, field, social provider placeholder, message, and German error-copy helpers from `app/auth/sign-in/page.tsx` and `app/auth/sign-up/page.tsx`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sign-in and sign-up pages share auth layout/card primitives.
- [ ] #2 Social provider placeholder list is defined once.
- [ ] #3 German auth error mapping is shared where messages match.
- [ ] #4 Existing visible behavior and copy are preserved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add smoke tests for sign-in/sign-up visible labels and error copy if missing.
2. Create shared auth UI components under `components/auth/`.
3. Create shared auth copy/error helper.
4. Replace duplicated markup in sign-in and sign-up pages.
5. Run focused auth page tests if present and `npm run lint`.
<!-- SECTION:PLAN:END -->
