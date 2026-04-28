---
id: TASK-035
title: Harden Sentry Error Tracking
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - observability
  - sentry
  - error-tracking
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - components/canvas/CLAUDE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete Sentry error tracking so frontend route errors, canvas node failures, and relevant backend or action failures are captured with useful context and without sensitive payloads. Existing Sentry setup should be audited and extended where gaps remain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Frontend global and route-level errors are captured with environment and user-safe context
- [ ] #2 Canvas node error boundaries include node type and canvas context without prompts or asset contents
- [ ] #3 Relevant server action or Convex-facing errors are captured or logged through a consistent Sentry-aware path where supported
- [ ] #4 Sensitive fields such as prompts tokens API keys and raw asset URLs are scrubbed before capture
- [ ] #5 Sentry configuration is documented for required environment variables and local behavior
- [ ] #6 Tests or verification steps cover error-boundary capture and scrubbing behavior
<!-- AC:END -->
