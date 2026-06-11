---
id: TASK-082
title: Fix Instagram mockup render image fallback
status: In Progress
assignee: []
created_date: '2026-06-09 16:24'
updated_date: '2026-06-09 19:47'
labels: []
dependencies: []
modified_files:
  - components/agents/instagram/ui/instagram-post.tsx
  - components/canvas/nodes/instagram-post-mockup-node.tsx
  - convex/agent_instagram_harness.ts
  - convex/agents.ts
  - lib/instagram-post-mockup.ts
  - tests/convex/agent-orchestration-contract.test.ts
  - tests/convex/instagram-agent-harness.test.ts
  - tests/instagram-post-mockup-node.test.ts
  - tests/lib/instagram-post-mockup.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prevent Instagram agent mockups from rendering synthetic image URLs as real post images and display connected render visual inputs through the existing live render-preview path when no storage URL exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Synthetic imageUrl fields are ignored in Instagram package normalization
- [x] #2 Existing mockups with synthetic imageUrl fall back to placeholder and mark visual as degraded
- [x] #3 Render visual inputs without stored URLs display through the mockup render-preview slot
- [x] #4 Synthetic or bare image identifiers are not rendered as Next image sources and cannot trigger /canvas/<image-id> route requests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce with real Convex node/edge data
2. Add failing tests for synthetic image URLs and unmaterialized render bindings
3. Implement focused resolver and harness fixes
4. Run focused tests
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: current agent package selected render node js72cvr... which has no storageId/url/lastUploadStorageId, while the package snapshot stored a synthetic example.com imageUrl. The mockup then attempted to render that synthetic URL as a real image. Final approach: ignore imageUrl when marked synthetic, keep render visual edges connected, and render URL-less render inputs via the mockup render-preview slot. URL-backed non-render visuals without media data still degrade to placeholder.

Verification: focused Instagram/render tests passed (6 files, 40 tests); npm run lint passed with existing warnings; npx tsc --noEmit only reports pre-existing test type errors; npm run build passed outside sandbox.

Additional root cause from user logs: synthetic-profile-image and a render node id were being treated as relative image src values, causing browser requests under /canvas/<value> and Convex canvases.get validation errors. Added component-level image src validation and profileImageUrl synthetic-field normalization in both package and legacy output paths.

Verification after profile-image/src fix: focused tests passed (5 files, 26 tests); npm run lint passed with the existing 3 warnings; npx tsc --noEmit still reports only the known pre-existing test type errors; npm run build failed inside sandbox due Turbopack port binding and passed outside sandbox.
<!-- SECTION:NOTES:END -->
