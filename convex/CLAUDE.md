# convex/ — Backend-Schicht

Convex ist das vollständige Backend von LemonSpace: Datenbank, Realtime-Subscriptions, File Storage und Background-Job-Scheduler in einem. Kein separates API-Layer notwendig.

---

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `schema.ts` | Einzige Wahrheitsquelle für alle Tabellen und Typen |
| `node_type_validator.ts` | Node-Typen Validator (Phase 1, Phase 2, Phase 3, Adjustment Presets) |
| `ai.ts` | KI-Bild- und KI-Video-Generierungs-Pipeline |
| `credits.ts` | Credit-System: Balance, Reservation+Commit, Tier-Config |
| `nodes.ts` | CRUD für Canvas-Nodes |
| `edges.ts` | CRUD für Canvas-Edges |
| `canvases.ts` | CRUD für Canvases |
| `openrouter.ts` | OpenRouter-HTTP-Client + Modell-Config (Backend) |
| `auth.ts` | Better Auth Integration |
| `helpers.ts` | `requireAuth()` + `optionalAuth()` für Auth-Checks |
| `batch_validation_utils.ts` | Validierung von Batch-Node-Operationen |
| `canvas-connection-policy.ts` | Verbindungspolitiken zwischen Nodes (Validierung) |
| `polar.ts` | Polar.sh Webhook-Handler (Subscriptions) |
| `pexels.ts` | Pexels Stock-Bilder API |
| `freepik.ts` | Freepik Asset-Browser API + Video-Generierungs-Client |
| `agents.ts` | Agent-Orchestrierung: Analyze/Execute-Flow, Clarifications, strukturierte Outputs, Scheduler/Credits-Integration |
| `ai_utils.ts` | Gemeinsame Helpers für AI-Pipeline (z. B. `assertNodeBelongsToCanvasOrThrow`) |
| `storage.ts` | Convex File Storage Helpers + gebündelte Canvas-URL-Auflösung |
| `http.ts` | HTTP-Endpunkte (Webhooks) |
| `dashboard.ts` | Gebündelte Dashboard-Snapshot-Query (Balance, Subscription, Usage, Transactions, Canvases in einem Call) |
| `canvasGraph.ts` | Canvas Graph Query — Performance-optimierte Query für Nodes+Edges in einem Call |
| `ai_errors.ts` | Error-Kategorisierung und User-facing Fehlermeldungen (aus `ai.ts` extrahiert) |
| `ai_node_data.ts` | Node-Data-Helpers (z. B. `getNodeDataRecord`) |
| `ai_retry.ts` | Retry-Logik für AI-Generierung (`generateImageWithAutoRetry`, aus `ai.ts` extrahiert) |
| `media.ts` | Media-Archivierung: Persistierung von Media-Items (Bilder, Videos, Assets) mit Deduplication und Preview-Generierung |
| `migrations.ts` | Schema-Migrations-Helpers für Convex |
| `polar_utils.ts` | Gemeinsame Polar.sh Utilities für Subscription- und TopUp-Handling |
| `presets.ts` | Adjustment-Preset CRUD (list, save, remove) |
| `users.ts` | User-Management (Settings, Locale) |

---

## Schema (`schema.ts`)

Alle Node-Typen werden über Validators definiert: `phase1NodeTypeValidator`, `nodeTypeValidator` (Phase 1+), `adjustmentNodeTypeValidator`, und `adjustmentPresetNodeTypeValidator`. Die Validators werden aus den Konstanten in `lib/canvas-node-types.ts` via `buildNodeTypeUnion` erzeugt.

### Phase-Struktur

- **Phase 1 Nodes:** Aktiv implementierte Nodes (`PHASE1_CANVAS_NODE_TYPES`)
- **Phase 2/3 Nodes:** Vordeklariert, aber `implemented: false` — UI filtert nach Phase
- **Adjustment Presets:** Spezielle Presets für Curves, Color Adjust, Light Adjust, Detail Adjust

### Node Data Shapes

