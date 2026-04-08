# components/dashboard/ — Dashboard

UI-Komponenten für die Startseite nach dem Login.

---

## Dateien

| Datei | Zweck |
|-------|-------|
| `canvas-card.tsx` | Karte für einen Canvas in der Übersicht (Navigation, Umbenennen, Löschen mit Confirm-Dialog) |
| `credit-overview.tsx` | Monatsverbrauch und verfügbare Credits als Balken-Visualisierung |
| `credits-activity-chart.tsx` | Credits-Aktivitäts-Chart (Recharts AreaChart) mit Verbrauch, Aktivität und verfügbaren Credits |
| `recent-transactions.tsx` | Liste der letzten Credit-Transaktionen |

---

## Layout-Seite

`app/dashboard/page-client.tsx` — Client Component, rendert Dashboard mit gebündelter Snapshot-Query.

**Layout-Struktur:**
```
Dashboard
├── Header (Logo, Suche, User-Menü mit Theme-Wechsel)
├── Begrüßung (Name, Untertitel)
├── Credit-Übersicht (Balance, Usage Bars)
├── Arbeitsbereiche (Canvas Grid)
├── Credits Verlauf + Transaktionen (zwei-spaltig)
│   ├── CreditsActivityChart (Recharts AreaChart)
│   └── Recent Transactions (List)
```

---

## Dashboard Snapshot Architecture

**Früher:** Separate Convex-Queries für Balance, Subscription, UsageStats, Transactions, Canvases → 5+ gleichzeitige Queries.

**Jetzt:** Gebündelte Snapshot-Query (`api.dashboard.getSnapshot`) + localStorage-Cache.

### Datenfluss

```
page-client.tsx
  └── useDashboardSnapshot(userId)
        ├── Convex Query: api.dashboard.getSnapshot (gebündelt)
        │     → Balance + Subscription + UsageStats + Transactions + Canvases
        ├── localStorage Cache: readDashboardSnapshotCache (12h TTL)
        │     → Sofortige Anzeige aus Cache während Query lädt
        └── Automatisches Cache-Write bei neuen Query-Daten
```

### Snapshot Cache (`lib/dashboard-snapshot-cache.ts`)

- **Key:** `lemonspace.dashboard:snapshot:v1:<userId>`
- **TTL:** 12 Stunden (DEFAULT_TTL_MS)
- **Version:** `CACHE_VERSION = 1` — Version-Bumps invalidieren automatisch
- **Cache-Invalidierung:** Bei Logout wird der Cache des vorherigen Users gelöscht (via `sessionStorage("ls-last-dashboard-user")`)
- Defensiv: Alle Storage-Zugriffe sind try-catch-gewrappt (Quota-Fehler, Disabled Storage etc.)

### Snapshot Query (`convex/dashboard.ts`)

- `getSnapshot` — Gebündelte Query, lädt alle Dashboard-Daten in einem Convex-Call
- Nutzt `optionalAuth` → Default-Werte bei fehlender Session (kein Error)
- Transaktions-Priorisierung via `prioritizeRecentCreditTransactions` (Usage > Reservation > Refund > Topup > Subscription)

---

## Datenquellen

| Komponente | Datenquelle |
|-----------|-------------|
| `credit-overview.tsx` | `dashboardSnapshot.balance`, `dashboardSnapshot.subscription`, `dashboardSnapshot.usageStats` |
| `credits-activity-chart.tsx` | `dashboardSnapshot.balance`, `dashboardSnapshot.recentTransactions` |
| `recent-transactions.tsx` | `dashboardSnapshot.recentTransactions` |
| `canvas-card.tsx` | `dashboardSnapshot.canvases` |

> Alle Daten kommen aus dem gebündelten Snapshot (`useDashboardSnapshot`). Keine separaten Queries mehr.

## Mutations

| Komponente | Mutation |
|-----------|----------|
| `canvas-card.tsx` | `api.canvases.update`, `api.canvases.remove` |
| `page-client.tsx` | `api.canvases.create` |

---

## Credits Activity Chart

Recharts-basiertes AreaChart (via ShadCN `ChartContainer`) mit drei Datenseries:

- **Usage** (gefüllt): Tatsächlicher Credit-Verbrauch pro Tag (committed usage-Transactions)
- **Activity** (gefüllt): Usage + aktive Reservationen pro Tag
- **Available** (Linie): Aktueller verfügbarer Credit-Stand als Referenzlinie

**Daten-Processing:** `lib/credits-activity.ts`
- `buildCreditsActivitySeries()` — Gruppiert Transactions nach Tag, aggregiert Usage/Activity
- `calculateUsageActivityDomain()` — Berechnet Y-Achsen-Domain mit Headroom
- `prioritizeRecentCreditTransactions()` — Sortiert Transactions nach Typ-Priorität

**Chart Config:** Teal für Usage, Accent-Foreground für Activity, Muted-Foreground für Available.

---

## Konventionen

- Kein lokaler State für Server-Daten — Snapshot kommt aus `useDashboardSnapshot`
- Dashboard zeigt sofort Cache-Daten an, während Live-Query lädt (`source: "cache" | "live" | "none"`)
- Canvas-Thumbnails sind optional (`thumbnail?: Id<"_storage">`) — Fallback-State immer behandeln
- Responsive Grid-Layout für Canvas-Cards (`grid-cols-1 sm:grid-cols-3`)
- Leere Zustände (keine Canvases, keine Transaktionen, keine Chart-Daten) mit nutzerfreundlichen Platzhaltern zeigen
- Chart-Komponente nutzt ShadCN `ChartContainer` (`components/ui/chart.tsx`) + Recharts 3.8

---

## Error Handling

- **Auth-Race:** `useDashboardSnapshot` nutzt `useAuthQuery` intern → skippt bis Auth bereit
- **Empty States:** Wenn keine Canvases/Transaktionen vorhanden sind, informative Platzhalter zeigen
- **Cache-Fehler:** localStorage-Zugriffe sind defensiv gewrappt (quota, disabled storage)
- **Offline:** Snapshot-Cache bietet Fallback bei fehlender Verbindung

---

## Performance

- Gebündelte Snapshot-Query statt 5+ separater Queries → weniger WebSocket-Last
- localStorage-Cache mit 12h TTL → sofortige Anzeige bei wiederholtem Besuch
- Canvas-Thumbnails werden über den Snapshot geladen (nur wenn vorhanden)
- Transaktions-Liste ist auf 20 Einträge limitiert (priorisiert nach Typ)
