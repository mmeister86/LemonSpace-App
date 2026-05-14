---
id: TASK-056
title: Fix AI stream rate limit user identity
status: In Progress
assignee: []
created_date: '2026-05-14 20:09'
updated_date: '2026-05-14 20:14'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coolify production build fails because ai-stream route handlers read a non-existent id property from getAuthUser(). Investigate the returned auth user shape, update affected rate-limit identity extraction, and verify type checking/build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Production TypeScript build no longer errors on getAuthUser().id in ai-stream routes
- [x] #2 All affected route handlers use an existing stable authenticated user identifier for rate limiting
- [x] #3 Relevant type check or build command completes successfully, or any remaining unrelated failure is documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect failing route, auth helper return type, and sibling route handlers
2. Patch rate-limit user identity extraction to match generated Convex auth user shape
3. Update focused tests/mocks if needed
4. Run type/build verification and record results
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: getAuthUser() returns the Convex auth user shape with optional userId and _id, not an id property. Updated ai-stream text, ai-stream agent, and auth route rate-limit identity extraction to use userId ?? _id. Focused route test passed. Production Next build passed outside sandbox after Turbopack could not bind a local port inside the sandbox.
<!-- SECTION:NOTES:END -->