| Node-Typ | Felder | Bemerkung |
|----------|--------|-----------|
| `image` | `storageId`, `url`, `mimeType`, `width`, `height` | Bild-Upload oder URL |
| `text` | `content` | Markdown-Text |
| `prompt` | `content`, `model`, `modelTier` | KI-Generierungsanweisung |
| `ai-image` | `storageId`, `prompt`, `model`, `modelTier`, `parameters`, `generationTimeMs`, `creditCost` | Generiertes KI-Bild |
| `text-node` | `content` | Generierter KI-Text |
| `video-prompt` | `content`, `modelId`, `durationSeconds` | KI-Video-Steuer-Node (Eingabe) |
| `ai-video` | `storageId`, `prompt`, `model`, `modelLabel`, `durationSeconds`, `creditCost`, `generatedAt`, `taskId` (transient) | Generiertes KI-Video (System-Output) |
| `compare` | `leftNodeId`, `rightNodeId`, `sliderPosition` | Vergleichs-Node |
| `mixer` | `blendMode`, `opacity`, `overlayX`, `overlayY`, `overlayWidth`, `overlayHeight` | V1 Merge-Control-Node mit pseudo-image Output (kein Storage-Write) |
| `frame` | `label`, `exportWidth`, `exportHeight`, `backgroundColor` | Artboard |
| `group` | `label`, `collapsed` | Container-Node |
| `note` | `content`, `color` | Anmerkung |
| `curves` | Presets (Kurven) | Nicht im UI als Node-Typ, sondern als Presets |
| `color-adjust` | Presets (Farbkorrektur) | |
| `light-adjust` | Presets (Helligkeit) | |
| `detail-adjust` | Presets (Details) | |

### Tabellen

**`canvases`** — Canvas pro User. Index: `by_owner`, `by_owner_updated`.

**`nodes`** — Alle Nodes eines Canvas. Felder: `type`, `positionX/Y`, `width`, `height`, `status` (`idle|analyzing|clarifying|executing|done|error`), `statusMessage`, `retryCount`, `data` (v.any()), `parentId`, `zIndex`. Index: `by_canvas`, `by_canvas_type`, `by_parent`.

> `data` ist `v.any()` — Typ-Safety läuft über den `type`-Discriminator + Zod im Frontend. Die Node-Data-Shapes sind in `schema.ts` dokumentiert.

**`edges`** — Verbindungen zwischen Nodes. Index: `by_canvas`, `by_source`, `by_target`.

**`mutationRequests`** — Idempotenz-Layer für Client-Replay (`clientRequestId`) bei offline/Retry-Sync. Felder: `userId`, `mutation`, `clientRequestId`, optionale Ziel-IDs (`canvasId`, `nodeId`, `edgeId`). Index: `by_user_mutation_request`.

**`adjustmentPresets`** — Benutzerspezifische Presets für Adjustment-Nodes. Index: `by_userId`, `by_userId_nodeType`.

**`creditBalances`** — Pro User: `balance`, `reserved`, `monthlyAllocation`. `available = balance - reserved` (computed, nicht gespeichert).

**`creditTransactions`** — Jede Credit-Bewegung. Types: `subscription | topup | usage | reservation | refund`. Status: `committed | reserved | released | failed`. Optionale Felder: `provider` (`openrouter` | `freepik`), `videoMeta` (`model`, `durationSeconds`, `hasAudio`).

**`subscriptions`** — Aktive Subscription. Tier: `free | starter | pro | max | business`. Feld `cancelAtPeriodEnd` markiert zum Periodenende gekündigte Subscriptions. Legacy-Felder `lemonSqueezySubscriptionId` und `lemonSqueezyCustomerId` existieren für Abwärtskompatibilität.

**`dailyUsage`** — Täglicher Zähler pro User für Abuse-Prevention. Key: `userId + date (ISO)`.

