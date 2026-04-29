---
id: TASK-032
title: Implement Comment Node
status: Done
assignee:
  - Codex
created_date: '2026-04-28 19:53'
updated_date: '2026-04-29 09:44'
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
- [x] #1 Comment node is available in the canvas node catalog and palette when implemented
- [x] #2 User can create edit and delete comment content on the canvas
- [x] #3 Comment node supports resolved and unresolved status with visible state
- [x] #4 Comment data persists in Convex and reloads correctly
- [x] #5 Comment content data model can represent threaded replies and mention tokens without requiring realtime collaboration in this task
- [x] #6 Tests cover rendering editing resolve state and persistence behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add focused failing tests for comment node config, data helpers, component behavior, and sidebar/drop creation.
2. Implement comment data helpers and CommentNode UI with resolved status, body editing, replies, mention token rendering, and sanitized persistence payloads via queueNodeDataUpdate.
3. Register comment in nodeTypes and expose it through defaults, templates, picker icons, resize config, and catalog palette enablement.
4. Run targeted comment/config/drop tests, then lint. Check acceptance criteria that are verified by tests and summarize remaining manual validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Comment node UI, data helpers, node registration, palette/default/template exposure, non-connectable handle config, and Vitest coverage. Verification run: npm test -- comment (3 files, 9 tests passed); npm test -- canvas-agent-config use-canvas-drop (3 files, 19 tests passed, with expected existing preview-failure stderr); npm run lint (0 errors, 4 pre-existing warnings outside this task). AC #4 remains open pending manual Canvas persistence/reload confirmation.

Fixed placement errors reported during manual testing: connection-created placement and body-drop connection targeting now reject non-connectable comment nodes before creating React Flow edges. Added regression coverage in canvas-connection-drop-menu-actions and canvas-connection-drop-target. Verification: npm test -- comment canvas-connection-drop-menu-actions canvas-connection-drop-target canvas-agent-config use-canvas-drop (8 files, 43 tests passed); npm run lint (0 errors, 4 pre-existing warnings).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the canvas Comment node for review collaboration notes. Added the Comment node UI with resolved/unresolved state, main comment editing and clearing, threaded reply add/edit/delete behavior, mention-token rendering, and a future-ready persisted data shape. Registered the node in React Flow, catalog, palette/templates, defaults, resize config, and non-connectable handle metadata.

Fixed placement regressions found during manual testing by preventing non-connectable Comment nodes from being used in connection-created placement paths or body-drop edge targeting. Added regression coverage for both paths.

Verification: npm test -- comment; npm test -- canvas-agent-config use-canvas-drop; npm test -- comment canvas-connection-drop-menu-actions canvas-connection-drop-target canvas-agent-config use-canvas-drop; npm run lint. Lint completed with 0 errors and only pre-existing warnings outside this task. User manually confirmed the feature is done, including persistence/reload behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
