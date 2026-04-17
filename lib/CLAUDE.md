# lib/ — Utilities & Shared Logic

Geteilte Hilfsfunktionen, Typ-Definitionen und Konfiguration. Keine React-Komponenten — nur reines TypeScript.

---

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `canvas-utils.ts` | Convex↔React Flow Adapter, Edge-Glow, Node-Defaults, Bridge-Edges |
| `canvas-node-catalog.ts` | Vollständige Node-Taxonomie (alle Phasen, Kategorien, Phase-Flags) |
| `canvas-node-types.ts` | TypeScript-Typen und Union-Typen für Canvas-Nodes |
| `canvas-node-templates.ts` | Default-Daten für neue Nodes (beim Einfügen aus Palette) |
| `canvas-connection-policy.ts` | Validierungsregeln für Edge-Verbindungen zwischen Nodes |
| `canvas-node-favorite.ts` | Node-Favoriten-Persistierung (preserve/restore bei Node-Updates) |
| `canvas-render-preview.ts` | Render-Preview-Pipeline: Graph-Traversal, Pipeline-Assembly, Fast-Path-Optimierung |
| `agent-definitions.ts` | Runtime-Registry fuer Agent-Definitionen (Struktur, Regeln, Blueprints, Docs-Pfad) |
| `agent-models.ts` | Agent-Modell-Registry: GPT-5.4 Nano/Mini/Pro mit Credit-Kosten und Tier-Zugang |
| `agent-templates.ts` | UI-Projektion auf Agent-Metadaten aus `agent-definitions.ts` |
| `agent-prompting.ts` | Pure Prompt-Builder (`summarizeIncomingContext`, `buildAnalyzeMessages`, `buildExecuteMessages`) |
| `agent-run-contract.ts` | Normalisierung fuer Clarifications, Execution Plan und strukturierte Agent-Outputs |
| `generated/agent-doc-segments.ts` | Generierte Prompt-Segmente aus `components/agents/*.md` (nicht manuell editieren) |
| `ai-models.ts` | Client-seitige Bild-Modell-Definitionen (muss mit `convex/openrouter.ts` in sync bleiben) |
| `ai-video-models.ts` | Video-Modell-Registry: 5 MVP-Modelle mit Endpunkten, Credit-Kosten, Tier-Zugang |
| `video-poll-logging.ts` | Log-Volumen-Steuerung für Video-Polling (vermeidet excessive Konsolenausgabe) |
| `tier-credits.ts` | Tier-Normalisierung (`normalizePublicTier`) für Video-Modell-Tier-Checks |
| `image-formats.ts` | Aspect-Ratio-Strings, Node-Chrome-Höhen (`AI_IMAGE_NODE_HEADER_PX` etc.) |
| `media-archive.ts` | Media-Archiv-Utilities: Deduplication, Archivierung von Canvas-Media-Items |
| `mixer-crop-layout.ts` | Crop-Layout-Berechnung für Mixer-Overlay |
| `auth.ts` | Better Auth Server-Instanz |
| `auth-server.ts` | Server-Helper: `getAuthUser()`, `getToken()` |
| `auth-client.ts` | Client-Helper: `authClient` |
| `canvas-local-persistence.ts` | localStorage-Cache für Canvas-Snapshots und Op-Queue |
| `canvas-op-queue.ts` | IndexedDB-basierte Canvas-Sync-Queue (Retry, TTL, Remap/Pruning) |
| `toast.ts` | Toast-Utility-Wrapper |
| `toast-messages.ts` | Typisierte Toast-Message-Definitionen (`msg`, `CanvasNodeDeleteBlockReason`) |
| `ai-errors.ts` | Error-Kategorisierung und User-facing Fehlermeldungen |
| `pexels-types.ts` | TypeScript-Typen für Pexels-API-Responses |
| `polar-products.ts` | Polar.sh Produkt-IDs und Tier-Mapping |
| `rate-limit.ts` | Rate-Limiting-Utilities (Redis-backed) |
| `redis.ts` | Redis-Client-Initialisierung |
| `topup-calculator.ts` | Bonus-Staffel-Berechnung für Credit-Top-Ups |
| `utils.ts` | `cn()` (clsx + tailwind-merge), allgemeine Utilities |
| `credits-activity.ts` | Credits-Aktivitäts-Analytics: Transaktions-Priorisierung, Activity-Series, Usage-Domain-Berechnung |
| `dashboard-snapshot-cache.ts` | localStorage-Cache für Dashboard-Snapshots (12h TTL, versioniert) |

