---
id: TASK-012
title: Extract Convex job credit flow
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - convex
  - credits
  - jobs
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared credit reservation, release, commit, and concurrency cleanup helpers used by `convex/ai.ts`, `convex/agents.ts`, and `convex/image_transforms.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AI, agent, and image transform jobs use shared credit/concurrency helper functions.
- [ ] #2 `INTERNAL_CREDITS_ENABLED` behavior remains unchanged.
- [ ] #3 Failure cleanup still releases reservations and decrements concurrency exactly once.
- [ ] #4 Existing Convex AI, agent, transform, and credit tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for success, provider failure, timeout, and early validation failure credit cleanup.
2. Create `convex/job_credit_flow.ts` with reservation, release, commit, and concurrency helpers.
3. Replace local duplicated helper implementations in AI, agent, and transform flows.
4. Keep public Convex action/mutation names unchanged.
5. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/credit-activity-query.test.ts tests/convex/agent-orchestration-contract.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
