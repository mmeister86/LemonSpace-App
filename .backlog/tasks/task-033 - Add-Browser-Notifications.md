---
id: TASK-033
title: Add Browser Notifications
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - ux
  - notifications
  - canvas
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - .docs/LemonSpace_Manifest.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add opt-in browser notifications for long-running canvas jobs so users who leave the tab can be notified when a generation or agent job completes or fails. Notifications must complement node-local status and never block the canvas workflow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 User can opt in to browser notifications from an appropriate in-app surface
- [ ] #2 Permission requests are only triggered by explicit user action
- [ ] #3 Completed and failed long-running jobs can trigger native browser notifications when the page is not focused
- [ ] #4 Notification content is concise and does not expose sensitive prompt or asset details
- [ ] #5 Notification behavior degrades gracefully when permission is denied or the browser does not support notifications
- [ ] #6 Tests cover permission state handling event triggering and no-notification fallback
<!-- AC:END -->
