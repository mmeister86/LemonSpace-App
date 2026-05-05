---
id: TASK-043
title: Add AI SDK streaming to text and agent nodes
status: Done
assignee: []
created_date: '2026-05-04 19:15'
updated_date: '2026-05-05 09:18'
labels:
  - ai
  - streaming
  - agents
dependencies: []
documentation:
  - 'https://ai-sdk.dev/docs/introduction'
  - docs/superpowers/specs/2026-05-04-ai-sdk-local-streaming-design.md
  - docs/superpowers/plans/2026-05-04-ai-sdk-local-streaming.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce Vercel AI SDK based streaming for LemonSpace text generation and agent output flows while preserving existing Convex ownership checks, credit reservation/commit behavior, node status updates, and persisted final output data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI text node generation can display streamed text progressively and persist the final output to the existing ai-text-output node shape.
- [x] #2 Agent node execution can stream useful intermediate or final text into agent-output nodes without breaking clarification flow, structured output normalization, or existing tool/harness behavior.
- [x] #3 Credit reservation, commit, release, auth, ownership checks, and error handling remain equivalent to the current Convex action behavior.
- [x] #4 The integration follows current Vercel AI SDK streaming patterns and Next.js 16 route handler constraints documented for this project.
- [x] #5 Focused tests cover the new streaming adapter/data-flow behavior and existing non-streaming completion semantics remain intact.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement text streaming first: add AI SDK/OpenRouter dependencies, shared prompt builder, local stream store, Convex text streaming lifecycle actions, Next text stream route, and AI text node UI wiring.
2. Verify the text path with focused Vitest coverage before touching agent streaming.
3. Add agent local draft rendering and then stream a local agent run summary while preserving the existing Convex tool-harness for durable agent outputs, credits, and status/step updates.
4. Run targeted tests, lint, build, and manual smoke tests.
5. Check acceptance criteria as verified, but do not mark TASK-043 Done until the user confirms manual testing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: use local client-visible streaming with final Convex persistence. Agent nodes should continue to emit Convex-backed status/step updates during execution.

Created spec: docs/superpowers/specs/2026-05-04-ai-sdk-local-streaming-design.md

Created implementation plan: docs/superpowers/plans/2026-05-04-ai-sdk-local-streaming.md

Plan scopes agent streaming to a local run-summary stream first because the active Instagram agent uses a Convex tool harness for final artifact creation. Durable status/step updates and credits stay in Convex.

Implemented in worktree .worktrees/ai-sdk-local-streaming on branch codex/ai-sdk-local-streaming using pnpm.

Verification: CI=true pnpm test focused streaming suite passed: 9 files and 25 tests.

Verification: CI=true pnpm run lint completed with 0 errors and 4 pre-existing warnings in unrelated files.

Verification: CI=true pnpm run build required escalation due Turbopack sandbox port binding and required sourcing main .env.local because the worktree has no env file; build then completed successfully.

Full suite passed in worktree codex/ai-sdk-local-streaming: CI=true pnpm test => 136 test files passed, 731 tests passed.

Runtime follow-up on 2026-05-05: user hit POST /api/ai-stream/text 500 because Convex dev deployment did not yet contain ai.prepareTextStream. Ran pnpm convex dev --once from the ai-sdk-local-streaming worktree; function-spec now lists ai.prepareTextStream, ai.finalizeTextStreamSuccess/Failure, agents.prepareAgentStream, and agents.finalizeAgentStreamSummary. No code change was required.

Runtime follow-up on 2026-05-05: OPENROUTER_API_KEY was present in Convex env but missing from the Next.js server env. AI SDK streaming runs in app/api/ai-stream/*, so the key must also be available to Next/Vercel. Updated lib/ai-stream/openrouter-provider.ts to make this boundary explicit in the error message. Verification: CI=true pnpm test tests/lib/ai-stream-protocol.test.ts tests/lib/ai-stream-text-messages.test.ts passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped AI SDK local streaming for text and agent nodes. Added Next.js streaming routes, OpenRouter AI SDK provider integration, local draft stream store, Convex prepare/finalize lifecycle actions, UI streaming render paths, and focused tests. Verified with full pnpm test suite, lint, build, Convex dev deployment sync, and user manual confirmation that streaming works. Merged to master at commit 476ae9e and removed the feature worktree.
<!-- SECTION:FINAL_SUMMARY:END -->
