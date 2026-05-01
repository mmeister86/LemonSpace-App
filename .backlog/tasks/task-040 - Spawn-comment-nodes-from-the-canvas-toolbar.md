---
id: TASK-040
title: Spawn comment nodes from the canvas toolbar
status: Done
assignee:
  - Codex
created_date: '2026-04-30 11:52'
updated_date: '2026-04-30 12:22'
labels:
  - canvas
  - toolbar
  - comments
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable the existing comment toolbar control to create a new comment node directly on the canvas, so users can add feedback/comments without using drag-and-drop or a separate palette flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clicking the comment icon in the canvas toolbar creates exactly one new comment node on the current canvas.
- [x] #2 The new comment node appears in a sensible visible canvas position using the same persistence and optimistic update flow as other created nodes.
- [x] #3 The toolbar comment action preserves existing toolbar behavior and does not affect other tools such as select, pan, scissors, undo, or redo.
- [x] #4 Automated tests cover the toolbar comment action or the extracted creation logic.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect existing canvas toolbar and placement APIs to reuse the established node creation flow.
2. Add a focused failing test in `components/canvas/__tests__/canvas-toolbar.test.tsx` proving the comment toolbar button creates a `comment` node at the centered canvas position.
3. Wire the toolbar comment button to `useCanvasPlacement().createNodeWithIntersection` with the existing centered position helper.
4. Run the focused toolbar test, then relevant comment/config tests, and update acceptance criteria as verified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented toolbar comment creation by wiring the existing MessageSquare toolbar button to `createNodeWithIntersection` via the comment catalog template and centered canvas positioning. Verified with red-green toolbar coverage plus relevant comment/config tests and targeted ESLint. Per project workflow, task remains In Progress until user confirms after manual testing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented toolbar-driven comment node creation. The existing comment icon now creates a `comment` node through the shared canvas placement flow using the comment catalog template and centered visible canvas positioning, preserving the existing select, hand, scissor, favorites, undo, and redo toolbar behavior.

Verification completed before user confirmation: targeted toolbar/comment tests passed (`24/24`), and targeted ESLint for the touched files exited successfully. User manually tested the feature and confirmed it works.
<!-- SECTION:FINAL_SUMMARY:END -->