**`mediaItems`** — Persistierte Media-Library pro User. Felder: `ownerId`, `kind` (`image|video|asset`), `source` (`upload|ai-image|ai-video|freepik-asset|pexels-video`), `dedupeKey`, `title`, `filename`, `mimeType`, `storageId`, `previewStorageId`, `originalUrl`, `previewUrl`, `sourceUrl`, `providerAssetId`, `width`, `height`, `durationSeconds`, `metadata`, `firstSourceCanvasId`, `firstSourceNodeId`, `createdAt`, `updatedAt`, `lastUsedAt`. Index: `by_owner_updated`, `by_owner_kind_updated`, `by_owner_dedupe`.

**`webhookIdempotencyEvents`** — Idempotenz-Layer für Webhook-Events. Felder: `provider` (`polar`), `scope` (`topup_paid|subscription_activated_cycle|subscription_revoked`), `idempotencyKey`, `userId`, `polarOrderId?`, `polarSubscriptionId?`, `createdAt`. Index: `by_provider_key`, `by_user`.

**`userSettings`** — User-Einstellungen (z. B. Locale). Felder: `userId`, `locale?` (`de|en`), `createdAt`, `updatedAt`. Index: `by_user`.

---

## Agent-Orchestrierung (`agents.ts`)

`agents.ts` orchestriert den Lauf von Agent-Nodes in zwei Stufen:

1. Analyze: Brief + Kontext auswerten, Clarification-Fragen und Execution-Plan erzeugen.
2. Execute: Pro Plan-Step strukturierte Deliverables erzeugen und in `agent-output`-Nodes persistieren.

### Architekturgrenzen

- Scheduling, Status-Mutationen und Credit-Flow bleiben in `agents.ts`.
- Prompt-Aufbau liegt in `lib/agent-prompting.ts` (`summarizeIncomingContext`, `buildAnalyzeMessages`, `buildExecuteMessages`).
- Strukturvertraege und Normalisierung kommen aus `lib/agent-run-contract.ts`.
- Agent-Metadaten, Regeln und Blueprints kommen aus `lib/agent-definitions.ts`.
- Prompt-Segmente kommen aus `lib/generated/agent-doc-segments.ts` (generiert durch `scripts/compile-agent-docs.ts`).

Wichtig: `agents.ts` liest keine Raw-Markdown-Dateien zur Laufzeit.

### Strukturierte Output-Persistenz

Pro Step wird ein strukturierter Output gespeichert mit:

- `title`, `channel`, `artifactType`, `previewText`
- `sections[]` (`id`, `label`, `content`)
- `metadata` (`Record<string, string | string[]>`)
- `qualityChecks[]`
- `body` als Legacy-Fallback

---

## AI-Bild-Pipeline (`ai.ts`)

```
generateImage (action, public)
  → checkAbuseLimits (internalMutation)
  → reserve (mutation, wenn INTERNAL_CREDITS_ENABLED=true)
  → markNodeExecuting (internalMutation)
  → scheduler.runAfter(0, processImageGeneration)   ← Background-Job

processImageGeneration (internalAction)
  → generateAndStoreImage (internalAction)
      → generateImageWithAutoRetry (lokal, max 2 Retries)
          → generateImageViaOpenRouter
      → ctx.storage.store(blob)
  → finalizeImageSuccess (internalMutation)
      → commitInternal (credits)
  [Fehler] → releaseInternal (credits)
           → finalizeImageFailure (internalMutation)
  [finally] → decrementConcurrency
```

**Wichtig:** `generateImage` gibt `{ queued: true }` zurück, sobald der Background-Job geplant ist. Der Node wechselt sofort auf `status: "executing"`. Der eigentliche API-Call läuft asynchron.

**Retry-Logik:** Max. 2 Retries (`MAX_IMAGE_RETRIES = 2`). Backoff: `min(1500ms, 400ms * retryCount)`. Retryable: `provider` (5xx, 408, 429), `timeout`, `transient`. Nicht retryable: `credits`, `policy`, unbekannte 4xx.

