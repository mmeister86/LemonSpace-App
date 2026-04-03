# convex/ — Backend-Schicht

Convex ist das vollständige Backend von LemonSpace: Datenbank, Realtime-Subscriptions, File Storage und Background-Job-Scheduler in einem. Kein separates API-Layer notwendig.

---

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `schema.ts` | Einzige Wahrheitsquelle für alle Tabellen und Typen |
| `ai.ts` | KI-Bildgenerierungs-Pipeline |
| `credits.ts` | Credit-System: Balance, Reservation+Commit, Tier-Config |
| `nodes.ts` | CRUD für Canvas-Nodes |
| `edges.ts` | CRUD für Canvas-Edges |
| `canvases.ts` | CRUD für Canvases |
| `openrouter.ts` | OpenRouter-HTTP-Client + Modell-Config (Backend) |
| `auth.ts` | Better Auth Integration |
| `helpers.ts` | `requireAuth()` + `optionalAuth()` für Auth-Checks |
| `polar.ts` | Polar.sh Webhook-Handler (Subscriptions) |
| `pexels.ts` | Pexels Stock-Bilder API |
| `freepik.ts` | Freepik Asset-Browser API |
| `storage.ts` | Convex File Storage Helpers + gebündelte Canvas-URL-Auflösung |
| `export.ts` | Canvas-Export-Logik |
| `http.ts` | HTTP-Endpunkte (Webhooks) |

---

## Schema (`schema.ts`)

Alle Node-Typen sind in zwei Validators definiert: `phase1NodeTypes` (aktiv) und `nodeType` (alle Phasen). Phase-2/3-Typen werden im Schema vordeklariert, um spätere Schema-Migrationen zu vermeiden — die UI filtert nach Phase.

### Tabellen

**`canvases`** — Canvas pro User. Index: `by_owner`, `by_owner_updated`.

**`nodes`** — Alle Nodes eines Canvas. Felder: `type`, `positionX/Y`, `width`, `height`, `status` (`idle|analyzing|clarifying|executing|done|error`), `statusMessage`, `retryCount`, `data` (v.any()), `parentId`, `zIndex`. Index: `by_canvas`, `by_canvas_type`, `by_parent`.

> `data` ist `v.any()` — Typ-Safety läuft über den `type`-Discriminator + Zod im Frontend. Die Node-Data-Shapes sind in `schema.ts` dokumentiert (`imageNodeData`, `promptNodeData`, etc.).

**`edges`** — Verbindungen zwischen Nodes. Index: `by_canvas`, `by_source`, `by_target`.

**`mutationRequests`** — Idempotenz-Layer für Client-Replay (`clientRequestId`) bei offline/Retry-Sync. Felder: `userId`, `mutation`, `clientRequestId`, optionale Ziel-IDs (`canvasId`, `nodeId`, `edgeId`). Index: `by_user_mutation_request`.

**`creditBalances`** — Pro User: `balance`, `reserved`, `monthlyAllocation`. `available = balance - reserved` (computed, nicht gespeichert).

**`creditTransactions`** — Jede Credit-Bewegung. Types: `subscription | topup | usage | reservation | refund`. Status: `committed | reserved | released | failed`.

**`subscriptions`** — Aktive Subscription. Tier: `free | starter | pro | max | business`.

**`dailyUsage`** — Täglicher Zähler pro User für Abuse-Prevention. Key: `userId + date (ISO)`.

---

## AI-Pipeline (`ai.ts`)

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

### Idempotente Canvas-Mutations

- `nodes.create`, `nodes.createWithEdgeSplit`, `nodes.createWithEdgeFromSource`, `nodes.createWithEdgeToTarget` sind über `clientRequestId` idempotent.
- `edges.create` ist über `clientRequestId` idempotent.
- `nodes.splitEdgeAtExistingNode` ist über `clientRequestId` idempotent (Replay wird als No-op behandelt).
- `nodes.batchRemove` ist idempotent tolerant: wenn alle angefragten Nodes bereits entfernt sind, wird die Mutation als No-op beendet.

---

## Storage (`storage.ts`)

- `generateUploadUrl` bleibt eine normale Mutation für Upload-Start im Client.
- `batchGetUrlsForCanvas` ist absichtlich **keine reaktive Query** mehr, sondern eine Mutation. Der Canvas ruft sie gezielt an, wenn sich das aktuelle Set von `storageId`s geändert hat.
- Eingabe: `canvasId` + client-seitig ermittelte `storageIds`.
- Server-seitig werden die angefragten IDs gegen die aktuellen Nodes des Canvas verifiziert, bevor `ctx.storage.getUrl(...)` aufgerufen wird.
- Ziel der Änderung: weniger Query-Fanout und weniger Canvas-weite Requery-Last bei jedem Node-/Edge-Update.

---

## Konventionen

- `internalMutation` / `internalAction` — Nur von anderen Convex-Funktionen aufrufbar, nicht direkt vom Client.
- `mutation` / `query` / `action` — Öffentlich, direkt vom Frontend nutzbar.
- Alle User-Daten sind über `userId` (Better Auth User ID, kein Convex-eigenes User-Dokument) indiziert.
- Schema-Migrationen: `npx convex dev` erkennt Breaking Changes automatisch. Bei `v.any()`-Feldern gibt es keine automatische Migration — Datensätze müssen manuell/scriptmäßig migriert werden.
