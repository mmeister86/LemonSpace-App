---
id: TASK-063
title: Improve collapsed node drawer toolbar UX
status: Done
assignee: []
created_date: '2026-05-21 11:41'
updated_date: '2026-05-21 13:54'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve the collapsed canvas node experience so the generic node actions move into the open edit drawer, dragging collapsed nodes does not reopen the drawer, and a manually hidden drawer never blocks the floating node toolbar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When exactly one editable collapsed node is selected and its drawer is open, the drawer shows the generic node actions as a compact navbar and the node's floating toolbar is hidden.
- [x] #2 Dragging a collapsed node does not open or reopen the edit drawer; a click without meaningful pointer movement still reopens it.
- [x] #3 When the drawer is manually hidden for a selected collapsed node, the floating node toolbar remains clickable and unobstructed.
- [x] #4 Multi-selection and expanded-node selection keep the drawer closed as before.
- [x] #5 Focused unit tests cover drawer navbar rendering, drag-vs-click reopening, hidden-drawer hit testing, and floating toolbar visibility.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for drawer navbar, drag-vs-click reopen, hidden drawer hit testing, and floating toolbar visibility
2. Refactor generic node toolbar actions into a reusable row
3. Render the action row inside the collapsed-node drawer and hide the floating toolbar while the drawer is open
4. Change drawer reopen logic to distinguish click from drag and avoid rendering closed drawer content
5. Run focused tests and update task notes/acceptance criteria
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented collapsed-node drawer toolbar UX.
- Extracted reusable generic node action row.
- Drawer renders generic actions as a navbar while open.
- Floating toolbar hides for the active collapsed drawer node.
- Reopen now waits for pointerup and ignores drag movement.
- Drawer content is only rendered while open.
Verification: npm run test -- components/canvas/__tests__/collapsed-node-edit-drawer.test.tsx components/canvas/__tests__/base-node-wrapper.test.tsx => 38 tests passed.
Verification: npm run lint -- affected files => exit 0.

Follow-up from manual review:
- Changed the drawer toolbar from copied floating pill UI to a flat labeled drawer navbar.
- Fixed collapsed nodes keeping expanded outer bounds by applying collapse/expand size changes optimistically to local React Flow node state.
Verification: npm run test -- components/canvas/__tests__/collapsed-node-edit-drawer.test.tsx components/canvas/__tests__/base-node-wrapper.test.tsx => 39 tests passed.
Verification: npm run lint -- affected files => exit 0.

Systematic debugging follow-up:
Root cause 1: Drawer navbar used labeled actions without max-width/overflow rules, so the row could exceed the drawer width. Fixed by making the drawer variant max-width constrained with horizontal overflow and non-shrinking action buttons.
Root cause 2: Existing/stale Convex nodes can have data.isCollapsed=true while height remains the expanded height. React Flow adaptation trusted node.height, so collapsed nodes rendered as empty tall bounds. Fixed by projecting collapsed nodes to COLLAPSED_NODE_HEIGHT in convexNodeToRF.
Verification: npm run test -- components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts components/canvas/__tests__/collapsed-node-edit-drawer.test.tsx components/canvas/__tests__/base-node-wrapper.test.tsx => 46 tests passed.

Second manual-debug follow-up after user reported both issues still persisted. Root cause: React Flow can carry direct width/height/measured dimensions on controlled nodes; those stale dimensions overrode the collapsed style height. Fixed collapse/expand local updates and reconciliation for collapsed incoming nodes to drop stale direct dimensions, and made the collapsed BaseNodeWrapper render its own fixed h-9 visual root. Also changed the drawer toolbar from horizontal overflow to a 5-column constrained grid with truncating labels. Verification: npm run test -- components/canvas/__tests__/collapsed-node-edit-drawer.test.tsx components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts => 47 tests passed. Verification: npm run lint -- affected files => exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the collapsed-node drawer toolbar UX: reusable node action row, drawer navbar for the active collapsed node, floating-toolbar suppression while the drawer is open, click-vs-drag reopen handling, no closed drawer hitbox, and collapsed node height fixes that clear stale React Flow dimensions. Verified with focused drawer/base-wrapper/reconciliation tests and lint.
<!-- SECTION:FINAL_SUMMARY:END -->