---

## Agent Runtime: Dual Model

Die Agent-Runtime folgt einem dualen Modell:

- **TS-Vertraege als Struktur-Single-Source:** `lib/agent-definitions.ts` + `lib/agent-run-contract.ts` definieren IDs, Regeln, Blueprints und Normalisierung.
- **Markdown-Segmente als kuratierter Prompt-Input:** markierte Segmente in `components/agents/*.md` werden via `scripts/compile-agent-docs.ts` in `lib/generated/agent-doc-segments.ts` kompiliert.

Wichtig:

- `convex/agents.ts` liest nur die generierte TS-Datei, nicht Raw-Markdown.
- Nur markierte `AGENT_PROMPT_SEGMENT`-Bloecke beeinflussen Analyze/Execute-Prompts.
- `agent-templates.ts` ist bewusst nur eine UI-Projektion aus `agent-definitions.ts`.

---

## `agent-models.ts` — Agent-Modell-Registry

Zentrale Definition der für Agent-Runs verfügbaren LLM-Modelle.

```typescript
export type AgentModelId = "openai/gpt-5.4-nano" | "openai/gpt-5.4-mini" | "openai/gpt-5.4" | "openai/gpt-5.4-pro"
export type AgentModelMinTier = "starter" | "max"

export const AGENT_MODELS: Record<AgentModelId, AgentModel>
```

**Agent-Modelle:**

| ID | Label | Tier | Credits | Beschreibung |
|---|---|---|---|---|
| `openai/gpt-5.4-nano` | GPT-5.4 Nano | starter | 6 Cr | Schnellste Option für leichte Agent-Runs |
| `openai/gpt-5.4-mini` | GPT-5.4 Mini | starter | 15 Cr | Balance aus Qualität und Latenz |
| `openai/gpt-5.4` | GPT-5.4 | starter | 38 Cr | Höhere Reasoning-Qualität für komplexe Tasks |
| `openai/gpt-5.4-pro` | GPT-5.4 Pro | max | TBD | Premium-Modell für anspruchsvolle Orchestrations |

**Sync-Pflicht:** `creditCost` muss mit dem Credit-System in Convex übereinstimmen.

---

## `canvas-utils.ts` — Wichtigste Datei

Alle Adapter-Funktionen zwischen Convex-Datenmodell und React Flow. Details in `components/canvas/CLAUDE.md`.

**Kritische Exports:**
- `convexNodeToRF`, `convexEdgeToRF`, `convexEdgeToRFWithSourceGlow`
- `convexNodeDocWithMergedStorageUrl` — URL-Injection für Storage-Bilder aus serverseitig aufgelöster URL-Map oder gecachtem Vorgängerzustand
- `NODE_DEFAULTS` — Default-Größen und Daten per Node-Typ (inkl. `video-prompt` und `ai-video`)
- `NODE_HANDLE_MAP` — Handle-IDs pro Node-Typ (inkl. `video-prompt-out/in` und `video-out/in`)
- `SOURCE_NODE_GLOW_RGB` — Edge-Glow-Farben pro Source-Node-Typ (inkl. `video-prompt` und `ai-video`)
- `canvasHandleAccentRgb`, `canvasHandleAccentColor`, `canvasHandleAccentColorWithAlpha` — gemeinsame Handle-Akzentfarben (inkl. Spezialfälle für `compare.left/right/compare-out` und `mixer.base/overlay/mixer-out`)
- `agent` ist als input-only Node enthalten (`NODE_HANDLE_MAP.agent = { target: "agent-in" }`)
- `computeBridgeCreatesForDeletedNodes` — Kanten-Reconnect nach Node-Löschung
- `computeMediaNodeSize` — Dynamische Node-Größe basierend auf Bild-Dimensionen

**Wichtig:** `canvas-utils.ts` erzeugt keine Storage-Fallback-URLs mehr selbst. Die URL-Auflösung kommt aus dem Canvas-Layer (`storage.batchGetUrlsForCanvas`) und wird hier nur noch gemerged/cached.

---

## `canvas-node-types.ts` — TypeScript-Typen

Einzige Quelle für Node-Typ-Union-Typen und Schema-Validatoren.

