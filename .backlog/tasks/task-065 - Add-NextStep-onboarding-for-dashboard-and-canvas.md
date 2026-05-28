---
id: TASK-065
title: Add NextStep onboarding for dashboard and canvas
status: Done
assignee: []
created_date: '2026-05-23 06:35'
updated_date: '2026-05-28 08:15'
labels:
  - onboarding
  - frontend
  - convex
dependencies: []
documentation:
  - 'https://nextstepjs.com/react'
modified_files:
  - components/providers.tsx
  - components/onboarding/
  - lib/onboarding/
  - convex/schema.ts
  - convex/onboarding.ts
  - components/dashboard/
  - components/canvas/
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement an activating onboarding flow that guides new LemonSpace users from the dashboard into a canvas and toward their first visible output. The flow should auto-start once for new users, remain manually restartable, and persist progress account-wide with a local fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 NextStep is mounted for authenticated app routes and can run tours across dashboard and canvas routes without static dynamic-route assumptions.
- [x] #2 Dashboard and Canvas expose stable onboarding targets for the planned steps without fragile selectors.
- [x] #3 Dashboard onboarding auto-starts once for incomplete users and can be restarted from a help control.
- [x] #4 Creating a workspace marks dashboard progress and starts the Canvas onboarding on the new canvas route via local pending state.
- [x] #5 Onboarding progress, skip, completion, and activation milestones persist through Convex user settings with localStorage fallback behavior covered by tests.
- [x] #6 Canvas onboarding can guide users through the surface, node creation controls, prompt input, generation button, and output/activation state.
- [x] #7 Relevant unit/component tests cover storage merging, provider auto-start behavior, and stable target rendering.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for onboarding storage merge, provider auto-start behavior, and stable UI targets.
2. Implement Convex onboarding state schema and mutations.
3. Add local onboarding storage helpers and tour definitions.
4. Mount NextStep provider/card/help controls in authenticated app providers.
5. Add dashboard and canvas target attributes plus pending Canvas tour handoff.
6. Add activation milestone detection for first completed output.
7. Run targeted tests, lint, and update Backlog notes/AC checks without closing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented NextStep onboarding provider, tour card, help button, Convex onboarding persistence, localStorage fallback helpers, pending Canvas-tour handoff, stable Dashboard/Canvas targets, and first-output milestone detection.

Verification: targeted onboarding tests passed (21/21); full Vitest suite passed (151 files, 912 tests); ESLint exited 0 with three pre-existing warnings in WebGL/parity files; Convex codegen completed successfully with network access; local dev smoke returned /dashboard 307 to /auth/sign-in and /auth/sign-in 200 HTML.

TypeScript note: pnpm exec tsc --noEmit still fails on pre-existing unrelated test typing issues in base-node-wrapper.test.tsx, comment-node.test.tsx, rate-limit tests, and prompt-node.test.ts. No new Onboarding files were listed in that failure output.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the NextStep onboarding flow across dashboard and canvas, including account-level Convex progress, local fallback state, restart controls, dashboard-to-canvas handoff, activation milestone detection, and focused tests. Fresh verification before commit: pnpm test passed 151 files / 919 tests; pnpm run lint exited 0 with 3 existing warnings in WebGL/parity files.
<!-- SECTION:FINAL_SUMMARY:END -->
