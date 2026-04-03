# Canvas Modularization Design

## Goal

Modularize `components/canvas/canvas.tsx` so the file becomes easier to read, easier to test, and easier for a second engineer to navigate without changing user-visible canvas behavior or existing public component contracts.

## Why Now

- `components/canvas/canvas.tsx` currently combines at least four different responsibilities: sync orchestration, Convex-to-React-Flow reconciliation, interaction handlers, and render composition.
- The file is still the main knowledge bottleneck in the canvas engine even after earlier helper extractions.
- A second developer joining during the seed phase will need clearer ownership boundaries and faster onboarding into the canvas hot path.

## Current Findings

- Sync and optimistic update orchestration are concentrated around the mutation and queue layer in `components/canvas/canvas.tsx:258` and `components/canvas/canvas.tsx:984`.
- Convex-to-local reconciliation for nodes and edges lives in large `useLayoutEffect` blocks in `components/canvas/canvas.tsx:1922`.
- Interaction logic for drag, connect, reconnect, drop, scissor mode, and highlighting is spread across the lower half of the file in `components/canvas/canvas.tsx:1798`, `components/canvas/canvas.tsx:2182`, `components/canvas/canvas.tsx:2555`, and `components/canvas/canvas.tsx:2730`.
- Render composition is comparatively simple, but it is buried under orchestration code in `components/canvas/canvas.tsx:2901`.

## Context7 Guidance Applied

- React guidance: extract non-visual logic into custom hooks so components focus on rendering and explicit data flow.
- React guidance: keep hook composition clear and stable rather than hiding too much behavior inside a generic controller.
- React Flow guidance: keep `nodeTypes` stable outside render, preserve `ReactFlowProvider` boundaries, and keep controlled flow state explicit when splitting handlers.

## Chosen Approach

Use a thin-orchestrator refactor:

1. Keep `components/canvas/canvas.tsx` as the top-level canvas entry and wiring layer.
2. Extract the largest logic clusters into domain-specific hooks with explicit inputs and outputs.
3. Leave existing external APIs unchanged: `Canvas`, `CanvasInner`, provider usage, mutation contracts, and React Flow integration stay behaviorally identical.
4. Prefer hook boundaries over a single giant controller or reducer in phase 1.

This approach gives the best trade-off between readability, testability, and migration risk.

## Rejected Alternatives

### 1. Single `useCanvasController` hook with reducer

- Pros: very strong test surface and centralized state transitions.
- Cons: too risky for the current canvas because drag locks, optimistic ID handoff, offline replay, and Convex reconciliation are behavior-sensitive and already intertwined with refs and effects.

### 2. Minimal handler extraction only

- Pros: lowest refactor risk.
- Cons: improves file length but not ownership or conceptual clarity; `canvas.tsx` would still remain the main cognitive bottleneck.

## Target Architecture

### 1. `canvas.tsx` becomes the orchestrator

`components/canvas/canvas.tsx` should keep only:

- top-level provider wiring
- hook composition
- final prop assembly for the rendered canvas view
- small glue callbacks when multiple hooks need to meet

The file should stop owning detailed effect bodies and long imperative flows.

### 2. Extract domain hooks by responsibility

#### `components/canvas/use-canvas-sync-engine.ts`

Owns:

- online/offline state
- queue flushing and retry scheduling
- deferred mutation handling for optimistic nodes
- optimistic-to-real ID remapping support
- wrappers like `runMoveNodeMutation`, `runResizeNodeMutation`, `runUpdateNodeDataMutation`, `runCreateEdgeMutation`, and node creation variants

Why:

- This is the most operationally complex part of the file.
- It has clear inputs and outputs and can be tested with mocked mutations and queue helpers.

#### `components/canvas/use-canvas-flow-reconciliation.ts`

Owns:

