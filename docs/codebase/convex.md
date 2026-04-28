# Convex Backend

`convex/` ist das Backend der App: Datenbank-Schema, Realtime Queries, Mutations, Actions, File Storage, Auth, Billing/Credits, Provider-Integrationen und Background Jobs.

**Arbeitskontext:** [`convex/CLAUDE.md`](../../convex/CLAUDE.md). Die lokale Doku ist nützlich, aber einige neuere Split-Module fehlen dort.

## Generiert und ausgeschlossen

Nicht manuell editieren und nicht fachlich file-by-file dokumentieren:

- `convex/_generated/api.d.ts`
- `convex/_generated/api.js`
- `convex/_generated/dataModel.d.ts`
- `convex/_generated/server.d.ts`
- `convex/_generated/server.js`

Diese Dateien werden durch Convex regeneriert.

## Core Schema und Konfiguration

| Datei | Verantwortung |
|-------|---------------|
| `convex/schema.ts` | Canonical Convex Schema für Canvases, Nodes, Edges, Mutation Requests, Presets, Media, Credits, Subscriptions, Webhooks, Usage und Settings. |
| `convex/node_type_validator.ts` | Baut Convex Validatoren aus `lib/canvas-node-types.ts`; muss mit Canvas-Node-Typen synchron bleiben. |
| `convex/convex.config.ts` | Convex App Config; registriert Better-Auth-Komponente. |
| `convex/crons.ts` | Cron-Jobs, aktuell stündliches Cleanup stale Credit Reservations. |

## Auth und Authorization

| Datei | Verantwortung |
|-------|---------------|
| `convex/auth.ts` | Better Auth Setup: E-Mail/Passwort, Magic Links via Resend, Polar Better-Auth Integration, Current-User Queries. |
| `convex/auth.config.ts` | Custom JWT Provider Config für Better Auth/Convex. |
| `convex/helpers.ts` | `requireAuth` und `optionalAuth`. |
| `convex/authz_helpers.ts` | Ownership-/Zugriffsassertions für Canvas und Nodes. |
| `convex/http.ts` | HTTP Router für Better-Auth-Routen und Webhook-fähige Endpunkte. |

## Canvas Graph, Nodes und Edges

| Datei | Verantwortung |
|-------|---------------|
| `convex/canvases.ts` | Canvas list/get/create/update/remove/thumbnail. |
| `convex/canvasGraph.ts` | Gebündelte Graph Query und interne Graph Loader; liefert Nodes+Edges effizient für Canvas. |
| `convex/nodes.ts` | Haupt-API für Node CRUD, Grouping, Edge-Split Create Flows, Move/Resize, Data/Status/Z-Index/Parent Updates, Remove/Batch Remove. |
| `convex/edges.ts` | Edge list/create/remove, Mixer-Input Swapping und Connection-Policy Enforcement. |
| `convex/batch_validation_utils.ts` | Generische Batch-Ownership-Validierung. |
| `convex/nodes/validation.ts` | Node-spezifische Batch Validation und Connection-Policy Checks. |
| `convex/nodes/write_helpers.ts` | Node-Data Normalisierung, Render-/Adjustment-Validierung, Insert-Helfer und Payload Sizing. |
| `convex/nodes/delete_cleanup.ts` | Edge Cleanup, Child Detach und Node/Group Delete-Helfer. |
| `convex/nodes/grouping.ts` | Parent-/Descendant-Validierung für Groups/Frames. |
| `convex/nodes/idempotency.ts` | Idempotente Node-Erstellung und Replay-Helfer. |
| `convex/node_status_helpers.ts` | Wiederverwendbare Status-/Data-Patch Builder. |

## Storage, Media und Dashboard

| Datei | Verantwortung |
|-------|---------------|
| `convex/storage.ts` | Upload URLs, sichere Batch-URL-Auflösung für Canvas/Media Storage IDs, Registrierung hochgeladener Bild-/Video-Medien. |
| `convex/media.ts` | Media Library: list/upsert/internal upsert, Dedupe, Legacy Node-to-Media Backfill. |
| `convex/dashboard.ts` | Aggregierte Dashboard Snapshot Query und Media-Library Listing. |

## Credits, Billing und Subscriptions

| Datei | Verantwortung |
|-------|---------------|
| `convex/credits.ts` | Tier Config, Balance/Subscription/Activity Queries, Init/Test Grants, Reservation/Commit/Release, Abuse Limits, Cleanup, Subscription/Top-up Mutations. |
| `convex/job_credit_flow.ts` | Gemeinsame Credit-Orchestrierung für async AI Jobs. |
| `convex/polar.ts` | Interne Polar Webhook Mutations für Subscription Activation/Revocation und Top-ups. |
| `convex/polar_utils.ts` | Polar Idempotency Keys und Single-Registration Utilities. |

