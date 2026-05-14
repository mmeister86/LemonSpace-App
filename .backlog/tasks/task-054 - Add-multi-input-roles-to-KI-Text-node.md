---
id: TASK-054
title: Add multi-input roles to KI-Text node
status: Done
assignee: []
created_date: '2026-05-14 11:55'
updated_date: '2026-05-14 17:01'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow the KI-Text canvas node to accept multiple live text sources for both Vorgaben and Text/Rohfassung, with clear role-specific input handles and compatibility for existing ai-text-in edges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI text nodes expose progressive input handles for Vorgaben and Text/Rohfassung, up to three connected text sources per role.
- [x] #2 Connected text and AI text output sources remain live and are combined into the correct instruction or draft parameter during generation.
- [x] #3 Legacy ai-text-in edges continue to behave as Text/Rohfassung inputs.
- [x] #4 Connection validation, handle assignment, and node UI tests cover the new multi-input behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for AI-Text repeating handles, connection policy limits, and node generation behavior.
2. Extend repeating handle utilities with role-aware AI-Text handle groups.
3. Update connection policy constants and per-handle role limits.
4. Refactor the KI-Text node UI/data flow to render live connected Vorgaben and Rohfassung inputs separately.
5. Run targeted tests for repeating handles, connection policy, AI text node, and connection drop/magnetism.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented role-specific progressive inputs for KI-Text. Verification: targeted tests for repeating handles, connection policy, AI text node, connection drop/menu, and custom connection line passed; full npm test passed with 143 files / 820 tests. npx tsc --noEmit still fails on existing unrelated test typing issues in components/canvas/__tests__/comment-node.test.tsx and tests/prompt-node.test.ts.

Bugfix: duplicate connections from the same source node in one KI-Text role now use per-edge render keys instead of sourceNodeId, preventing React duplicate-key warnings. Added regression coverage in tests/ai-text-node.test.ts. Verification: npm test -- tests/ai-text-node.test.ts; npm test -- tests/canvas-repeating-input-handles.test.ts tests/canvas-connection-policy.test.ts; npm run lint -- components/canvas/nodes/ai-text-node.tsx tests/ai-text-node.test.ts.

UX pass: implemented clearer KI-Text input assignment. Vorgaben handles now use amber accents, Rohfassung handles use teal accents, CanvasHandle derives role-specific title and aria-label text from handle ids, and the node shows matching section dots, badges, microcopy, and colored connected-input boxes. Verification: targeted handle/style/node tests passed, broader repeating-handle/connection/drop-target tests passed, full npm test passed with 143 files / 823 tests, and lint passed. npx tsc --noEmit still fails only on the pre-existing comment-node and prompt-node test typing issues.

Polish fix: removed the forced violet background class from KI-Text repeating input handles so the visible input dots now match the amber Vorgaben and teal Rohfassung text-field accents. Added a regression test that renders the actual handles and asserts they do not carry the violet override and use the role colors. Verification: npm test -- tests/ai-text-node.test.ts tests/lib/canvas-utils-modules.test.ts components/canvas/__tests__/canvas-handle.test.tsx; npm run lint -- components/canvas/nodes/ai-text-node.tsx tests/ai-text-node.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped KI-Text multi-input roles with progressive Vorgaben and Rohfassung handles, live connected source aggregation, legacy ai-text-in draft compatibility, role-aware connection limits, duplicate-source render key handling, role-colored handle/field UX, and regression coverage for the new behavior. Verified with targeted KI-Text, handle, connection, repeating-handle, drop-target, lint, and full npm test runs; TypeScript still has the pre-existing unrelated comment-node and prompt-node test typing failures noted during implementation.
<!-- SECTION:FINAL_SUMMARY:END -->