**env-Flags:**
- `INTERNAL_CREDITS_ENABLED=true` — Aktiviert Reservation+Commit. Bei `false` wird nur Abuse-Prevention geprüft.
- `OPENROUTER_API_KEY` — Pflicht.

---

## KI-Video-Pipeline (`ai.ts`)

Analog zur Bild-Pipeline, aber mit Freepik als Provider und asynchronem Polling statt direktem API-Call.

```
generateVideo (action, public)
  → checkAbuseLimits (internalMutation)
  → reserve (mutation, provider: "freepik", videoMeta: {...})
  → markNodeExecuting (internalMutation)
  → scheduler.runAfter(0, processVideoGeneration)   ← Background-Job

processVideoGeneration (internalAction)
  → createVideoTask (freepik.ts)   ← POST an Freepik API
  → setVideoTaskInfo (internalMutation)   ← taskId am Node speichern
  → scheduler.runAfter(5s, pollVideoTask) ← Polling starten

pollVideoTask (internalAction, max 30 Versuche / 10 Min)
  → getVideoTaskStatus (freepik.ts)  ← GET an modellspezifischen Endpunkt
  [COMPLETED] → downloadVideoAsBlob → ctx.storage.store(blob)
              → finalizeVideoSuccess (internalMutation)
              → commitInternal (credits)
  [FAILED]   → releaseInternal (credits)
              → finalizeVideoFailure (internalMutation)
              → decrementConcurrency
  [CREATED|IN_PROGRESS] → scheduler.runAfter(delay, pollVideoTask, attempt+1)
  [retryable Fehler]    → markVideoPollingRetry → scheduler.runAfter(delay, pollVideoTask, attempt+1)
  [nicht-retryable]     → releaseInternal → finalizeVideoFailure → decrementConcurrency
  [Timeout/Max-Versuche] → releaseInternal → finalizeVideoFailure → decrementConcurrency
```

**Wichtig:** `generateVideo` gibt `{ queued: true, outputNodeId }` zurück. Der Node wechselt sofort auf `status: "executing"`. Freepik erstellt einen Async-Task, der via Polling überwacht wird.

**Polling-Strategie:** Exponential Backoff in 3 Stufen:
- Versuch 1–5: 5s Wartezeit
- Versuch 6–15: 10s Wartezeit
- Versuch 16–30: 20s Wartezeit
- Max. 30 Versuche oder 10 Minuten Gesamt-Timeout → `FAILED`

**Modellspezifische Endpunkte:** Jedes Video-Modell hat einen eigenen Status-Endpunkt (`statusEndpointPath` in `lib/ai-video-models.ts`). Freepik hat **keinen** generischen `/v1/ai/tasks/{taskId}`-Endpunkt — der richtige Pfad ist z. B. `/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}`.

**Freepik Response-Formate:** Endpunkte liefern unterschiedliche Formate:
- `task_id` kann auf Root-Ebene oder unter `data.task_id` stehen
- `generated`-Array kann Strings oder `{ url: string }`-Objekte enthalten
- Beide Formate werden in `freepik.ts` defensiv geparsed

**Error-Klassen:**
- `FreepikApiError` — Eigene Error-Klasse mit `source: "freepik"`, `status`, `code`, `retryable`
- HTTP 404 während Polling → `transient` / `retryable: true` (Freepik eventual consistency)
- HTTP 503 → `model_unavailable` / `retryable: true`
- HTTP 401 → `model_unavailable` / `retryable: false`

**Log-Volumen-Steuerung:** Poll-Logs werden über `lib/video-poll-logging.ts` (`shouldLogVideoPollAttempt`, `shouldLogVideoPollResult`) auf Versuch 1, jeden 5. Versuch und Terminalzustände reduziert.

**env-Flags:**
- `FREEPIK_API_KEY` — Freepik API-Key (Header: `x-freepik-api-key`)
- `INTERNAL_CREDITS_ENABLED=true` — Credit-Reservation aktiviert

**Video-Modell-Registry:** Siehe `lib/ai-video-models.ts` — 5 MVP-Modelle, Tier-basierte Freigabe, Credit-Kosten pro Clip-Länge (5s/10s).