## AI, Agenten und Provider-Jobs

| Datei | Verantwortung |
|-------|---------------|
| `convex/ai.ts` | Public Facade, die Image/Text/Video Generation Definitions in Actions/Internal Mutations verdrahtet. |
| `convex/ai_image_pipeline.ts` | OpenRouter Image Pipeline: Retry, Storage, Finalization, Media Archive Insert. |
| `convex/ai_text_pipeline.ts` | Text Generation Pipeline. |
| `convex/ai_video_pipeline.ts` | Freepik async Video Generation, Polling und Finalization. |
| `convex/image_transforms.ts` | Freepik/lokale Transform-Orchestrierung für bg-remove, upscale, style-transfer, face-restore, change-camera. |
| `convex/image_transform_mutations.ts` | Interne Mutations für Transform-Status, Task IDs und Finalization. |
| `convex/provider_polling.ts` | Gemeinsame Polling Delay/Timeout/Retry-Helfer. |
| `convex/openrouter.ts` | OpenRouter Client, structured object generation, Image Model Registry und Image Generation. |
| `convex/ai_errors.ts` | Error-Kategorisierung, Provider-Status-Extraktion und user-facing Messages. |
| `convex/ai_retry.ts` | Retry Wrapper für Image Generation. |
| `convex/ai_node_data.ts` | Safe Node-Data-Record Helper. |
| `convex/ai_utils.ts` | Compatibility Re-export von `assertNodeBelongsToCanvasOrThrow`. |
| `convex/agents.ts` | Agent Analyze/Execute Orchestration, Clarifications, Structured Outputs, Scheduling und Credit Flow. |

## Provider-Integrationen

| Datei | Verantwortung |
|-------|---------------|
| `convex/freepik.ts` | Public Freepik Facade: Asset Search Action, Video Task Create/Status/Download, Transform Exports. |
| `convex/freepik_client.ts` | Freepik HTTP Client, Endpoint Normalization, Error Mapping und Blob Downloads. |
| `convex/freepik_search.ts` | Freepik Asset Search Args und Request Implementation. |
| `convex/freepik_tasks.ts` | Task-ID Extraction und Status Parsing für Freepik async Jobs. |
| `convex/freepik_transforms.ts` | Freepik Image Transform API Calls und Image Blob Downloads. |
| `convex/pexels.ts` | Pexels Video Search/Popular/Get-by-ID Actions. |

## Settings, Presets und Migrationen

| Datei | Verantwortung |
|-------|---------------|
| `convex/presets.ts` | Adjustment Preset list/save/remove. |
| `convex/users.ts` | User Locale set/get. |
| `convex/migrations.ts` | Interne Media Archive Backfills und Pexels Video-Node Migration. |

## Wichtige Backend-Flows

### Canvas Graph Sync

`components/canvas/use-canvas-data.ts` konsumiert `api.canvasGraph.get`; Mutations laufen über `nodes.ts`, `edges.ts`, `canvases.ts` und werden clientseitig durch Sync Queue/Optimistic Updates gespiegelt.

### Async AI Jobs

Public Actions in `ai.ts` oder Provider-Facades planen Background Jobs. Pipelines markieren Nodes als `executing`, reservieren optional Credits, speichern Ergebnisse in Convex Storage, schreiben Media-Archive-Einträge und finalisieren Node-Status.

### Credit Flow

`credits.ts` verwaltet Balance, reserved Credits, Daily Caps und Transactions. `job_credit_flow.ts` bündelt wiederkehrende Reservation/Commit/Release-Logik für Pipelines.

## Wartungshinweise

- `convex/CLAUDE.md` nennt `canvas-connection-policy.ts` unter Convex, tatsächlich liegt die Policy in `lib/canvas-connection-policy.ts` und wird von Backend/Frontend gemeinsam respektiert.
- `ai.ts` ist heute eher Facade als alleinige Pipeline-Datei; konkrete Pipelines liegen in `ai_*_pipeline.ts` und `image_transforms.ts`.
- `freepik.ts` ist ebenfalls Facade; HTTP-/Parsing-Details liegen in den Split-Dateien.
- Neue Node-Typen benötigen Sync über `lib/canvas-node-types.ts`, `convex/node_type_validator.ts`, `convex/schema.ts`, Canvas Node Registry und Tests.