- Convex edges -> RF edges reconciliation
- Convex nodes -> RF nodes reconciliation
- carry-forward logic for optimistic edges during handoff gaps
- local pinning and merge behavior
- compare-node data resolution and glow-aware edge mapping

Why:

- This logic is mostly deterministic and should become easier to test if helper functions are extracted out of effect bodies.

#### `components/canvas/use-canvas-node-interactions.ts`

Owns:

- `onNodesChange`
- node drag start / drag / drag stop
- resize lock transitions
- intersected-edge highlighting state

Why:

- Today the drag lifecycle is hard to reason about because local visual behavior and persistence behavior are mixed together.

#### `components/canvas/use-canvas-connections.ts`

Owns:

- `onConnect`
- `onConnectEnd`
- connection-drop-menu state
- create-node-from-connection flows
- adapter glue for reconnect handling

Why:

- New connection creation is a separate mental model from drag/drop creation and should be independently understandable.

#### `components/canvas/use-canvas-drop.ts`

Owns:

- `onDragOver`
- `onDrop`
- DnD payload parsing
- file upload drop flow
- create-node-on-drop orchestration

Why:

- Drop behavior has its own error handling, upload behavior, and defaults. It is a natural isolation boundary.

### 3. Optional view extraction in the final phase

Add `components/canvas/canvas-view.tsx` only after the main hook boundaries are stable.

It should stay presentational and receive:

- `nodes`, `edges`
- overlay state
- `ReactFlow` handlers
- toolbar state and callbacks

Why not first:

- Extracting view first reduces file size but leaves the hard behavioral logic untouched.

## Ownership Model For A Two-Engineer Team

The proposed split creates clean ownership zones:

- Engineer A: sync, optimistic state, offline behavior
- Engineer B: interactions, connection creation, drop flows
- Shared: top-level composition in `canvas.tsx` and pure helpers in `canvas-helpers.ts`

This is useful even if the second engineer joins later because it documents the system in code boundaries, not only in docs.

## Testing Strategy

The refactor should raise confidence by moving logic into units that are easier to test.

### Priority test targets

- optimistic node create -> real ID remap
- deferred `resizeNode` and `updateData` for optimistic nodes
- edge carry during the create/handoff gap
- drag lock prevents stale Convex snapshots from overriding local drag state
- connection validation still rejects invalid edges
- drag-and-drop creation still supports both node payloads and file uploads

### Test shape

- Extract deterministic logic from hook internals into pure helpers where possible.
- Add targeted tests for those helpers first.
- Add hook-level tests only for behavior that genuinely depends on refs, effects, or queue timing.
- Keep manual verification for React Flow pointer interactions that are awkward to simulate precisely.

## Refactor Sequencing

Use small, behavior-preserving phases.

### Phase 1: Sync engine extraction

- Highest complexity
- Highest test ROI
- Unlocks simpler downstream hooks because many callbacks become imported capabilities instead of locally defined machinery

### Phase 2: Flow reconciliation extraction

- Separate mapping and merge behavior from interaction code
- Makes the render path easier to inspect

### Phase 3: Connections and drop extraction

- Split creation pathways by intent: connect vs drop
- Reduces the size of the lower half of `canvas.tsx`

### Phase 4: Optional presentational view extraction

- Only if the remaining orchestrator still feels too dense

## Guardrails

- Do not change `Canvas` or `CanvasInner` public props.
- Keep `ReactFlowProvider` and `useReactFlow` usage exactly compatible with current behavior.
- Keep `nodeTypes` outside React components.
- Preserve ordering of side effects and queue mutations.
- Do not introduce new dependencies.
- Do not rewrite into a reducer architecture in this phase.

## Expected Outcome

- `components/canvas/canvas.tsx` becomes an understandable composition root instead of a monolith.
- The highest-risk behaviors remain intact because the refactor follows existing seams rather than inventing a new runtime model.
- A second engineer can work in the canvas codebase by area of concern instead of first learning the entire file.
