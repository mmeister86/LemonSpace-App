---
id: TASK-051
title: Add progressive input handles to agent nodes
status: Done
assignee: []
created_date: '2026-05-13 20:07'
updated_date: '2026-05-13 20:18'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the progressive repeating input handle UX from prompt/KI-Bild nodes to agent nodes, starting with the Instagram agent, so multiple accepted context inputs render as occupied compact left-side handles plus one free compatible slot without changing persisted edge semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent nodes start with one visible left input point for repeatable context inputs.
- [x] #2 Connected agent inputs receive distinct display target handles and compact after removals without persisted slot data.
- [x] #3 Body-drop and magnetized connection flows choose the next free compatible agent slot and preserve existing agent source policy.
- [x] #4 Existing agent edges with legacy target handles render on distinct display handles without a Convex schema migration.
- [x] #5 Automated tests cover agent slot helpers, reconciliation, drop/magnetism, and AgentNode rendering.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for agent repeating slot helpers and legacy display-handle reconciliation.
2. Add failing tests for body-drop/magnetism using agent free slots and max 8 inputs.
3. Add failing AgentNode rendering test for progressive handles and useUpdateNodeInternals.
4. Generalize repeating input helper from prompt-only to prompt + agent while preserving prompt source-specific limits.
5. Replace AgentNode static agent-in target with RepeatingInputHandles.
6. Enforce an 8-input agent context cap in shared connection policy and server parity.
7. Run focused tests, full tests, lint, and build.
8. Update TASK-051 notes and checked acceptance criteria; leave task In Progress pending manual confirmation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented progressive repeating input handles for agent nodes with an 8-context-input maximum: generalized the shared repeating input helper for prompt + agent, rendered AgentNode targets through RepeatingInputHandles with useUpdateNodeInternals, added display-only legacy agent edge reconciliation, wired body-drop and magnetism to next free agent slots, and enforced the 8-input cap in shared client/server connection policy.

Verification: npm run test passed (143 files, 802 tests); npm run lint passed with 0 errors and 4 pre-existing unused-var warnings; npm run build passed outside sandbox after the known Turbopack sandbox port-binding limitation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped progressive repeating input handles for agent nodes with an 8-context-input maximum: compact agent-in display slots, legacy edge reconciliation, AgentNode dynamic handles, body-drop and magnetism support, and shared client/server connection policy enforcement. User manually tested and confirmed the feature works.
<!-- SECTION:FINAL_SUMMARY:END -->
