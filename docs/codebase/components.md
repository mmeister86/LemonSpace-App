# Components außerhalb der Canvas-Engine

Diese Seite dokumentiert `components/` außerhalb von `components/canvas/`. Die Canvas-Engine steht separat in [`canvas.md`](canvas.md).

## Auth Components

| Datei | Verantwortung |
|-------|---------------|
| `components/auth/auth-page.tsx` | Auth-Seitenlayout für Sign-in/-up: Branding, Container, visuelle Struktur. |
| `components/auth/auth-page-content.ts` | Pure Content-/Copy-Konfiguration für Auth-Seiten; testbar ohne React. |

## Dashboard Components

**Arbeitskontext:** [`components/dashboard/CLAUDE.md`](../../components/dashboard/CLAUDE.md). Das lokale Dokument nennt nicht alle neueren Section-/Media-Preview-Dateien.

| Datei | Verantwortung |
|-------|---------------|
| `components/dashboard/dashboard-page-sections.tsx` | Zusammengesetzte Dashboard-Sektionen: Header, Credits, Workspaces, Activity, Media Preview. |
| `components/dashboard/canvas-card.tsx` | Canvas Card mit Navigation, Rename und Delete Confirm. |
| `components/dashboard/credit-overview.tsx` | Balance-/Monthly-Usage-Übersicht. |
| `components/dashboard/credits-activity-chart.tsx` | Recharts Area Chart via ShadCN Chart Container. |
| `components/dashboard/recent-transactions.tsx` | Liste aktueller Credit-Transaktionen. |

## Billing Components

**Arbeitskontext:** [`components/billing/CLAUDE.md`](../../components/billing/CLAUDE.md). Die aktuelle Implementierung nutzt Polar; ältere Lemon-Squeezy-Bezüge sind Legacy-Kontext.

| Datei | Verantwortung |
|-------|---------------|
| `components/billing/pricing-cards.tsx` | Tier Cards, Current-Plan Highlight und Checkout über `authClient.checkout`. |
| `components/billing/manage-subscription.tsx` | Aktueller Tier-/Statusblock und Polar Customer Portal Link. |
| `components/billing/topup-panel.tsx` | Feste Top-up Pakete aus `TOPUP_PRODUCTS` mit Polar Checkout. |

## Media Components

| Datei | Verantwortung |
|-------|---------------|
| `components/media/media-library-dialog.tsx` | Dialog für Media Library und Auswahl/Einfügen vorhandener Medien. |
| `components/media/media-preview-utils.ts` | Pure Preview-Helfer für Media Items. |

## Agent Components und Agent Specs

**Arbeitskontext:** [`components/agents/CLAUDE.md`](../../components/agents/CLAUDE.md).

| Datei | Verantwortung |
|-------|---------------|
| `components/agents/campaign-distributor.md` | Markdown-Quelle für Campaign Distributor Agent-Dokumentation und markierte Prompt-Segmente. |
| `components/agents/growth-hacker.md` | Markdown-Quelle für Growth Hacker Agent-Dokumentation und markierte Prompt-Segmente. |
| `components/agents/instagram/ui/instagram-post.tsx` | Instagram Post Preview UI für Agent-/Output-Darstellungen. |

Wichtig: Nur markierte `AGENT_PROMPT_SEGMENT`-Blöcke werden über `scripts/compile-agent-docs.ts` in `lib/generated/agent-doc-segments.ts` kompiliert. Runtime liest die generierte TS-Datei, nicht Raw Markdown.

## UI Primitives (`components/ui/`)

**Arbeitskontext:** [`components/ui/CLAUDE.md`](../../components/ui/CLAUDE.md).

Die meisten Dateien sind ShadCN-/Radix-style Copy-Paste-Primitives. Sie sind nicht build-generiert, werden aber wie lokal angepasste Design-System-Bausteine behandelt.

| Datei | Verantwortung |
|-------|---------------|
| `components/ui/avatar.tsx` | Avatar Primitive. |
| `components/ui/badge.tsx` | Badge Primitive. |
| `components/ui/button.tsx` | Button Primitive und Varianten. |
| `components/ui/card.tsx` | Card Primitive. |
| `components/ui/chart.tsx` | Recharts/ShadCN Chart Wrapper. |
| `components/ui/command.tsx` | Command Palette Primitive. |
| `components/ui/dialog.tsx` | Dialog Primitive. |
| `components/ui/drawer.tsx` | Drawer Primitive. |
| `components/ui/dropdown-menu.tsx` | Dropdown Menu Primitive. |
| `components/ui/input.tsx` | Input Primitive. |
| `components/ui/input-group.tsx` | Input Group Primitive. |
| `components/ui/label.tsx` | Label Primitive. |
| `components/ui/menubar.tsx` | Menubar Primitive. |
| `components/ui/progress.tsx` | Progress Primitive. |
| `components/ui/resizable.tsx` | Resizable Panels Primitive; wichtig für Canvas Shell. |
| `components/ui/scroll-area.tsx` | Scroll Area Primitive. |
| `components/ui/select.tsx` | Select Primitive. |
| `components/ui/separator.tsx` | Separator Primitive. |
| `components/ui/slider.tsx` | Slider Primitive. |
| `components/ui/table.tsx` | Table Primitive. |
| `components/ui/tabs.tsx` | Tabs Primitive. |
| `components/ui/textarea.tsx` | Textarea Primitive. |
| `components/ui/convex-prover.tsx` | Projekt-spezifischer Convex/Better-Auth Provider Wrapper; Dateiname wirkt wie ein Tippfehler, Export ist `ConvexClientProvider`. |
| `components/ui/progressive-blur.tsx` | Projekt-spezifische layered CSS Backdrop-Blur-Komponente. |

## Wartungshinweise

- ShadCN-Primitives sind lokal kopiert; Änderungen sollten Design Tokens aus `app/globals.css` respektieren.
- Dashboard Child Components sollen möglichst keine separaten Serverdaten-Queries starten; `app/dashboard/page-client.tsx` und `useDashboardSnapshot` bündeln Daten.
- Billing-Komponenten sind Polar-zentriert; Legacy-Lemon-Squeezy-Felder existieren primär für Rückwärtskompatibilität im Backend-Schema.
