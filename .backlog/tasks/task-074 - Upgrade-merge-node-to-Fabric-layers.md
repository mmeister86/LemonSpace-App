---
id: TASK-074
title: Upgrade merge node to Fabric layers
status: In Progress
assignee: []
created_date: '2026-05-31 11:10'
updated_date: '2026-06-09 07:59'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Mixer/Merge Node V2 with FabricJS-powered layer editing, up to eight inputs, layer ordering, transforms, rotation, crop, and deterministic render/compare parity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Mixer accepts up to eight image/text-compatible inputs through repeating layer handles
- [ ] #2 Users can order layers and edit transform, resize, rotation, crop, opacity, blend mode, visibility, and lock state inside the node
- [x] #3 Render and compare consumers resolve the same multi-layer composition as the node preview
- [x] #4 Existing two-input mixer data and edges continue to render through lazy V1-to-V2 normalization
- [x] #5 Targeted unit/component tests cover normalization, connection policy, preview resolution, and render composition
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend repeating mixer inputs so two layer handles are visible initially and one additional free handle spawns only when all visible slots are occupied, capped at eight.
2. Add regression tests for layer-in derived stage semantics across mixer preview, render preview, source loading, and the Mixer node component.
3. Introduce a shared stage helper so layer-in/base sources determine mixer stage and proportional node size while overlay-only inputs stay stage-less.
4. Wire the helper into preview, render composition, Fabric editor sizing, and Mixer node persistence/resize queueing.
5. Update local canvas docs and run targeted Vitest coverage for repeating handles, connection policy, preview/render/source-loader, and Mixer node.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented V2 mixer layer model with Fabric editor shell, repeating layer handles, preview/render/source-loader composition paths, and compatibility for legacy base/overlay mixers.
Verification: targeted Vitest run passed 8 files / 167 tests; focused ESLint on changed Mixer/Fabric/repeating-handle files passed. Full tsc still fails on existing unrelated test typing issues in base-node-wrapper/comment/rate-limit/prompt tests; full lint still fails on existing node-search memoization rule.

Follow-up bugfix after browser test: existing Mixer nodes now use the V2 minimum size (360x460), Fabric editor fits its internal canvas to the visible node viewport, Fabric owns its canvas through an imperative host to avoid React removeChild errors, and the upper Fabric canvas no longer inherits an opaque background that covered rendered layers. Verification: targeted Vitest run passed 8 files / 149 tests; focused ESLint on changed Mixer/Fabric/sizing files passed; browser DOM verification confirms fitted Fabric wrapper/classes and no loading state.

Implementation resumed from approved spawned-input plan. Scope: mixer initially shows two inputs, spawns further layer handles as slots fill, and layer-in establishes derived stage plus visible node size. Will keep task In Progress until explicit user confirmation.

Implemented approved spawned-input/base-stage slice. Repeating mixer inputs now keep two visible slots initially and spawn up to layer-in-8; layer-in/base now derives Mixer V2 stage for preview/render and queues persisted stage plus proportional node resize in the Mixer node. Fabric editor fallback no longer uses 1024x768 and fills the visible editor viewport. Added regression coverage for preview, render, source-loader no-stage bake, component persistence/resize, and Fabric sizing. Verification: targeted Vitest 8 files / 156 tests passed; focused ESLint on changed TS/TSX files passed; browser smoke on http://localhost:3000/dashboard loaded with 0 console errors. Full tsc --noEmit still fails on pre-existing unrelated typing errors in base-node-wrapper/comment/image-node/rate-limit/prompt tests.

Bugfix after user report: Fabric.js 7 defaults object originX/originY to center, so Mixer layer images positioned at 0/0 were drawn as if centered and only partially filled the stage. Added explicit originX=left/originY=top through buildMixerFabricLayerObjectOptions and regression coverage. Verification: targeted TASK-074 Vitest matrix passed 8 files / 157 tests; focused ESLint passed; browser reload of the affected canvas showed the Mixer Fabric canvas mounted with 0 console errors and the base image no longer half-offset by Fabric origin.

