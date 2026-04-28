---
id: TASK-027
title: Split agent run contract normalizers
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:48'
labels:
  - lib
  - agents
  - refactor
  - tests
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `lib/agent-run-contract.ts` into focused normalizer modules for brief/clarification data, structured outputs, execution plans, and shared normalization utilities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public contract types remain available to existing imports.
- [x] #2 Structured output normalization is isolated.
- [x] #3 Execution plan normalization is isolated.
- [x] #4 Shared string/list/metadata helpers are isolated.
- [x] #5 Existing agent contract tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for clarification, execution plan, structured output, metadata, and fallback body normalization.
2. Create focused normalizer modules for output, plan, brief/clarification, and shared utilities.
3. Keep `agent-run-contract.ts` as the public facade for compatibility.
4. Run `npm test -- tests/lib/agent-run-contract.test.ts tests/lib/agent-structured-output.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Confirmed pre-refactor characterization coverage with `npm test -- tests/lib/agent-run-contract.test.ts tests/lib/agent-structured-output.test.ts`: 2 test files passed, 22 tests passed.
- Split `lib/agent-run-contract.ts` into `lib/agent-run-contract-brief.ts`, `lib/agent-run-contract-plan.ts`, `lib/agent-run-contract-output.ts`, and `lib/agent-run-contract-shared.ts`.
- Kept `lib/agent-run-contract.ts` as the compatibility facade exporting the existing public types and functions.
- Verified after refactor with `npm test -- tests/lib/agent-run-contract.test.ts tests/lib/agent-structured-output.test.ts`: 2 test files passed, 22 tests passed.
- Verified related agent coverage with `npm test -- tests/lib/agent-prompting.test.ts`: 1 test file passed, 4 tests passed.
- Ran `npm run lint`: exit code 0; 6 warnings remain in unrelated existing files (`components/canvas/nodes/mixer-node.tsx`, `lib/canvas-node-favorite.ts`, `lib/image-pipeline/backend/webgl/webgl-backend.ts`, `tests/image-pipeline/parity/fixtures.ts`).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:SUMMARY:BEGIN -->
TASK-027 split the agent run contract normalizers into focused brief/clarification, execution plan, structured output, and shared helper modules. Existing imports through `lib/agent-run-contract.ts` remain supported via facade re-exports, and the targeted/related agent tests pass.
<!-- SECTION:SUMMARY:END -->
