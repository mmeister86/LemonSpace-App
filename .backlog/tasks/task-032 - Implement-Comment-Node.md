---
id: TASK-032
title: Implement Comment Node
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - canvas
  - node-system
  - collaboration
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - components/canvas/CLAUDE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a canvas Comment node for review collaboration notes with thread-like discussion state, mentions-ready content structure, and resolve status. Initial implementation can be single-user friendly while keeping the persisted data model ready for future collaboration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Comment node is available in the canvas node catalog and palette when implemented
- [ ] #2 User can create edit and delete comment content on the canvas
- [ ] #3 Comment node supports resolved and unresolved status with visible state
- [ ] #4 Comment data persists in Convex and reloads correctly
- [ ] #5 Comment content data model can represent threaded replies and mention tokens without requiring realtime collaboration in this task
- [ ] #6 Tests cover rendering editing resolve state and persistence behavior
<!-- AC:END -->
