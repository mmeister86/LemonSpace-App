---
id: TASK-050
title: Add progressive input handles for repeating canvas ports
status: Done
assignee: []
created_date: '2026-05-13 19:46'
updated_date: '2026-05-13 20:18'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement progressive left-side input points for finite repeating canvas target ports. The first shipped scope is the prompt/KI-Bild reference input flow: start with one visible input point, show occupied points plus one free point up to the policy maximum, compact points after removals, preserve existing connection semantics, and avoid schema migrations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt/KI-Bild starts with one visible left input point for repeatable references.
- [x] #2 Each connected repeatable input gets a distinct visual target handle and one additional free handle is shown until the maximum is reached.
- [x] #3 Removing or reconnecting inputs compacts the visible handle list without requiring persisted slot data.
- [x] #4 Body-drop and magnetized connection flows choose a free compatible repeating slot and respect visual/text input limits.
- [x] #5 Existing prompt edges with legacy target handles render on distinct display handles without a Convex schema migration.
- [x] #6 Automated tests cover slot helpers, reconciliation, drop/magnetism, PromptNode rendering, and generation regression behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for repeating input slot calculation and legacy display-handle assignment.
2. Implement a shared repeating input handle helper and renderer.
3. Add failing tests for drop target and magnetism choosing free repeating slots.
4. Wire repeating-slot resolution into connection drop and magnet validation.
5. Replace PromptNode target handle with progressive handles and call useUpdateNodeInternals.
6. Run focused tests, then broader relevant test suites.
7. Update Backlog notes and acceptance criteria based on verified results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented progressive repeating input handles for prompt/KI-Bild: added compact display-slot helper, RepeatingInputHandles renderer with useUpdateNodeInternals, prompt-node integration, body-drop and magnetism free-slot resolution, legacy display targetHandle reconciliation, and Convex-side incoming source-type policy parity.

Verification: npm run test passed (143 files, 789 tests); npm run lint passed with 0 errors and 4 pre-existing unused-var warnings; npm run build passed outside sandbox after the sandboxed Turbopack run failed on port binding permissions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped progressive repeating input handles for prompt/KI-Bild nodes: compact display-only slots, legacy edge reconciliation, dynamic React Flow internals updates, body-drop and magnetism support, and client/server policy parity for prompt visual/text limits. User manually tested and confirmed the feature works.
<!-- SECTION:FINAL_SUMMARY:END -->