---

## Credit-System (`credits.ts`)

### Tier-Konfiguration (`TIER_CONFIG`)

| Tier | Credits/Monat | Daily Cap | Concurrency | Premium-Modelle |
|------|--------------|-----------|-------------|-----------------|
| free | 50 | 10 | 1 | nein |
| starter | 400 | 50 | 2 | ja |
| pro | 3.300 | 200 | 2 | ja |
| max | 6.700 | 500 | 2 | ja |

**1 Credit = €0,01** (Euro-Cent-Einheit durchgängig in DB und UI).

### Reservation+Commit-Flow

1. `reserve()` — Prüft `available >= estimatedCost`, Daily Cap, Concurrency. Erhöht `reserved` + `dailyUsage`. Gibt `transactionId` zurück.
2. Job läuft...
3. `commitInternal()` — Zieht `actualCost` von `balance` ab, gibt `estimatedCost` aus `reserved` frei. Schreibt `type: "usage"`.
4. Bei Fehler: `releaseInternal()` — Gibt `estimatedCost` aus `reserved` frei. `generationCount` bleibt erhöht (Versuch zählt).

**env-Flag:** `ALLOW_TEST_CREDIT_GRANT=true` — Aktiviert `grantTestCredits` Mutation (nur Dev/Staging).

---

## Freepik Video-Client (`freepik.ts`)

`freepik.ts` enthält sowohl die bestehende Asset-Suche als auch den Video-Generierungs-Client.

### Video-Funktionen

- `createVideoTask({ endpoint, prompt, durationSeconds })` — POST an Freepik-Endpunkt, liefert `{ task_id }`
- `getVideoTaskStatus({ taskId, statusEndpointPath, attempt })` — GET an modellspezifischen Status-Endpunkt, liefert `{ status, generated?, error? }`
- `downloadVideoAsBlob(url)` — Lädt Video von Freepik CDN als Blob (zeitbegrenzte Signed URL!)
- `mapFreepikError(status, body)` — Mappt HTTP-Status auf strukturierte `FreepikMappedError`-Objekte
- `FreepikApiError` — Eigene Error-Klasse mit `source`, `status`, `code`, `retryable`, `body`

**Wichtig:** Freepik CDN-URLs sind zeitbegrenzt. `downloadVideoAsBlob` muss sofort nach `COMPLETED` aufgerufen werden. Das Video wird dauerhaft in Convex Storage gesichert.

---

## Auth (`helpers.ts`)

```typescript
requireAuth(ctx) // → { userId: string }
optionalAuth(ctx) // → { userId: string } | null
```

Wirft bei unauthentifiziertem Zugriff. Wird von allen Queries und Mutations genutzt, die User-Daten berühren.

### Better-Auth Setup (`auth.ts`)

- Auth-Library läuft in Convex (`createAuth`) und wird via `authComponent.registerRoutes(http, createAuth)` in `http.ts` registriert.
- Login-Modi:
  - `emailAndPassword` (mit `requireEmailVerification: true`)
  - `magicLink` Plugin (`better-auth/plugins`)
- Magic-Link-Konfiguration:
  - `disableSignUp: true` (Magic Link nur für bestehende Accounts)
  - `expiresIn: 600` (10 Minuten)
  - Versand über Resend (`sendMagicLink`)
- **Wichtig für Multi-Domain-Setup (`SITE_URL` + `APP_URL`)**:
  - Verify-Links aus Better Auth werden vor dem Versand auf die App-Origin umgeschrieben (`toAuthAppUrl(...)`), damit Session-Cookies auf der korrekten Origin gesetzt werden.
  - Ohne dieses Umschreiben kann Login per Magic Link zwar erfolgreich sein, aber das Dashboard in einem permanenten Loading-State hängen (fehlende Session auf App-Origin).

### Auth-Race-Härtung

