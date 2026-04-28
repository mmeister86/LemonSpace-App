---
id: TASK-029
title: Implement Loop Node
status: To Do
assignee: []
created_date: '2026-04-28 19:53'
labels:
  - canvas
  - node-system
  - control-flow
dependencies: []
documentation:
  - .docs/LemonSpace_PRD.md
  - components/canvas/CLAUDE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Loop control-flow node that can iterate over a connected list or batch of inputs and drive the same downstream operation for each item on the canvas. The work should fit the existing Canvas node taxonomy and connection-policy model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Loop node is available in the canvas node catalog and palette only when its React Flow component and template are implemented
- [ ] #2 Loop node supports connecting a valid list or batch input and exposes clear output semantics for downstream nodes
- [ ] #3 Loop node persists required node data in Convex and survives canvas reloads and offline snapshot recovery
- [ ] #4 Invalid Loop connections are rejected with a clear user-facing reason
- [ ] #5 Unit or component tests cover node rendering connection policy and persistence behavior
<!-- AC:END -->
