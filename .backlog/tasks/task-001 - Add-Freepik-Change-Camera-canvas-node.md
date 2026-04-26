---
id: TASK-001
title: Add Freepik Change Camera canvas node
status: Done
assignee:
  - Codex
created_date: '2026-04-26 10:28'
updated_date: '2026-04-26 11:02'
labels:
  - canvas
  - freepik
  - i18n
  - node
dependencies: []
documentation:
  - 'https://docs.freepik.com/api-reference/image-change-camera/overview'
  - 'https://docs.freepik.com/api-reference/image-change-camera/change-camera'
  - 'https://docs.freepik.com/api-reference/image-change-camera/task-by-id'
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a localized LemonSpace canvas node for Freepik's Change Camera API. The node should let users transform an image-like source by changing horizontal angle, vertical angle, zoom, output format, and optional seed. It should follow the existing Freepik transform UX: running the node creates or updates a connected image output node, while the node itself can also feed a render node for final baking/export. Use polling first to match existing Freepik image transform architecture. API reference: https://docs.freepik.com/api-reference/image-change-camera/overview
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Change Camera node is fully localized in English and German with no new hardcoded visible strings.
- [x] #2 Node accepts image, asset, AI image, render, crop, adjustment nodes, existing Freepik transform nodes, and Change Camera nodes as input.
- [x] #3 Node creates or updates a connected image output node when run, matching the existing Freepik transform pattern.
- [x] #4 Node can connect directly to render, and render can consume the completed Change Camera result.
- [x] #5 Freepik create and poll flow uses POST /v1/ai/image-change-camera and GET /v1/ai/image-change-camera/{task-id} with server-side API key handling.
- [x] #6 Horizontal angle, vertical angle, zoom, output format, and optional seed are validated, persisted, and sent to Freepik using documented parameter names and ranges.
- [x] #7 Credits, Convex storage, media metadata, status, retry, and provider error handling are consistent with existing image transform nodes.
- [x] #8 Tests cover connection policy, operation validation/defaults, Freepik response parsing, and localized node UI behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implementation plan approved by user on 2026-04-26. Build a localized Freepik Change Camera canvas node following the existing Freepik transform pattern. 1) Add change-camera to shared node type unions, Convex node validator, catalog, templates, defaults, handles, sidebar/command icons, and edge glow. 2) Extend image-transform operation types, validators, credit cost, sanitizer, labels, and backend Freepik create/poll processing for POST /v1/ai/image-change-camera and GET /v1/ai/image-change-camera/{task-id}. 3) Add localized UI controls for horizontal_angle 0..360, vertical_angle -30..90, zoom 0..10, output_format png|jpeg, optional seed >=1; persist values and run through the existing generateTransform action. 4) Update connection policy so the node accepts image, asset, ai-image, render, crop, adjustment nodes, existing Freepik transforms, and change-camera as input, has one incoming edge, and can connect to render. 5) Update render preview/input resolution so render can consume completed change-camera output directly or through the generated image output. 6) Add/adjust focused tests for connection policy, operation validation/defaults, Freepik parsing/payload helpers, and localized UI behavior. 7) Run lint/tests and mark acceptance criteria complete only after verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-04-26: Created isolated worktree /Users/matthias/Documents/Code/Web/lemonspace/webapp/.worktrees/change-camera-node on branch codex/change-camera-node. Baseline `npm test` passed: 104 test files, 588 tests. Initial `npm test -- --runInBand` failed because Vitest does not support that Jest option; reran with project script only.

2026-04-26: Implemented Change Camera in isolated worktree branch codex/change-camera-node. Added the node to shared node unions, catalog/templates/defaults, sidebar/command/template picker UI, React Flow registry, connection policy, render-source resolution, Convex transform flow, Freepik client, and i18n messages. Added localized controls for horizontal angle, vertical angle, zoom, output format, and optional seed. Completed result metadata now persists storage and image dimensions on transform nodes so completed Change Camera nodes can feed Render directly. Verification: `npm test` passed 105 test files / 596 tests; `npm run lint` exited 0 with 6 existing warnings in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a localized Freepik Change Camera canvas node that follows the existing image transform pattern. The node accepts image-like sources including uploaded images, AI image outputs, render outputs, crop/adjustment nodes, existing Freepik transform nodes, and other Change Camera nodes; it can create/update a connected image output node and can feed Render directly once completed.

Backend support now includes the Freepik POST /v1/ai/image-change-camera create flow, GET /v1/ai/image-change-camera/{task-id} polling endpoint selection, parameter validation/sanitization for horizontal angle, vertical angle, zoom, output format, and optional seed, plus storage/media metadata persistence for direct render consumption.

UI and registry work includes the new node wrapper, template/catalog/defaults/handles/edge glow, sidebar/command/template picker icons/search, and full English/German i18n strings. Tests were added for connection policy, render-source resolution, Freepik payload mapping/client calls, Convex transform behavior, and localized node UI.

Verification: `npm test` passed 105 test files / 596 tests. `npm run lint` exited 0 with 6 pre-existing warnings in unrelated files.
<!-- SECTION:FINAL_SUMMARY:END -->
