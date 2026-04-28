# `lib/` — Shared TypeScript und Runtime-Verträge

`lib/` enthält pure TypeScript-Utilities, Typen, Registries, Runtime-Verträge, Caches und Pipeline-Logik. Laut [`lib/CLAUDE.md`](../../lib/CLAUDE.md) gehören hier keine React-Komponenten hinein.

## Canvas Domain Utilities

| Datei | Verantwortung |
|-------|---------------|
| `lib/canvas-utils.ts` | Barrel Export für die modularisierten Canvas-Utilities; nicht mehr die alleinige Implementierungsdatei. |
| `lib/canvas-rf-adapters.ts` | Convex ↔ React Flow Adapter und Storage-URL-Merge-Verhalten. |
| `lib/canvas-node-defaults.ts` | Default-Größen, Default-Data und Handle Maps pro Node-Typ. |
| `lib/canvas-handle-style.ts` | Geteilte Handle-/Accent-Farben. |
| `lib/canvas-bridge-edges.ts` | Berechnet Bridge Edges nach Node-Löschung. |
| `lib/canvas-node-types.ts` | Node-Type-Unions und Validator-Quellen; Sync-Pflicht mit Convex Validatoren. |
| `lib/canvas-node-catalog.ts` | Clientseitige Node-Taxonomie, Kategorien, Phase Flags und Palette Availability. |
| `lib/canvas-node-templates.ts` | Default-`data` Payloads für neue Palette Nodes. |
| `lib/canvas-connection-policy.ts` | Erlaubte/ungültige Edge-Regeln inklusive Video-, Agent-, Mixer- und Adjustment-Regeln. |
| `lib/canvas-node-favorite.ts` | Preserve/restore von Node-Favoriten bei Updates. |
| `lib/canvas-rich-text.ts` | EditorJS/Rich-Text Normalisierung und Sanitizing. |

## Canvas Persistence und Sync Queue

| Datei | Verantwortung |
|-------|---------------|
| `lib/canvas-local-persistence.ts` | LocalStorage Snapshots und leichter Op-Mirror für Canvas Recovery. |
| `lib/canvas-op-queue.ts` | Öffentliche IndexedDB-/localStorage-basierte Sync Queue API. |
| `lib/canvas-sync-op-types.ts` | Typen für Sync Operationen. |
| `lib/canvas-sync-op-storage.ts` | Persistenzschicht der Sync Queue. |
| `lib/canvas-sync-op-mutations.ts` | Mutation-/Remap-Helfer für queued Ops. |
| `lib/canvas-sync-op-normalize.ts` | Normalisierung/Pruning von Sync Ops. |
| `lib/browser-storage-cache.ts` | Defensive, versionierte Browser-Storage-Cache Factory. |

## Preview, Render und Image Pipeline

| Datei | Verantwortung |
|-------|---------------|
| `lib/canvas-render-preview.ts` | Graph Traversal und Pipeline Collection für Render-/Crop-Previews. |
| `lib/canvas-mixer-preview.ts` | Auflösung von Mixer-Kompositionen für Preview/Compare/Render. |
| `lib/canvas-mixer-normalization.ts` | Normalisierung von Mixer-Daten. |
| `lib/mixer-crop-layout.ts` | Crop-/Layout-Berechnungen für Mixer Overlay. |
| `lib/image-pipeline/adjustment-types.ts` | Typen für Adjustment Operationen. |
| `lib/image-pipeline/contracts.ts` | Gemeinsame Contracts für Pipeline-Aufrufe. |
| `lib/image-pipeline/render-core.ts` | CPU-/Core Render-Pipeline. |
| `lib/image-pipeline/render-size.ts` | Zielgrößen-/Sizing-Helfer. |
| `lib/image-pipeline/render-types.ts` | Render-Typen. |
| `lib/image-pipeline/source-loader.ts` | Source Image Loading. |
| `lib/image-pipeline/preview-renderer.ts` | Preview-Rendering. |
| `lib/image-pipeline/crop-node-data.ts` | Crop Node Datenvalidierung/-Normalisierung. |
| `lib/image-pipeline/geometry-transform.ts` | Geometrie-Transformationen. |
| `lib/image-pipeline/histogram.ts` | Histogramm-Berechnung. |
| `lib/image-pipeline/histogram-plot.ts` | Histogramm-Plotdaten. |
| `lib/image-pipeline/presets.ts` | Adjustment Presets für Pipeline. |
| `lib/image-pipeline/bridge.ts` | Bridge zwischen UI/Worker und Pipeline. |
| `lib/image-pipeline/worker-client.ts` | Worker Client mit Fallback-Logik. |
| `lib/image-pipeline/image-pipeline.worker.ts` | Worker Entry für Pipeline-Verarbeitung. |
| `lib/image-pipeline/backend/backend-types.ts` | Backend-Abstraktionstypen. |
| `lib/image-pipeline/backend/backend-router.ts` | Routing zwischen CPU/WebGL/WASM Backends. |
| `lib/image-pipeline/backend/capabilities.ts` | Capability Detection. |
| `lib/image-pipeline/backend/feature-flags.ts` | Feature Flags für Backend-Auswahl. |
| `lib/image-pipeline/backend/webgl/webgl-backend.ts` | WebGL Backend. |
| `lib/image-pipeline/backend/webgl/shaders/*.glsl` | GLSL Shader für Light/Color/Detail/Curves Adjustments. |
| `lib/image-pipeline/backend/webgl/shaders/raw-shader-modules.d.ts` | Type Declarations für Shader-Imports. |
| `lib/image-pipeline/backend/wasm/wasm-backend.ts` | WASM Backend Platzhalter/Implementierungspfad. |
| `lib/image-pipeline/backend/wasm/wasm-loader.ts` | WASM Loader. |

