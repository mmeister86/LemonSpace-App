---
id: TASK-027
title: Split agent run contract normalizers
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Public contract types remain available to existing imports.
- [ ] #2 Structured output normalization is isolated.
- [ ] #3 Execution plan normalization is isolated.
- [ ] #4 Shared string/list/metadata helpers are isolated.
- [ ] #5 Existing agent contract tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for clarification, execution plan, structured output, metadata, and fallback body normalization.
2. Create focused normalizer modules for output, plan, brief/clarification, and shared utilities.
3. Keep `agent-run-contract.ts` as the public facade for compatibility.
4. Run `npm test -- tests/lib/agent-run-contract.test.ts tests/lib/agent-structured-output.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
