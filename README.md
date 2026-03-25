# 🍋 LemonSpace

**Self-Hosted, Source-Available Creative Workspace**

LemonSpace ist eine visuelle Arbeitsfläche, auf der kreative Teams aus wenigen Input-Assets schnell kampagnenfähige Bildvarianten erzeugen — mit KI-gestützter Generierung, durchdachter Latenz-UX und voller Kontrolle über ihre Daten.

## Vision

Vom Rohbild zur fertigen Kampagnenvariante in Minuten statt Stunden — auf eigener Infrastruktur oder als gehosteter Service.

## Features

### Infinite Canvas
- Zoom, Pan und Navigation auf einem unbegrenzten Canvas
- Node-basiertes Workflow-System
- Drag & Drop von Assets und KI-Outputs
- Gruppierung und Layering von Elementen

### Node-System

| Kategorie | Nodes |
|-----------|-------|
| **Quelle** | Bild, Text, Prompt |
| **KI-Ausgabe** | KI-Bild |
| **Layout** | Gruppe, Frame, Notiz, Compare |

### KI-Integration
- OpenRouter als primäre AI-Schicht
- 9 Image-Modelle (Gemini, FLUX, GPT-5, etc.)
- Self-hosted KI-Services (rembg, Real-ESRGAN, GFPGAN)

### UX-Prinzipien
- Node-Status-Modell: `idle → executing → done | error`
- Skeleton-Nodes für Agent-Workflows
- Browser Notifications (opt-in)

## Tech Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | Next.js 16 + Tailwind v4 + ShadCN/UI |
| Canvas | @xyflow/react + dnd-kit |
| Backend | Convex (Self-hosted) |
| Auth | Better Auth |
| AI | OpenRouter |
| Payment | Lemon Squeezy |
| Cache | Redis |
| Analytics | Rybbit |
| Email | Unsend + Stalwart |

## Getting Started

### Voraussetzungen

- Node.js 20+
- pnpm
- Docker (für Self-Hosted)
- Convex Backend

### Installation

```bash
# Repository klonen
git clone https://github.com/lemonspace/lemonspace-web.git
cd lemonspace-web

# Dependencies installieren
pnpm install

# Environment-Variables kopieren
cp .env.example .env.local

# Entwicklungsserver starten
pnpm dev
```

### Environment Variables

```env
# Convex
CONVEX_DEPLOYMENT=your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-convex-instance.convex.cloud

# Better Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000

# OpenRouter
OPENROUTER_API_KEY=your-openrouter-key

# Lemon Squeezy
LEMONSQUEEZY_API_KEY=your-key
LEMONSQUEEZY_WEBHOOK_SECRET=your-webhook-secret

# Redis
REDIS_URL=redis://localhost:6379
```

## Self-Hosting

Self-Hosting richtet sich an technisch versierte Nutzer. Für alle anderen empfehlen wir die gehostete Version unter [lemonspace.app](https://lemonspace.app).

```bash
# Docker Compose
docker-compose up -d
```

Das Self-Hosting-Paket umfasst:
- `docker-compose.yml` — Alle Services
- `.env.example` — Umgebungsvariablen
- Setup-README — Schritt-für-Schritt-Anleitung

## Pricing

| Tier | Preis/Monat | Credits | Zielgruppe |
|------|-------------|---------|------------|
| Free | €0 | €0,50 | Testen & Evaluieren |
| Starter | €9 | €6,30 | Einzelnutzer |
| Pro | €49 | €36,02 | Aktive Creator |
| Business | €99 | €76,23 | Teams |

## Projektstruktur

```
lemonspace-web/
├── app/                    # Next.js App Router
├── components/             # React-Komponenten
│   ├── ui/                # ShadCN/UI Komponenten
│   ├── canvas/            # Canvas-Komponenten
│   └── nodes/             # Node-Komponenten
├── convex/                 # Convex Schema & Functions
├── lib/                    # Utility-Funktionen
├── hooks/                  # React Hooks
└── types/                  # TypeScript-Typen
```

## Roadmap

### Phase 1 — Foundation (MVP)
- [x] Projektsetup
- [ ] Canvas mit @xyflow/react
- [ ] Bild-Upload & KI-Generierung
- [ ] Credit-System
- [ ] Lemon Squeezy Integration

### Phase 2 — KI-Features
- [ ] Alle 9 Image-Modelle
- [ ] Agent Nodes
- [ ] Transformation Nodes (BG entfernen, Upscale)
- [ ] Compare-Node

### Phase 3 — Kollaboration
- [ ] Echtzeit-Kollaboration
- [ ] Kommentar-System
- [ ] Versions-History
- [ ] Export-Funktionen

## Lizenz

LemonSpace ist **Source Available**, nicht Open Source.

| Nutzung | Lizenz | Kosten |
|---------|--------|--------|
| Privat / Persönlich | BSL 1.1 | Kostenlos |
| Kommerziell Self-Host | Separate Lizenz | TBD |
| Gehostete Version | Abo | €9–99/Monat |

**BSL 1.1 mit 3-Jahres-Change-Date zu Apache 2.0**

Siehe [LICENSE.md](./LICENSE.md) für Details.

## Mitwirken

Beiträge sind willkommen! Bitte öffnen Sie einen Pull Request oder ein Issue.

### Entwicklungs-Richtlinien
- Conventional Commits
- TypeScript strict mode
- Tests für neue Features

## Support

- **Dokumentation:** [docs.lemonspace.io](https://docs.lemonspace.io)
- **Issues:** [GitHub Issues](https://github.com/lemonspace/lemonspace-web/issues)
- **Email:** support@lemonspace.io

## Kontakt

- **Website:** [lemonspace.io](https://lemonspace.io)
- **App:** [app.lemonspace.io](https://app.lemonspace.io)
- **Email:** hello@lemonspace.io
- **Lizenzanfragen:** licensing@lemonspace.io

---

*LemonSpace — From raw image to campaign-ready in minutes, not hours.*
