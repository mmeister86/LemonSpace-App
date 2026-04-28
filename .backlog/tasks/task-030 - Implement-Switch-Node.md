---
id: TASK-030
title: Implement Switch Node
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
Add a Switch control-flow node that routes a single input to one of multiple output paths based on user-defined conditions. The work should integrate with existing canvas handles, connection validation, and persisted node data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Switch node is available in the canvas node catalog and palette only when fully usable
- [ ] #2 User can define at least two named routes with editable conditions or labels
- [ ] #3 Switch node exposes distinct output handles for routes and persists route configuration
- [ ] #4 Connection validation prevents unsupported or ambiguous Switch wiring
- [ ] #5 Tests cover route editing rendering handle behavior and connection-policy rules
<!-- AC:END -->
