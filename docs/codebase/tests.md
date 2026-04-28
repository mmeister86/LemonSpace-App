# Tests

Die Testlandschaft ist Vitest-basiert und deckt pure Libraries, Convex-Helfer, Canvas-Hooks/-Komponenten, Image Pipeline und Agent Runtime ab.

**Config:** `vitest.config.ts` nutzt Node Environment und den Alias `@` auf den Repo-Root.

## Root-nahe Tests (`tests/*.test.ts`)

| Datei | Fokus |
|-------|-------|
| `tests/render-node-state.test.ts` | Pure Render-Node-State-Logik. |
| `tests/light-adjust-node.test.ts` | Light Adjustment Node Verhalten. |
| `tests/image-transform-node-utils.test.ts` | Image Transform Node Utils. |
| `tests/auth-page-content.test.ts` | Auth-Seiten-Copy/-Content. |
| `tests/adjustment-node-shell.test.ts` | Shared Adjustment Node Shell. |
| `tests/use-pipeline-preview.test.ts` | Pipeline Preview Hook und Histogram/Fast-Path Call Sites. |
| `tests/change-camera-node.test.ts` | Change Camera Node Verhalten. |
| `tests/canvas-connection-policy.test.ts` | Connection Policy Matrix. |
| `tests/use-canvas-history.test.ts` | Canvas History Hook. |
| `tests/splitter-node-config.test.ts` | Splitter-/Node-Konfiguration. |
| `tests/use-canvas-drop.test.ts` | Canvas Drop Verhalten auf höherer Ebene. |
| `tests/worker-client.test.ts` | Image Pipeline Worker Client und Fallbacks. |
| `tests/use-dashboard-snapshot.test.ts` | Dashboard Snapshot Hook/Cache. |
| `tests/use-canvas-data.test.ts` | Canvas Data Hook und Graph Query Ableitung. |
| `tests/preview-renderer.test.ts` | Preview Renderer. |
| `tests/video-prompt-node.test.ts` | Video Prompt Node. |
| `tests/use-node-local-data-order.test.ts` | Reihenfolge/Retention lokaler Node-Daten. |
| `tests/prompt-node.test.ts` | Prompt Node. |
| `tests/crop-node.test.ts` | Crop Node. |
| `tests/crop-node-data-validation.test.ts` | Crop Node Data Validation. |
| `tests/canvas-delete-handlers.test.ts` | Delete Handler und Bridge Edge Verhalten. |
| `tests/canvas-node-favorite.test.ts` | Favorite Preserve/Restore. |
| `tests/canvas-presets-context.test.ts` | Preset Provider Retry/Refresh/Save-Verhalten. |
| `tests/canvas-graph-query-cache.test.ts` | Optimistic Store Helpers für Canvas Graph Query. |
| `tests/agent-output-node.test.ts` | Agent Output Node. |
| `tests/canvas-connection-validation.test.ts` | Client Connection Validation. |
| `tests/ai-video-node.test.ts` | AI Video Node. |
| `tests/adjustment-preview.test.ts` | Adjustment Preview. |
| `tests/ai-text-node.test.ts` | AI Text Node. |
| `tests/agent-node-runtime.test.ts` | Agent Node Runtime-Verhalten. |
| `tests/agent-node.test.ts` | Agent Node UI/State. |

## Library Tests (`tests/lib/`)

| Datei | Fokus |
|-------|-------|
| `tests/lib/dashboard-media-preview.test.ts` | Dashboard Media Preview Helfer. |
| `tests/lib/canvas-mixer-normalization.test.ts` | Mixer Normalisierung. |
| `tests/lib/credit-activity-filtering.test.ts` | Credit Activity Filter/Sort/Pagination. |
| `tests/lib/canvas-utils-modules.test.ts` | Canvas Utility Module Exports/Contracts. |
| `tests/lib/canvas-sync-op-normalize.test.ts` | Sync Op Normalisierung. |
| `tests/lib/browser-storage-cache.test.ts` | Versionierter Browser Storage Cache. |
| `tests/lib/canvas-render-preview.test.ts` | Render Preview Graph/Pipeline Utilities. |
| `tests/lib/credit-activity-cache.test.ts` | Credit Activity Cache. |
| `tests/lib/canvas-mixer-preview.test.ts` | Mixer Preview-Auflösung. |
| `tests/lib/canvas-agent-config.test.ts` | Canvas Agent-Konfiguration. |
| `tests/lib/dashboard-snapshot-cache.test.ts` | Dashboard Snapshot Cache. |
| `tests/lib/credits-activity.test.ts` | Credit Activity Analytics. |
| `tests/lib/agent-templates.test.ts` | Agent Template-Projektion. |
| `tests/lib/ai-models.test.ts` | AI Image Model Registry. |
| `tests/lib/media-archive.test.ts` | Media Archive Utilities. |
| `tests/lib/agent-structured-output.test.ts` | Strukturierte Agent Outputs. |
| `tests/lib/agent-run-contract.test.ts` | Agent Run Contract Normalisierung. |
| `tests/lib/video-poll-logging.test.ts` | Video Poll Log Throttling. |
| `tests/lib/ai-video-models.test.ts` | AI Video Model Registry. |
| `tests/lib/agent-models.test.ts` | Agent Model Registry. |
| `tests/lib/agent-definitions.test.ts` | Agent Definitions. |
| `tests/lib/agent-doc-segments.test.ts` | Generierte Agent Doc Segments. |
| `tests/lib/agent-prompting.test.ts` | Agent Prompt Builder. |