```typescript
PHASE1_CANVAS_NODE_TYPES    // Phase 1 Nodes (aktiv)
CANVAS_NODE_TYPES           // Phase 1 + Phase 2 + Phase 3 (alle)
ADJUSTMENT_NODE_TYPES       // Adjustment-Preset-Nodes (curves, color-adjust, etc.)
ADJUSTMENT_PRESET_NODE_TYPES // Spezifische Adjustment-Presets
```

**Wichtig:** Dieser Datei und `convex/node_type_validator.ts` müssen immer synchron gehalten werden. Neue Nodes → Validator anpassen.

**Video-Typen:** `video-prompt` ist in `PHASE1_CANVAS_NODE_TYPES` und `CANVAS_NODE_TYPES` enthalten. `ai-video` ist in `CANVAS_NODE_TYPES` (Phase 2).

---

## `canvas-node-catalog.ts` — Node-Taxonomie

Einzige Wahrheitsquelle für alle Node-Typen auf Client-Seite.

```typescript
NODE_CATALOG          // Alle Nodes aller Phasen
NODE_CATEGORY_META    // Label + Sortierung pro Kategorie
NODE_CATEGORIES_ORDERED // Sortierte Kategorien-Liste
catalogEntriesByCategory() // Gruppiert für Sidebar-Rendering
isNodePaletteEnabled  // true wenn: implementiert + kein systemOutput + Template vorhanden
```

**Kategorien:**
- `source` — Quelle (image, text, video, asset, color)
- `ai-output` — KI-Ausgabe (prompt, video-prompt, ai-text)
- `agents` — Agents (agent, agent-output)
- `transform` — Transformation (crop, bg-remove, upscale)
- `image-edit` — Bildbearbeitung (adjustments)
- `control` — Steuerung & Flow
- `layout` — Canvas & Layout (group, frame, note, compare)

**Node-Eigenschaften:**
- `type` — Node-Typ (als String)
- `label` — Anzeigetext
- `category` — Kategorisierung
- `phase` — 1, 2 oder 3 (für zukünftige Feature-Phasen)
- `implemented` — true wenn React-Flow-Komponente vorhanden
- `systemOutput` — true wenn KI-System diese Nodes erzeugt (nicht aus Palette nutzbar)
- `disabledHint` — Kurzer Hinweis für deaktivierte Nodes

**Phase-2/3-Nodes:** Haben `implemented: false` und `disabledHint`. UI filtert nach Phase, niemals ohne zugehörige React-Flow-Komponente `implemented: true` setzen.

---

## `canvas-node-templates.ts` — Default-Daten

Default-Initial-Daten für neue Nodes beim Einfügen aus Palette.

- Erstellt durch die Node-Katalog-Einträge
- Enthält default-Werte für `data`-Felder
- `video-prompt` hat Default-Daten: `{ modelId: "wan-2-2-720p", durationSeconds: 5 }`
- `agent` hat aktuell ein statisches Template-Default: `{ templateId: "campaign-distributor" }`
- Wird von `canvas.tsx` verwendet beim Node-Create

---

## `canvas-connection-policy.ts` — Validierungsregeln

Regeln für erlaubte Verbindungen zwischen Node-Typen.

**Validierungs-Funktionen:**
- `validateCanvasConnectionPolicy()` — Prüft, ob Verbindung erlaubt ist
- `getCanvasConnectionValidationMessage()` — Gibt lesbare Fehlermeldung zurück
- `assertConnectionPolicy()` — Wirft Fehler bei ungültiger Verbindung

**Regeln:**
- Source-Typ muss Output-Ports haben, Target-Typ muss Input-Ports haben
- Keine self-loops (Edge von Node zu sich selbst)
- Quelle: `image`, `text`, `note`, `group`, `compare`, `frame` → Source-Ports
- Ziel: `ai-image`, `ai-video`, `compare` → Target-Ports
- **Video-Flow:** `video-prompt → ai-video` ✅ (einzige gültige Kombination)
  - `ai-video` als Target akzeptiert nur `video-prompt` als Source (`ai-video-source-invalid`)
  - `video-prompt` als Source akzeptiert nur `ai-video` als Target (`video-prompt-target-invalid`)
  - `text → video-prompt` ✅ (Prompt-Quelle, über default-Handles)
- **Agent-MVP:** `agent` akzeptiert nur Content-/Kontext-Quellen (`agent-source-invalid` bei Prompt/Steuerknoten), ohne eingehendes Kantenlimit
- Curves- und Adjustment-Node-Presets: Nur Presets nutzen, keine direkten Edges

---

## `canvas-render-preview.ts` — Render-Preview-Pipeline

