---
id: TASK-078
title: Implement editable Instagram agent outputs feeding a live mockup
status: In Progress
assignee: []
created_date: '2026-06-09 10:31'
updated_date: '2026-06-09 11:04'
labels:
  - agents
  - canvas
  - instagram
  - convex
dependencies: []
modified_files:
  - components/agents/instagram-post-agent.md
  - components/agents/instagram/ui/instagram-post.tsx
  - components/canvas/node-types.ts
  - components/canvas/nodes/base-node-wrapper.tsx
  - components/canvas/nodes/instagram-post-mockup-node.tsx
  - convex/agent_instagram_harness.ts
  - convex/agents.ts
  - lib/agent-definitions.ts
  - lib/canvas-connection-policy.ts
  - lib/canvas-handle-style.ts
  - lib/canvas-node-catalog.ts
  - lib/canvas-node-defaults.ts
  - lib/canvas-node-types.ts
  - lib/generated/agent-doc-segments.ts
  - lib/instagram-post-mockup.ts
  - tests/convex/instagram-agent-harness.test.ts
  - tests/instagram-post-mockup-node.test.ts
  - tests/lib/agent-definitions.test.ts
  - tests/lib/canvas-agent-config.test.ts
  - tests/lib/canvas-connection-policy.test.ts
  - tests/lib/instagram-post-mockup.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Change the Instagram agent flow so each run creates user-editable field nodes for the post package and a derived Instagram mockup node that updates from those nodes through canvas edges. The current harness creates a static agent-output preview plus support nodes; this work makes editable outputs the source of truth while preserving synthetic preview metadata and rerun safety.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An Instagram agent run creates separate editable field nodes for caption, hashtags, CTA, alt text, and visual prompt, plus one final Instagram mockup node wired to those fields.
- [x] #2 Editing connected caption, CTA, hashtags, alt text, or visual source nodes updates the mockup preview without rerunning the agent.
- [x] #3 The new mockup node supports typed input handles with client/server connection policy parity and rejects invalid source types or duplicate handle inputs.
- [x] #4 Rerunning the Instagram agent creates a new package and does not overwrite previously generated or user-edited field nodes.
- [x] #5 Agent documentation, compiled prompt segments, and agent definitions describe the new package output model and no longer require the old static agent-output package.
- [x] #6 Tests cover the mockup resolver, connection policy, harness package creation contracts, rerun behavior, and agent docs/definition updates.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for the Instagram mockup resolver, mockup connection policy, and harness package tool contract.
2. Add the shared resolver and new instagram-post-mockup canvas node with typed handles and live graph-derived props.
3. Extend node taxonomy/catalog/React Flow registration and client/server connection policy for the mockup node.
4. Replace the Instagram harness output tools with a package creation tool that creates editable field nodes, mockup node, and edges without overwriting prior runs.
5. Update Instagram agent definitions, Markdown prompt docs, and compiled agent doc segments.
6. Run targeted tests, compile agent docs, lint/build where practical, then record outcomes in Backlog without marking Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented TDD coverage and production changes for editable Instagram output packages: mockup resolver, connection policy, new canvas node, package harness, agent docs/definitions, compiled prompt segments, and targeted tests. Verification so far: targeted Vitest suite passed (101 tests), lint passed with 3 pre-existing warnings, build passed outside sandbox after sandboxed Turbopack port-bind failure.

Addressed review findings: connected empty field nodes now stay empty instead of falling back to snapshots; visual-prompt live binding is covered; internal Instagram package edge creation now calls the shared Convex connection policy assertion before direct edge inserts; canvas agent catalog test now expects instagram-post-mockup. Final verification: focused Vitest suite passed (14 files, 115 tests); npm run lint passed with 3 existing warnings outside TASK-078; npm run build passed outside sandbox; npx tsc --noEmit still fails on pre-existing test type errors outside TASK-078 and no longer reports the new mockup test file.
<!-- SECTION:NOTES:END -->
