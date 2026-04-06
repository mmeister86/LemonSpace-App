# components/dashboard/ — Dashboard

UI-Komponenten für die Startseite nach dem Login.

---

## Dateien

| Datei | Zweck |
|-------|-------|
| `canvas-card.tsx` | Karte für einen Canvas in der Übersicht (Navigation, Umbenennen, Löschen mit Confirm-Dialog) |
| `credit-overview.tsx` | Monatsverbrauch und verfügbare Credits als Balken-Visualisierung |
| `recent-transactions.tsx` | Liste der letzten Credit-Transaktionen |

---

## Layout-Seite

`app/dashboard/page.tsx` — Server Component, rendert Dashboard-Layout mit den Komponenten oben.

**Layout-Struktur:**
```
Dashboard
├── Header (User-Avatar, Name)
├── Quick Actions (Create Canvas, Search)
├── Credit Overview (Balance, Usage Bars)
├── Recent Transactions (List)
└── Canvas Grid (Canvas Cards)
```

---

## Datenquellen

Alle Daten kommen aus Convex-Queries via `useAuthQuery` (aus `hooks/use-auth-query.ts`):

| Komponente | Query |
|-----------|-------|
| `canvas-card.tsx` | `api.canvases.list` |
| `credit-overview.tsx` | `api.credits.getBalance`, `api.credits.getUsageStats` |
| `recent-transactions.tsx` | `api.credits.getRecentTransactions` |

## Mutations

| Komponente | Mutation |
|-----------|----------|
| `canvas-card.tsx` | `api.canvases.update`, `api.canvases.remove` |

---

## Konventionen

- Kein lokaler State für Server-Daten — alles via Convex-Subscriptions (reaktiv)
- `useAuthQuery` statt `useQuery` verwenden, um Auth-Races zu vermeiden (skippt Query bis Token bereit ist)
- Canvas-Thumbnails sind optional (`thumbnail?: Id<"_storage">`) — Fallback-State immer behandeln
- Responsive Grid-Layout für Canvas-Cards (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Leere Zustände (keine Canvases, keine Transaktionen) mit nutzerfreundlichen Platzhaltern zeigen

---

## Features

### Canvas Cards

Jede Karte zeigt:
- Canvas-Thumbnail (wenn verfügbar)
- Canvas-Name (truncate)
- Letzte Änderungszeit (relative Formatierung)
- Klick → Öffnen im Canvas-Editor
- Menü → Umbenennen, Löschen

### Credit Overview

Zeigt:
- Aktueller Credit-Balance (z.B. "350 Credits")
- Verbrauchs-Balken (Progress Bar) für aktuellen Monat
- Monats-Details (vom `api.credits.getUsageStats`)
- Link zum Upgrade im Abo-Settings

### Recent Transactions

Liste der letzten Credit-Transaktionen mit:
- Transaktions-Typ (Subscription, Top-Up, Usage)
- Betrag (+/-)
- Beschreibung
- Datum (relative Formatierung)

---

## Error Handling

- **Auth-Race**: `useAuthQuery` verhindert Fehler beim Initialisierungs-Flash
- **Empty States**: Wenn keine Canvases/Transaktionen vorhanden sind, informative Platzhalter zeigen
- **Offline**: Connection-Banner anzeigen, wenn Convex nicht erreichbar

---

## Performance

- Canvas-Thumbnails werden über `api.canvases.list` geladen (nur wenn vorhanden)
- Transaktions-Listen sind paginiert oder limitiert (z.B. letzte 20 Transaktionen)
- Kein lokaler State für Canvas-Daten — alles über real-time Convex-Subscriptions