## Agent Runtime und Prompt Contracts

| Datei | Verantwortung |
|-------|---------------|
| `lib/agent-definitions.ts` | Strukturelle Agent Registry und Runtime-Metadaten. |
| `lib/agent-models.ts` | Agent Modell Registry mit Tier-/Credit-Metadaten. |
| `lib/agent-templates.ts` | UI-Projektion aus Agent Definitions. |
| `lib/agent-prompting.ts` | Pure Analyze-/Execute-Prompt Builder. |
| `lib/agent-run-contract.ts` | Barrel/Entry für Agent Run Contract Normalizer. |
| `lib/agent-run-contract-shared.ts` | Shared Contract-Helfer. |
| `lib/agent-run-contract-brief.ts` | Brief-/Clarification-Normalisierung. |
| `lib/agent-run-contract-plan.ts` | Execution-Plan-Normalisierung. |
| `lib/agent-run-contract-output.ts` | Strukturierte Output-Normalisierung. |
| `lib/generated/agent-doc-segments.ts` | Generiert aus `components/agents/*.md`; nicht manuell editieren. |

## Modell- und Produktregistries

| Datei | Verantwortung |
|-------|---------------|
| `lib/ai-models.ts` | Clientseitige Image Model Registry; muss mit `convex/openrouter.ts` synchron bleiben. |
| `lib/ai-video-models.ts` | Video Model Registry; muss mit Freepik-/Convex-Video-Logik synchron bleiben. |
| `lib/ai-text-models.ts` | Text Model Metadaten. |
| `lib/image-transform-models.ts` | Image Transform Operation-/Model-Metadaten. |
| `lib/tier-credits.ts` | Öffentliche Tier-Normalisierung. |
| `lib/polar-products.ts` | Polar Product IDs, Tiers und Top-up-Konfiguration. |
| `lib/topup-calculator.ts` | Bonus-/Top-up-Berechnungen. |

## Auth, Infrastruktur, UX und Dashboard-Helfer

| Datei | Verantwortung |
|-------|---------------|
| `lib/auth.ts` | Better Auth Server-Instanz. |
| `lib/auth-server.ts` | Server-Helper für Auth User und Convex Token. |
| `lib/auth-client.ts` | Clientseitiger `authClient`. |
| `lib/redis.ts` | Redis Client Initialisierung. |
| `lib/rate-limit.ts` | Redis-backed Rate Limiting Utilities. |
| `lib/toast.ts` | Toast Utility Wrapper. |
| `lib/toast-messages.ts` | Typisierte Toast Messages und Delete-Block-Reasons. |
| `lib/ai-errors.ts` | Frontend-nahe AI Error-Kategorisierung und UX-Messages. |
| `lib/video-poll-logging.ts` | Reduziert Video-Polling-Logvolumen. |
| `lib/credits-activity.ts` | Dashboard Credit Analytics, Series und Usage-Domain-Berechnung. |
| `lib/credit-activity-filtering.ts` | Filter/Sort/Pagination-Logik für Credit Activity. |
| `lib/dashboard-snapshot-cache.ts` | Versionierter localStorage Cache für Dashboard Snapshots. |
| `lib/credit-activity-cache.ts` | Cache für `/dashboard/usage` Activity-Daten. |
| `lib/dashboard-media-preview.ts` | Helfer für Dashboard Media Preview. |
| `lib/media-archive.ts` | Media Archive Utilities und Dedupe-Helfer. |
| `lib/pexels-types.ts` | Pexels API TypeScript-Typen. |
| `lib/image-formats.ts` | Aspect Ratios und Node-Chrome/Format-Konstanten. |
| `lib/utils.ts` | Allgemeine Utilities, insbesondere `cn()` via `clsx` + `tailwind-merge`. |

## Sync-Pflichten

- `lib/canvas-node-types.ts` ↔ `convex/node_type_validator.ts` ↔ Canvas Node Registry ↔ Tests.
- `lib/canvas-connection-policy.ts` ↔ `components/canvas/use-canvas-connections.ts` ↔ `convex/edges.ts`.
- `lib/ai-models.ts` ↔ `convex/openrouter.ts`.
- `lib/ai-video-models.ts` ↔ `convex/freepik*` und `convex/ai_video_pipeline.ts`.
- `components/agents/*.md` ↔ `scripts/compile-agent-docs.ts` ↔ `lib/generated/agent-doc-segments.ts` ↔ `convex/agents.ts`.

## Wartungshinweis

`lib/CLAUDE.md` beschreibt `canvas-utils.ts` noch als wichtigste Datei mit vielen konkreten Exports. Nach Modularisierung ist `canvas-utils.ts` primär ein Barrel; die Verantwortung liegt in den split-out Dateien oben.
