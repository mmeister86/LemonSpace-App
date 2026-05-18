---
id: TASK-060
title: Add collapsible canvas nodes
status: Done
assignee: []
created_date: '2026-05-18 20:58'
updated_date: '2026-05-18 21:09'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a persisted collapse mode for normal Canvas nodes from the per-node toolbar. Collapsed nodes keep their current width, shrink to a thin name bar, and keep incoming/outgoing React Flow connections visible and usable. Group and frame nodes remain non-collapsible because they are spatial containers/export surfaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Node toolbar exposes collapse and expand actions for normal canvas nodes.
- [x] #2 Collapsed state persists in node data and restores after reload/sync.
- [x] #3 Collapsed nodes render a thin label bar with the best available user-facing node name.
- [x] #4 Collapsed nodes preserve incoming and outgoing handle IDs so existing connections remain visible and usable.
- [x] #5 Group and frame nodes do not expose collapse controls.
- [x] #6 Relevant unit tests cover metadata helpers, toolbar behavior, collapsed rendering, excluded nodes, and handle preservation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing metadata helper tests for collapsed state preservation.
2. Add failing BaseNodeWrapper tests for toolbar collapse/expand, collapsed rendering, excluded group/frame nodes, and handle preservation.
3. Implement metadata helpers in lib/canvas-node-favorite.ts and update preservation.
4. Implement BaseNodeWrapper collapse UI, resize behavior, collapsed label resolution, and collapsed handles.
5. Run targeted tests, lint, and broader tests if runtime is reasonable.
6. Check off acceptance criteria that are verified; leave task In Progress until user explicitly confirms manual testing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented persisted node collapse metadata and centralized collapsed rendering in BaseNodeWrapper. Verified with targeted tests, full test suite, and lint. npm test: 147 files / 887 tests passed. npm run lint: 0 errors, 3 pre-existing warnings outside this change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped persisted collapsible Canvas nodes from the per-node toolbar. Normal nodes collapse to a thin label bar, preserve connected handles, and restore their previous expanded size. Group and frame nodes remain non-collapsible. Verified with targeted tests, full npm test, and lint.
<!-- SECTION:FINAL_SUMMARY:END -->