Bugfix after edge-drop report: creating a Mixer via connection drop could trigger a React maximum-update-depth loop while the derived layer-in stage update was still optimistic. Added a pending-stage data gate in MixerNode, allowed explicit free mixer layer handles for direct drops (e.g. layer-in-2), updated Mixer reconnect/drop tests to normalized layer handles, and refreshed Mixer policy copy. Verification: targeted TASK-074 Vitest matrix passed 11 files / 207 tests; focused ESLint passed; git diff --check passed; browser reload of the affected canvas shows 8 nodes / 1 Mixer / 0 console errors after cleanup of the temporary repro node.

Bugfix after Fabric interaction reports: stopped transform-only layer changes from rebuilding/discarding the Fabric canvas, kept the existing Fabric canvas mounted until replacement objects are ready, marked Fabric lower/upper/wrapper DOM with nodrag/nopan, and made Mixer layer-mode render local layer data directly so graph rerenders cannot snap transforms back before persistence catches up. Also gated the legacy V1 mixer local-data hook from writing/clearing the shared preview override while the node is in V2 layer mode. Verification: targeted TASK-074 Vitest matrix passed 12 files / 220 tests; focused ESLint passed; git diff --check passed; browser reload of the affected canvas shows 8 nodes, Merge layers visible, Fabric lower/upper/wrapper classes include nodrag/nopan, and 0 warn/error console logs. Full tsc --noEmit still fails only on pre-existing unrelated typing errors in base-node-wrapper/comment/image-node/rate-limit/prompt tests.

Second Fabric reset investigation with subagents. Root causes found and fixed: (1) preview-only spawned layers were visible but not merged into the editable layer mutation base, so transforms on layer-in-2/later could no-op and visually reset; (2) Fabric layout sync could reapply stale props while an object transform was active/pending; (3) node data pins were left on optimistic ids when updates arrived after real-id handoff; (4) V2 layer normalization still used V1 in-stage bounds, shrinking/moving layers back after persistence. Implemented merged editable layer base by handle, pending transform layout-skip, optimistic data pin handoff to real id, and stage-relative V2 layer bounds that allow off-stage positions and >1 scales. Verification: targeted TASK-074 Vitest matrix passed 14 files / 240 tests; focused ESLint passed; git diff --check passed. Full tsc --noEmit still fails only on pre-existing unrelated typing errors in base-node-wrapper/comment/image-node/rate-limit/prompt tests.

Bugfix after user report on additional Mixer inputs. Systematic debugging found four root causes: (1) preview-only V2 layer defaults used 1x1 frames without source dimensions, so overlays inherited the base/stage aspect; (2) repeating mixer handles marked occupancy by edge array order rather than normalized handle id, so handles/edges could drift when graph edges were sorted differently; (3) Mixer rendered dynamic handles directly and did not call React Flow updateNodeInternals after spawned handle positions changed; (4) text layer rasterization/Fabric textbox used an opaque white background. Implemented source-aspect default frames for synthetic V2 layers in preview/render, handle-id-based mixer slot occupancy, RepeatingInputHandles for Mixer targets, and transparent text layer backgrounds in Fabric plus bake. Verification: targeted TASK-074 Vitest matrix passed 14 files / 244 tests; focused ESLint passed; git diff --check passed; browser smoke on /canvas/j57amnz5f9ta3yz3a8dxkv2m7187vf89 loaded with 0 warn/error logs and showed layer-in through layer-in-4 handles plus three Mixer layers. Full tsc --noEmit still fails on pre-existing unrelated typing errors in base-node-wrapper/comment/rate-limit/prompt tests.

Implemented Mixer reconnect overlay-slot swap UX. Reconnecting an edge from one occupied overlay input (layer-in-2..layer-in-8) onto another occupied overlay input now swaps the two edge handles locally and persists via edges.swapMixerInputs. The protected base slot layer-in is excluded from swap resolution; reconnect attempts onto occupied layer-in are rejected instead of swapping. Convex swap validation now normalizes V2 mixer handles and only accepts non-base overlay layer handles. Verification: targeted TASK-074/connection/Convex Vitest matrix passed 15 files / 251 tests; focused ESLint passed; git diff --check passed.
<!-- SECTION:NOTES:END -->
