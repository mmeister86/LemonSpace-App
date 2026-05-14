---
id: TASK-034
title: Enforce Redis Rate Limiting
status: Done
assignee: []
created_date: '2026-04-28 19:53'
updated_date: '2026-05-14 20:00'
labels:
  - security
  - redis
  - rate-limiting
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - lib/CLAUDE.md
modified_files:
  - lib/rate-limit.ts
  - 'app/api/auth/[...all]/route.ts'
  - app/api/pexels-video/route.ts
  - app/api/ai-stream/text/route.ts
  - app/api/ai-stream/agent/route.ts
  - tests/lib/rate-limit.test.ts
  - tests/api-rate-limit-routes.test.ts
  - tests/lib/rate-limit-dev-import.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn the existing Redis rate-limit helper into concrete protection for public and sensitive API surfaces. The goal is to enforce configured limits consistently for auth-adjacent routes, external provider proxy routes, and AI/payment-triggering actions where applicable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rate limits are applied to identified public or sensitive Next.js route handlers
- [x] #2 Rate-limit keys distinguish users when authenticated and IP or stable client source when unauthenticated
- [x] #3 Rejected requests return clear status and response semantics without leaking internals
- [x] #4 Redis failures are handled according to an explicit fail-open or fail-closed decision documented in code or local docs
- [x] #5 Existing AI generation caps and concurrency limits remain intact and are not duplicated incorrectly
- [x] #6 Tests cover allowed requests rejected requests key selection and Redis failure behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing Vitest coverage for Redis rate-limit decisions and route wrappers.
2. Extend lib/rate-limit.ts with named policies, hashed identities, fail-open handling, and safe 429 response helpers.
3. Wrap auth, Pexels video, AI text stream, and agent stream route handlers.
4. Run targeted tests, then full test suite and lint where applicable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation started on branch codex/task-034-redis-rate-limiting. Redis failure policy: fail-open. Limit profile: moderate defaults from approved plan.

Scope clarification from user: enforce Redis rate limiting only for production. Localhost/development requests must bypass enforcement so local dev is not throttled.

Implemented production-only Redis-backed rate limiting for auth, Pexels video proxy, AI text stream, and agent stream routes. Local development and localhost, including IPv6 localhost, bypass enforcement. Verification: npm test passed 146 files / 850 tests; npm run lint passed with 0 errors and 4 pre-existing warnings outside this task.

Follow-up after local Redis errors: root cause was eager top-level Redis import from lib/rate-limit.ts before dev/localhost bypasses could return. Redis is now dynamically imported only after production and non-localhost checks pass; added regression test to ensure development bypasses do not import Redis.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented production-only Redis-backed rate limiting for auth, Pexels video proxy, AI text stream, and agent stream routes. Local development and localhost bypass rate limiting without importing Redis. Redis failures fail open with sanitized logging. Verified with npm test and npm run lint.
<!-- SECTION:FINAL_SUMMARY:END -->
