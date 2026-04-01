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

## Layout-Seite

`app/dashboard/page.tsx` — Server Component, rendert Dashboard-Layout mit den Komponenten oben.

---

## Konventionen

- Kein lokaler State für Server-Daten — alles via Convex-Subscriptions (reaktiv)
- `useAuthQuery` statt `useQuery` verwenden, um Auth-Races zu vermeiden (skippt Query bis Token bereit ist)
- Canvas-Thumbnails sind optional (`thumbnail?: Id<"_storage">`) — Fallback-State immer behandeln
