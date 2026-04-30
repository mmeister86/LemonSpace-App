---
id: TASK-039
title: Build Instagram agent harness
status: In Progress
assignee: []
created_date: '2026-04-30 06:50'
updated_date: '2026-04-30 10:06'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the planned Instagram-specialized LemonSpace agent harness. The first new agent should use an Amp-style tool loop with a shared harness engine plus an Instagram-specific profile. It should read directly connected canvas nodes only, create an Instagram structured preview output, and create bounded supporting text and prompt nodes without editing existing nodes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Register Instagram Post Agent as the standalone active agent template and remove Campaign Orchestrator/Distributor from the active registry and canvas palette labeling
- [x] #2 Add a tested shared harness loop that calls OpenRouter with tool definitions, executes only allowed tools, feeds tool results back to the model, enforces max rounds and per-run tool limits, and finalizes a structured result
- [x] #3 Implement Instagram agent tools for reading directly connected context and creating one Instagram agent-output node, one connected text node, and one connected prompt node per run
- [x] #4 Render Instagram agent-output data with the existing Instagram post preview component while preserving the generic agent-output fallback for other artifact types
- [x] #5 Use the connected input image as the Instagram output preview fallback when no explicit imageUrl is returned
- [x] #6 Cover contracts, harness behavior, tool permissions, UI preview rendering, standalone agent registration, image fallback, and support-node edges with focused tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for Instagram agent registration, harness loop/tool limits, Instagram tool helpers, and output preview rendering.
2. Add shared tool-harness types and OpenRouter chat tool-call client support.
3. Implement Instagram harness profile and route Instagram agents through it while preserving legacy Campaign Distributor runtime.
4. Add Instagram artifact rendering to agent-output node.
5. Run focused tests and mark verified acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Instagram Post Agent as the new default agent template while preserving Campaign Distributor as legacy-structured runtime.

Added shared agent harness loop with OpenRouter tool-chat support and Instagram-specific tools for direct connected context reads plus bounded output/text/prompt node creation.

Rendered instagram-post agent-output artifacts through the existing InstagramPost preview component and kept generic structured/text fallbacks intact.

Verification: npm run build passed; npm run test passed with 129 test files and 708 tests; npm run lint passed with pre-existing warnings only.

User feedback on Instagram agent: remove Campaign Orchestrator/Distributor as active agent, make Instagram the standalone agent, show connected input image in Instagram output preview even when the model omits imageUrl, and connect generated text/prompt support nodes back to the agent.

Adjusted the task acceptance criteria to match the product decision that Campaign Orchestrator/Distributor is removed rather than preserved as a legacy active runtime. Verified with focused tests, full test suite, production build, and lint.

Correction to earlier note: Campaign Distributor is no longer preserved as an active agent. The active registry, templates, palette label, translations, generated prompt segments, and docs now point to Instagram Post Agent only.

Final cleanup check: git diff --check passes and no Campaign Distributor/Orchestrator references remain in lib, components, convex, tests, messages, or docs.

Fixed runtime regression from manual test: React Flow node data now uses the canonical node document canvasId so AgentNode cannot pass a stale node ID as canvasId to agents.runAgent/canvases.get. Also blocks agent run/resume while the canvas sync queue has pending changes so newly connected edges are persisted before the backend harness reads connected context. Verification: targeted tests passed, npm run build passed, npm run lint passed with only the four pre-existing unrelated warnings, git diff --check passed.
<!-- SECTION:NOTES:END -->