## Convex Tests (`tests/convex/`)

| Datei | Fokus |
|-------|-------|
| `tests/convex/node-status-helpers.test.ts` | Node Status Patch Helper. |
| `tests/convex/nodes-helper-modules.test.ts` | Node Helper Module Contracts. |
| `tests/convex/authz-helpers.test.ts` | Authz/Ownership Helper. |
| `tests/convex/job-credit-flow.test.ts` | Shared Job Credit Flow. |
| `tests/convex/ai-pipeline-modules.test.ts` | AI Pipeline Module Contracts. |
| `tests/convex/credit-transition-helpers.test.ts` | Credit Transition Helper. |
| `tests/convex/ai-errors.test.ts` | AI Error Mapping. |
| `tests/convex/image-transforms.test.ts` | Image Transform Backend Flow. |
| `tests/convex/freepik-video-client.test.ts` | Freepik Video Client, Task Parsing und Polling Errors. |
| `tests/convex/credit-activity-query.test.ts` | Credit Activity Query Shape. |
| `tests/convex/media-backfill.test.ts` | Media Backfill. |
| `tests/convex/media-archive.test.ts` | Convex Media Archive Mutations. |
| `tests/convex/openrouter-structured-output.test.ts` | Structured Output via OpenRouter. |
| `tests/convex/openrouter.test.ts` | OpenRouter Request Body/Response Parsing. |
| `tests/convex/polar-utils.test.ts` | Polar Utility Idempotency. |
| `tests/convex/canvas-graph-query.test.ts` | Canvas Graph Query. |
| `tests/convex/batch-validation-utils.test.ts` | Batch Validation. |
| `tests/convex/edges-create.test.ts` | Edge Creation und Replacement. |
| `tests/convex/ai-utils.test.ts` | AI Utility Compatibility. |
| `tests/convex/agent-orchestration-contract.test.ts` | Agent Orchestration Contracts. |

## Image Pipeline Tests (`tests/image-pipeline/`)

| Datei | Fokus |
|-------|-------|
| `tests/image-pipeline/source-loader.test.ts` | Source Loader. |
| `tests/image-pipeline/webgl-backend-poc.test.ts` | WebGL Backend Proof/Behavior. |
| `tests/image-pipeline/wasm-backend.test.ts` | WASM Backend. |
| `tests/image-pipeline/parity/fixtures.ts` | Parity Fixtures. |
| `tests/image-pipeline/parity/cpu-webgl-parity.test.ts` | CPU/WebGL Parity. |
| `tests/image-pipeline/backend-capabilities.test.ts` | Backend Capability Detection. |
| `tests/image-pipeline/backend-feature-flags.test.ts` | Backend Feature Flags. |
| `tests/image-pipeline/geometry-transform.test.ts` | Geometry Transform. |
| `tests/image-pipeline/image-pipeline.worker.test.ts` | Worker Entry. |
| `tests/image-pipeline/backend-router.test.ts` | Backend Router. |

## Component-lokale Tests

### `components/canvas/__tests__/`

Tests für Canvas-Helper, Hooks, Nodes und UI: `use-canvas-sync-engine`, `use-canvas-drop`, `use-canvas-connections`, `canvas-toolbar`, `mixer-node`, `canvas-node-interaction-helpers`, `canvas-connection-drop-menu-actions`, `canvas-connection-drop-target`, `canvas-connection-auto-split`, `parameter-slider`, `canvas-helpers`, `canvas-selection-toolbar`, `canvas-flow-reconciliation-helpers`, `group-node`, `use-canvas-edge-types`, `canvas-sidebar`, `canvas-node-template-picker`, `canvas-grouping-helpers`, `use-canvas-node-interactions`, `use-canvas-flow-reconciliation`, `frame-node`, `frame-jpeg-export`, `text-node`, `text-node-richtext`, `video-browser-panel`, `use-node-local-data`, `use-canvas-edge-insertions`, `use-canvas-sync-engine-hook`, `compare-node`, `canvas-media-utils`, `default-edge`, `custom-connection-line`, `image-node`, `canvas-connection-drop-menu`, `canvas-handle`, `canvas-delete-handlers`, `canvas-favorites-visibility`, `base-node-wrapper`, `asset-browser-panel`.

### `components/media/__tests__/`

| Datei | Fokus |
|-------|-------|
| `components/media/__tests__/media-library-dialog.test.tsx` | Media Library Dialog Verhalten. |
| `components/media/__tests__/media-preview-utils.test.ts` | Media Preview Utilities. |

## Baseline

Im isolierten Dokumentations-Worktree lief vor den Änderungen `pnpm test` erfolgreich mit:

- 124 Testdateien passed
- 685 Tests passed

## Wartungshinweise

- Neue pure Logik sollte Tests unter `tests/lib/` bekommen.
- Neue Convex-Helfer sollten unter `tests/convex/` getestet werden.
- Komponenten-/Hook-spezifisches Canvas-Verhalten bleibt nahe an `components/canvas/__tests__/`.
- Für reine Dokumentationsänderungen reicht zusätzlich zur Linkprüfung ein voller `pnpm test` als Regression-Signal, wenn Abhängigkeiten installiert sind.
