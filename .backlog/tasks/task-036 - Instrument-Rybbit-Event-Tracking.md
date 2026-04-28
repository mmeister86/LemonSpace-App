---
id: TASK-036
title: Instrument Rybbit Event Tracking
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - analytics
  - rybbit
  - product-metrics
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - .docs/LemonSpace_Manifest.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add concrete Rybbit event tracking for the product metrics defined in the Manifest and PRD, including first output, generation success or failure, export, retention-relevant activation events, and billing conversion touchpoints where appropriate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rybbit tracks time-to-first-output or enough events to derive it reliably
- [ ] #2 Generation success and failure events include model or operation category without sensitive prompt content
- [ ] #3 Frame or asset export events are tracked with format and canvas-safe metadata
- [ ] #4 Billing checkout starts and successful return states are tracked without payment-sensitive details
- [ ] #5 Events are centralized behind a small helper so names and payloads stay consistent
- [ ] #6 Documentation lists event names payload fields and the PRD metric each event supports
- [ ] #7 Tests or verification steps cover helper behavior and at least one core event emission path
<!-- AC:END -->
