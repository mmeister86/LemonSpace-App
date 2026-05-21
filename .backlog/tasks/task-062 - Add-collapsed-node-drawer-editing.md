---
id: TASK-062
title: Add collapsed node drawer editing
status: Done
assignee: []
created_date: '2026-05-21 07:52'
updated_date: '2026-05-21 11:23'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow users to edit values for a selected collapsed Canvas node in a right-side drawer without expanding the node.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selecting exactly one collapsed editable node opens a right-side Drawer over the Canvas.
- [x] #2 Editing values in the Drawer persists through the existing Canvas node data sync path while the node remains collapsed.
- [x] #3 The Drawer closes on deselect, multi-select, non-collapsed selection, non-editable selection, manual close, or node deletion.
- [x] #4 Focused tests cover drawer visibility and edit persistence.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing drawer behavior tests
2. Implement collapsed-node drawer selection state and editor registry
3. Extract/reuse minimal editable controls for first editable node types
4. Verify focused tests and update task notes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up requested: Drawer needs a preview image, especially for Crop / Resize nodes, so users can edit values with visual context.

Follow-up implemented: added Drawer preview image for collapsed nodes using direct/source preview URLs, including a crop overlay for Crop / Resize nodes. Verification after change: eslint passed for drawer files, focused Canvas tests passed (38 tests), full pnpm test passed (148 files, 892 tests).

Follow-up scope accepted: replace the generic Drawer field editor with reusable node body surfaces so collapsed-node drawers match the actual node functionality, including previews and interactions for Crop, adjustments, and mixer-like nodes.

Follow-up parity implemented: extracted reusable node body surfaces for Crop / Resize, adjustment nodes, Mixer, and image transform nodes, and wired the collapsed-node Drawer registry to render those bodies without BaseNodeWrapper handles/toolbars. Added regression coverage for Crop interactive preview and adjustment preview/slider rendering in the Drawer. Verification: focused drawer+crop tests passed, full pnpm test passed (148 files, 894 tests), pnpm lint passed with 3 pre-existing warnings; pnpm exec tsc --noEmit still fails on pre-existing test typing issues outside this change.

Final verification after adding the Note node body surface: full pnpm test passed again (148 files, 894 tests). TASK-062 remains In Progress for manual testing confirmation.

Follow-up requested: Drawer must not move while interacting with controls/sliders, and the Canvas blur/overlay behind the Drawer should be removed. The Drawer should stay fixed and close only through focus/selection loss or explicit close.

Follow-up implemented: configured the collapsed-node Drawer with Vaul handleOnly + non-modal/no background scaling and no Drawer overlay, so slider/input drags no longer drag the Drawer and the Canvas is no longer blurred/dimmed by the Drawer overlay. Added test coverage for these Drawer props. Verification: focused drawer/crop/mixer tests passed, lint for changed Drawer files passed, full pnpm test passed (148 files, 894 tests).

Follow-up requested: Canvas/sidebar clicks should close the collapsed-node Drawer even if the selected collapsed node remains selected, but NodeToolbar interactions must remain usable while the Drawer is open. Implemented a document-level outside pointer dismiss for the Drawer with exemptions for React Flow node toolbars, selection toolbar, Canvas toolbar, and floating select/popover content. Verification so far: focused Drawer, CanvasSelectionToolbar, and BaseNodeWrapper tests passed (42 tests).

Follow-up verification: outside pointer interactions on canvas/sidebar now close the drawer while node toolbar, selection toolbar, canvas toolbar, and popper/select interactions remain usable. Focused drawer/toolbar/base-wrapper Vitest files passed, and full pnpm test passed with 148 files and 896 tests. TASK-062 remains In Progress for manual testing confirmation.

Follow-up requested: toolbar collapse/expand toggles should be optimistic while the collapsed-node drawer is active; UI currently jumps between collapsed and expanded when stale Convex data replays. Root cause identified in local node data pins: pending updateData pins were merged and could not express deleted data keys such as isCollapsed/expandedSize.

Follow-up implemented: changed pending local node data reconciliation to treat queueNodeDataUpdate pins as full data replacements, including deletion of omitted persisted keys such as isCollapsed and expandedSize, while preserving runtime React Flow/status fields and derived storage URLs. Added regression coverage for expanding a collapsed node while Convex still returns stale collapsed data. Verification: focused reconciliation/helper/base-wrapper/drawer tests passed, lint passed for touched reconciliation files, and full pnpm test passed (148 files, 897 tests). TASK-062 remains In Progress for manual testing confirmation.

Follow-up requested: after the collapsed-node Drawer closes from focus/outside interaction while the node remains selected, clicking that same selected collapsed node should reactivate the Drawer.

Root cause: manualClosedSelectionId was only cleared on selection changes, but clicking an already selected node does not emit a new selection change.

Implemented: document pointer handling now detects pointerdown inside the active selected React Flow node (react-flow__node[data-id]) and clears manualClosedSelectionId, reopening the Drawer without requiring deselect/reselect. Added regression coverage for outside-close followed by clicking the already selected collapsed node.

Verification: focused collapsed drawer test failed before the fix and passed after; focused drawer/base-wrapper/selection-toolbar tests passed (43 tests); full npm test passed (148 files, 898 tests); npm run lint exited 0 with the same three pre-existing unrelated warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Collapsed-node Drawer editing shipped with reusable drawer surfaces, no overlay/drag interference, outside-click dismissal, optimistic collapse/expand reconciliation, and reactivation when clicking the already-selected collapsed node after focus loss. Verification: full npm test passed with 148 files / 898 tests; npm run lint exited 0 with only the existing unrelated warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
