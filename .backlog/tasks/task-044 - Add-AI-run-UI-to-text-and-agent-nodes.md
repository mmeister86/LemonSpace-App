---
id: TASK-044
title: Add AI run UI to text and agent nodes
status: In Progress
assignee:
  - Codex
created_date: '2026-05-05 10:35'
updated_date: '2026-05-05 15:30'
labels:
  - canvas
  - ai
  - agents
  - ui
dependencies: []
references:
  - 'https://www.hextaui.com/blocks/ai-thinking'
  - 'https://www.hextaui.com/blocks/ai-streaming-response'
  - 'https://ui.heygaia.io/docs/components/tool-calls-section'
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement LemonSpace-native safe thinking states, streaming response UI, and durable tool-call timelines for KI-Text and Agent source/output nodes. Source nodes should act as compact run cockpits while output nodes show live streamed text and persisted run history. Use bounded durable node data for run events and tool-call traces; do not expose private model reasoning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI text and agent source nodes show current safe run phase and recent progress while a run is active
- [x] #2 AI text and agent output nodes render live streamed text and persisted final run history
- [x] #3 Agent harness records durable bounded tool-call traces with summary by default and expandable details
- [x] #4 Shared UI primitives use LemonSpace design tokens and existing node accents instead of copied external registry styling
- [x] #5 English and German translations cover all new visible labels
- [x] #6 Unit and component tests cover run event normalization, local stream store updates, harness tool-call tracing, streaming states, completed states, error states, and expandable tool-call details
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shared run-history utilities and extend the local node stream store with safe phases, bounded run events, and bounded tool-call traces.
2. Write failing unit tests for run event normalization/truncation and local stream subscriptions.
3. Instrument the agent harness with an optional trace callback, then test success, tool-error, and max-round failure traces.
4. Add LemonSpace-native UI primitives for thinking/progress, streaming response, and collapsible tool calls.
5. Wire ai-text and agent source/output nodes to local + persisted run history, including durable Convex patches for text streams and harness traces.
6. Add English/German i18n strings for all new labels.
7. Add focused component coverage for streaming, completed/error states, and expandable tool-call details.
8. Run targeted tests, lint, and build; record verified acceptance criteria without marking the task Done until user confirmation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented shared AI run history utilities with bounded safe phases and tool-call trace normalization.

Extended local node streams to carry phase, startedAt, run events, tool calls, and errors while preserving streamed text behavior.

Instrumented the agent harness with optional tool-call trace callbacks and persisted traces to agent/source output node data during streaming runs.

Added LemonSpace-native AI run status, streaming response, and collapsible tool-call UI primitives and wired them into ai-text, ai-text-output, agent, and agent-output nodes.

Added English and German run-state labels.

Verification: targeted Vitest suite passed (31 tests), agent harness/runtime follow-up tests passed (9 tests), npm run lint exited 0 with 4 pre-existing warnings, npm run build exited 0 after refreshing node_modules with frozen lockfile.

Fixed intl formatting regression where run.elapsed was read without the required time variable. Added a regression test in ai-text-node coverage that throws like next-intl when the variable is missing. Verification after fix: affected component tests passed (15 tests), npm run lint exited 0 with the same 4 pre-existing warnings, npm run build exited 0.

Fixed completed-run UI regression where local streaming snapshots and older running events could keep showing Streaming/Preparation spinners after the node status was already done. Output nodes now prefer terminal persisted status over local stream snapshots, and the run status panel renders old running events as completed when the current phase is done. Added regression coverage in ai-text-output-node tests. Verification after fix: affected run UI tests passed (27 tests), npm run lint exited 0 with the same 4 pre-existing warnings, npm run build exited 0.

Fixed KI-Text timing race: source nodes now move to a finalizing/saving state after the HTTP stream ends instead of marking the run done before the output node receives persisted text; output local streams are retained through the persistence gap and cleared only once the output node reaches a terminal persisted status. Added regression coverage and verified targeted tests, lint, and production build.

Follow-up for KI-Text source timing: source run status now derives the final done/error phase from connected output node persistence, so it remains in finalizing while output text is still being saved and only turns Done after the output node has terminal persisted status. Verification: affected run UI tests passed (28 tests), npm run lint exited 0 with the same 4 pre-existing warnings, npm run build exited 0.
<!-- SECTION:NOTES:END -->
