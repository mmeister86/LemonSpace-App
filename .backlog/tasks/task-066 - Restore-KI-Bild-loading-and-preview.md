---
id: TASK-066
title: Restore KI-Bild loading and preview
status: In Progress
assignee: []
created_date: '2026-05-28 07:20'
updated_date: '2026-05-28 07:55'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the KI-Bild output node so generation shows an in-node loading state and completed outputs show a resolving or generated preview instead of a blank area. Preserve existing onboarding changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI image output nodes pass status and status messages into the shared node wrapper
- [x] #2 Executing AI image nodes show the generating overlay
- [x] #3 Done AI image nodes with storage but no resolved URL show a resolving preview placeholder
- [x] #4 Done AI image nodes with a resolved URL render the generated image preview
- [x] #5 NextStep onboarding wrapper preserves full-height app and Canvas layout
- [x] #6 Focused AI image, prompt, and flow reconciliation tests pass
- [x] #7 Done AI image nodes with storageId but no persisted url render a storage fallback preview when NEXT_PUBLIC_CONVEX_URL is available
- [x] #8 AI image preview rendering accepts previewUrl/lastUploadUrl/imageUrl candidates and falls back to storage URL after a failed image load
- [x] #9 Reconciliation preserves server-generated storage/url preview data while local node data pins are settling
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restore AI image status wiring and resolving placeholder
2. Add focused node rendering regression tests
3. Add onboarding wrapper height guard
4. Run targeted tests and record results
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented AI image wrapper status forwarding, a done+storageId URL-resolving placeholder, focused rendering regression tests, and a NextStep wrapper height guard. Verification: pnpm vitest run tests/ai-image-node.test.ts tests/prompt-node.test.ts components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts passed (22 tests); pnpm lint components/canvas/nodes/ai-image-node.tsx tests/ai-image-node.test.ts components/onboarding/onboarding-provider.tsx passed; local dev server on port 3000 returned HTTP 200 via curl. Browser automation was not available because the Playwright package is not installed in this workspace.

Follow-up after manual report: direct KI-Bild output nodes now derive a preview URL from storageId via NEXT_PUBLIC_CONVEX_URL (/api/storage/:id) when data.url has not landed yet. Added regression coverage for storageId-only preview rendering and kept the unresolved-storage placeholder for cases where no Convex base URL is available. Verification: pnpm vitest run tests/ai-image-node.test.ts tests/prompt-node.test.ts components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts passed (23 tests); pnpm lint components/canvas/nodes/ai-image-node.tsx tests/ai-image-node.test.ts components/onboarding/onboarding-provider.tsx passed; localhost:3000/canvas/j577mech12c6e1yhyybcv3bgph87knhf returned HTTP 307 to /auth/sign-in from the existing dev server. In-app browser automation remains unavailable because Playwright is not installed.

Systematic debugging follow-up: Convex logs showed js7e9hax64009gdczb5dr2pfa987j86n was created, generated, stored, finalized successfully, and storage URL resolution ran successfully before the user deleted the node. The remaining UI risk was on the frontend preview path: the AI image node only trusted data.url/storageId, while downstream render preview can resolve a broader preview path, and local node-data pins could mask generated storage/url fields. Implemented preview candidate fallback (url, previewUrl, lastUploadUrl, imageUrl, storage fallback) with image-load failure fallback, plus reconciliation preservation for generated storage/url metadata. Verification: pnpm vitest run tests/ai-image-node.test.ts tests/prompt-node.test.ts components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts passed (26 tests); pnpm lint components/canvas/nodes/ai-image-node.tsx components/canvas/canvas-flow-reconciliation-helpers.ts tests/ai-image-node.test.ts components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts passed. Browser connector was not exposed in this session, so no automated browser screenshot check was possible.
<!-- SECTION:NOTES:END -->