- `canvases.get` nutzt optionalen Auth-Check und gibt bei fehlender Session `null` zurück (statt Throw), damit SSR/Client-Hydration bei kurzem Token-Race nicht in `404` kippt.
- `canvases.list` gibt bei fehlender Session eine leere Liste zurück (statt Throw), damit Dashboard-Subscriptions beim Logout keinen Error-Spam erzeugen.
- `credits.getBalance` gibt bei fehlender Session einen Default-Stand (`0`-Werte) zurück (statt Throw), damit UI-Widgets nicht mit `Unauthenticated` fehlschlagen.
- `credits.getSubscription` fällt bei fehlender Session auf Free/Active zurück (statt Throw), damit Tier-UI stabil bleibt.
- `credits.getRecentTransactions` gibt bei fehlender Session `[]` zurück (statt Throw), damit Aktivitätslisten beim Logout sauber leeren.
- `credits.getUsageStats` gibt bei fehlender Session `0`-Statistiken zurück (statt Throw), damit Verbrauchsanzeigen ohne Fehler ausrendern.
- `dashboard.getSnapshot` gibt bei fehlender Session einen vollständigen Default-Snapshot zurück (Balance 0, Free-Tier, leere Listen)

### Idempotente Canvas-Mutations

- `nodes.create`, `nodes.createWithEdgeSplit`, `nodes.createWithEdgeFromSource`, `nodes.createWithEdgeToTarget` sind über `clientRequestId` idempotent.
- `edges.create` ist über `clientRequestId` idempotent.
- `nodes.splitEdgeAtExistingNode` ist über `clientRequestId` idempotent (Replay wird als No-op behandelt).
- `nodes.batchRemove` ist idempotent tolerant: wenn alle angefragten Nodes bereits entfernt sind, wird die Mutation als No-op beendet.

---

## Nodes & Edges (`nodes.ts` / `edges.ts`)

### Nodes (`nodes.ts`)

**Validierung:**
- `getValidatedBatchNodesOrThrow()` — Validiert Batch von Nodes mit `validateBatchNodesForUserOrThrow()`
- Verwendet `canvas-connection-policy.ts` für Verbindungsberechtigungen

**Mutationen:**
- `create`, `update`, `delete` — Standard CRUD
- `createWithEdgeSplit`, `createWithEdgeFromSource`, `createWithEdgeToTarget` — Erstellen mit Edge-Verbindung
- `batchRemove`, `batchRemoveNodes` — Batch-Entfernung
- `splitEdgeAtExistingNode` — Split einer Edge am existierenden Node

**Optimistische IDs:**
- Nodes erhalten temporäre IDs mit `optimistic_`-Prefix für optimistic updates

**Bridge-Edges:**
- Bei Node-Löschung werden `computeBridgeCreatesForDeletedNodes` in `canvas-utils.ts` verwendet, um Kanten neu zu verbinden

### Edges (`edges.ts`)

**Validierung:**
- `assertConnectionPolicy()` — Prüft, ob Source-Node Output erlaubt und Target-Node Input erlaubt
- `assertTargetAllowsIncomingEdge()` — Performance-optimierte Prüfung auf eingehende Edges
- `getCanvasConnectionValidationMessage()` — Fehlermeldung bei ungültigen Verbindungen

**Validierungsregeln (aus `canvas-connection-policy.ts`):**
- Source-Typ muss Output-Ports haben, Target-Typ muss Input-Ports haben
- Keine self-loops (Edge von Node zu sich selbst)
- Quelle: `image`, `text`, `note`, `group`, `compare`, `frame` → Source-Ports
- Ziel: `ai-image`, `ai-video`, `compare` → Target-Ports
- `video-prompt` → `ai-video` ✅ (einzige gültige Kombination für Video-Flow)
- `ai-video` als Source für andere Nodes → ❌ (nur Compare)
- `mixer` akzeptiert nur `image|asset|ai-image|render` als Source-Typ
- `mixer` akzeptiert nur Target-Handles `base` und `overlay`
- `mixer` erlaubt max. eine eingehende Kante pro Handle und max. zwei insgesamt
- Curves- und Adjustment-Node-Presets: Nur Presets nutzen, keine direkten Edges