Utilities für die clientseitige Render-Preview-Generierung.

**Kernfunktionen:**
- `getSourceImageFromGraph(nodes, edges, nodeId)` — Findet das Quellbild für einen Node im Graph
- `collectPipelineFromGraph(nodes, edges, nodeId)` — Sammelt alle Pipeline-Schritte (Adjustments, Mixer, Crop) vom Quellbild zum Ziel-Node
- `shouldFastPathPreviewPipeline(pipeline)` — Entscheided ob Fast-Path-Preview möglich ist

Wird von `render-node.tsx` und `crop-node.tsx` verwendet.

---

## `ai-models.ts` — Sync-Pflicht

```typescript
// Muss identisch zu convex/openrouter.ts sein!
export const IMAGE_MODELS: AiModel[]
export const DEFAULT_MODEL_ID: string
```

**Achtung:** Diese Datei und `convex/openrouter.ts` müssen immer synchron gehalten werden. Bei neuen Modellen beide Dateien gleichzeitig aktualisieren. `creditCost` muss übereinstimmen — sonst stimmt die angezeigte Kostenvorschau nicht mit dem tatsächlichen Abzug übereinstimmt.

---

## `ai-video-models.ts` — Video-Modell-Registry

Zentrale Definition aller KI-Video-Modelle mit Freepik-Endpunkten, Credit-Kosten und Tier-Zugang.

```typescript
export type VideoModelId = "wan-2-2-480p" | "wan-2-2-720p" | "kling-std-2-1" | "seedance-pro-1080p" | "kling-pro-2-6"
export type VideoModelTier = "free" | "starter" | "pro"
export type VideoModelDurationSeconds = 5 | 10

export const VIDEO_MODELS: Record<VideoModelId, VideoModel>
export const DEFAULT_VIDEO_MODEL_ID: VideoModelId  // "wan-2-2-720p"
```

**MVP-Modelle:**

| ID | Label | Tier | Endpunkt | 5s (Cr) | 10s (Cr) |
|---|---|---|---|---|---|
| `wan-2-2-480p` | WAN 2.2 480p | free | `/v1/ai/text-to-video/wan-2-5-t2v-720p` | 28 | 56 |
| `wan-2-2-720p` | WAN 2.2 720p | free | `/v1/ai/text-to-video/wan-2-5-t2v-720p` | 52 | 104 |
| `kling-std-2-1` | Kling Standard 2.1 | starter | `/v1/ai/image-to-video/kling-v2-1-std` | 50 | 100 |
| `seedance-pro-1080p` | Seedance Pro 1080p | starter | `/v1/ai/video/seedance-1-5-pro-1080p` | 33 | 66 |
| `kling-pro-2-6` | Kling Pro 2.6 | pro | `/v1/ai/image-to-video/kling-v2-6-pro` | 59 | 118 |

**Wichtig:** Jedes Modell hat einen `statusEndpointPath` (z. B. `/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}`), der für das Polling des Task-Status verwendet wird. Freepik hat **keinen** generischen Task-Status-Endpunkt.

**Sync-Pflicht:** Diese Datei und `convex/freepik.ts` / `convex/ai.ts` müssen synchron gehalten werden. `creditCost` muss mit dem Credit-System übereinstimmen.

**Hilfsfunktionen:**
- `isVideoModelId(value)` — Type-Guard für VideoModelId
- `getVideoModel(id)` — Holt Modell-Definition, gibt `undefined` bei ungültiger ID
- `getAvailableVideoModels(tier)` — Filtert Modelle nach User-Tier

---

## `video-poll-logging.ts` — Log-Volumen-Steuerung

Reduziert Konsolenausgabe beim Video-Polling (bis zu 30 Versuche pro Video).

```typescript
export function shouldLogVideoPollAttempt(attempt: number): boolean
  // true bei Versuch 1 und jedem 5. Versuch (5, 10, 15, ...)

export function shouldLogVideoPollResult(attempt: number, status: VideoPollStatus): boolean
  // true bei jedem nicht-IN_PROGRESS Status oder wenn shouldLogVideoPollAttempt true ist
```

Verwendet in `convex/ai.ts` (`pollVideoTask`) und `convex/freepik.ts` (`getVideoTaskStatus`).

---

## `credits-activity.ts` — Credits Analytics

Analytics-Helpers für die Dashboard Credits-Aktivitäts-Anzeige. Wird von `components/dashboard/credits-activity-chart.tsx` und `convex/dashboard.ts` verwendet.

