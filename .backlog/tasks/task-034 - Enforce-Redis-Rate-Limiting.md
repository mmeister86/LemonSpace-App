---
id: TASK-034
title: Enforce Redis Rate Limiting
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - security
  - redis
  - rate-limiting
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - lib/CLAUDE.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn the existing Redis rate-limit helper into concrete protection for public and sensitive API surfaces. The goal is to enforce configured limits consistently for auth-adjacent routes, external provider proxy routes, and AI/payment-triggering actions where applicable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rate limits are applied to identified public or sensitive Next.js route handlers
- [ ] #2 Rate-limit keys distinguish users when authenticated and IP or stable client source when unauthenticated
- [ ] #3 Rejected requests return clear status and response semantics without leaking internals
- [ ] #4 Redis failures are handled according to an explicit fail-open or fail-closed decision documented in code or local docs
- [ ] #5 Existing AI generation caps and concurrency limits remain intact and are not duplicated incorrectly
- [ ] #6 Tests cover allowed requests rejected requests key selection and Redis failure behavior
<!-- AC:END -->