### Mixer V1: Backend-Scope

- `mixer` ist ein Control-Node mit pseudo-image Semantik, nicht mit persistiertem Medien-Output.
- Keine zusaetzlichen Convex-Tabellen oder Storage-Flows fuer Mixer-Vorschauen.
- Validierung laeuft client- und serverseitig ueber dieselbe Policy (`validateCanvasConnectionPolicy`); `edges.ts` delegiert darauf fuer Paritaet.
- Offizieller Bake-Pfad fuer Mixer ist `mixer -> render` (Render verarbeitet die Mixer-Komposition in Preview/Render-Pipeline).
- `mixer -> adjustments -> render` ist derzeit bewusst deferred und nicht Teil des offiziell supporteten Flows.

---

## Storage (`storage.ts`)

- `generateUploadUrl` bleibt eine normale Mutation für Upload-Start im Client.
- `batchGetUrlsForCanvas` ist absichtlich **keine reaktive Query** mehr, sondern eine Mutation. Der Canvas ruft sie gezielt an, wenn sich das aktuelle Set von `storageId`s geändert hat.
- Eingabe: `canvasId` + client-seitig ermittelte `storageIds`.
- Server-seitig werden die angefragten IDs gegen die aktuellen Nodes des Canvas verifiziert, bevor `ctx.storage.getUrl(...)` aufgerufen wird.
- Ziel der Änderung: weniger Query-Fanout und weniger Canvas-weite Requery-Last bei jedem Node-/Edge-Update.

---

## Dashboard Snapshot (`dashboard.ts`)

Gebündelte Query, die alle Dashboard-relevanten Daten in einem einzigen Convex-Call lädt. Ersetzt separate Queries für Balance, Subscription, UsageStats, Transactions und Canvases.

**`getSnapshot` (query, public):**
- Nutzt `optionalAuth` — gibt bei fehlender Session Default-Werte zurück (kein Throw)
- Lädt parallel: `creditBalances`, `subscriptions`, `creditTransactions` (usage-type), `creditTransactions` (recent, max 80), `canvases`
- Berechnet `monthlyUsage` und `totalGenerations` aus usage-Transactions des aktuellen Monats
- Nutzt `prioritizeRecentCreditTransactions` aus `lib/credits-activity.ts` für sortierte Transaktionsliste
- Gibt strukturiertes Snapshot-Objekt zurück: `{ balance, subscription, usageStats, recentTransactions, canvases, generatedAt }`

---

## Canvas Graph Query (`canvasGraph.ts`)

Performance-optimierte Query, die Nodes und Edges für einen Canvas in einem einzigen Call lädt. Wird vom Frontend über den Canvas Graph Query Cache verwendet.

**`loadCanvasGraph(ctx, { canvasId, userId })` (internal):**
- Prüft Canvas-Existenz und Ownership
- Lädt Nodes und Edges parallel via `Promise.all`
- Performance-Logging bei Queries > 250ms

**`get` (query, public):**
- Nutzt `requireAuth`
- Delegiert an `loadCanvasGraph`
- Loggt bei langsamer Ausführung (`PERFORMANCE_LOG_THRESHOLD_MS = 250`)

**Frontend-Integration:** Der Canvas nutzt diese Query über `canvas-graph-query-cache.ts` (Optimistic Store Helper).

---

## Konventionen

- `internalMutation` / `internalAction` — Nur von anderen Convex-Funktionen aufrufbar, nicht direkt vom Client.
- `mutation` / `query` / `action` — Öffentlich, direkt vom Frontend nutzbar.
- Alle User-Daten sind über `userId` (Better Auth User ID, kein Convex-eigenes User-Dokument) indiziert.
- Schema-Migrationen: `npx convex dev` erkennt Breaking Changes automatisch. Bei `v.any()`-Feldern gibt es keine automatische Migration — Datensätze müssen manuell/scriptmäßig migriert werden.