**Kernfunktionen:**

```typescript
// Transaktions-Priorisierung (Usage → Reservation → Refund → Topup → Subscription)
prioritizeRecentCreditTransactions(transactions, limit)

// Tages-aggregierte Activity-Series für Recharts (max. 7 Tage)
buildCreditsActivitySeries(transactions, availableCredits, locale, maxPoints?)

// Y-Achsen-Domain mit Headroom (mind. 8, +20% Headroom)
calculateUsageActivityDomain(points)

// Credit-Formatierung ("1.234 Cr")
formatCredits(value, locale)
```

**Typen:**
- `CreditTransactionLike` — Minimales Transaction-Interface für Analytics
- `CreditActivityPoint` — Tages-Datenpunkt (`{ day, usage, activity, available }`)

---

## `dashboard-snapshot-cache.ts` — Dashboard Snapshot Cache

localStorage-basierter Cache für Dashboard-Snapshot-Daten.

```typescript
readDashboardSnapshotCache<T>(userId, options?)  // Cached Snapshot lesen (mit TTL-Prüfung)
writeDashboardSnapshotCache<T>(userId, snapshot) // Snapshot schreiben
clearDashboardSnapshotCache(userId)              // Cache invalidieren
```

**Konfiguration:**
- Namespace: `lemonspace.dashboard`
- Key: `lemonspace.dashboard:snapshot:v1:<userId>`
- TTL: 12 Stunden (`DEFAULT_TTL_MS = 12 * 60 * 60 * 1000`)
- Version: `CACHE_VERSION = 1` — Bumps invalidieren bestehende Caches
- Alle Storage-Zugriffe defensiv (try-catch, quota handling)

---

## `canvas-local-persistence.ts` — localStorage-Cache

```typescript
readCanvasSnapshot(canvasId)      // Letzten Snapshot laden
writeCanvasSnapshot(canvasId, {nodes, edges})  // Snapshot speichern
enqueueCanvasOp(canvasId, op)     // Op in Queue schreiben
resolveCanvasOp(canvasId, opId)   // Op aus Queue entfernen
readCanvasOps(canvasId)           // Ausstehende Ops lesen
remapCanvasOpNodeId(canvasId, fromId, toId)     // optimistic→real remap
dropCanvasOpsByNodeIds(canvasId, ids)           // konfliktbedingtes Pruning
dropCanvasOpsByClientRequestIds(canvasId, ids)  // Create-Cancel
dropCanvasOpsByEdgeIds(canvasId, ids)           // Remove-Cancel
```

Key-Schema: `lemonspace.canvas:snapshot:v1:<id>` / `lemonspace.canvas:ops:v1:<id>`. Bei Version-Bumps (`SNAPSHOT_VERSION`, `OPS_VERSION`) werden alte Keys automatisch ignoriert.

## `canvas-op-queue.ts` — Sync-Queue

Zentrale, persistente Queue für Canvas-Mutations mit IndexedDB (Fallback: localStorage), Retry-Backoff und 24h-TTL.

Wichtige APIs:

```typescript
enqueueCanvasSyncOp(...)
listCanvasSyncOps(canvasId)
ackCanvasSyncOp(opId)
markCanvasSyncOpFailed(opId, { nextRetryAt, lastError })
dropExpiredCanvasSyncOps(canvasId, now)
remapCanvasSyncNodeId(canvasId, fromId, toId)
dropCanvasSyncOpsByNodeIds(canvasId, ids)
dropCanvasSyncOpsByClientRequestIds(canvasId, ids)
dropCanvasSyncOpsByEdgeIds(canvasId, ids)
```

---

## Auth-Helpers

```typescript
// Server (lib/auth-server.ts) — nur in Server Components / Route Handlers
getAuthUser()  // → Better Auth User | null
getToken()     // → Convex JWT Token | null (für initialToken im Root Layout)

// Client (lib/auth-client.ts)
authClient     // Better Auth Client-Instanz für signIn, signUp, signOut etc.
```

---

## Konventionen

- Keine React-Imports in `lib/` — reines TypeScript
- `utils.ts` für generische Helpers (`cn`, `clamp`, etc.)
- Typen, die sowohl Frontend als auch Convex betreffen, gehören in `lib/`, nicht in `convex/`
- Modell-Registrys (`ai-models.ts`, `ai-video-models.ts`, `agent-models.ts`) müssen immer mit den Backend-Äquivalenten synchron gehalten werden
