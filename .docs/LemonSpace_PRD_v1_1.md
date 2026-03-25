# 🍋 LemonSpace
## Product Requirements Document
*Self-Hosted, Source-Available Alternative to Freepik Spaces*

| Version | Status | Datum | Projekt |
|---------|--------|-------|---------|
| v1.1 | Draft | März 2026 | lemonspace.app |

---

## Changelog

| Version | Änderung |
|---------|----------|
| v0.2 | KI-Integrationsstrategie: OpenRouter als primäre AI-Layer, Freepik API auf Stock-Assets reduziert |
| v0.3 | Agent Layer eingeführt: Agent Nodes als Canvas-native Smart Batch Processor |
| v0.4 | Vollständige Node-Taxonomie: fünf Kategorien, Semantik je Node-Typ |
| v0.5 | Auth: Better Auth. Pricing: 4-Tier-Abo, Credit-System 30% Marge. Tailwind v4 bestätigt |
| v0.6 | Lizenz: BSL 1.1 mit 3-Jahres-Change-Date zu Apache 2.0 |
| v0.7 | Tech Stack: Redis, Zod, Unsend + Stalwart, Rybbit, Sentry, Cloudflare |
| v0.8 | Text-Overlay Node eingeführt (Kategorie 5: Canvas & Layout) |
| v0.9 | Zwei-Repo-Strategie (Web-App + Landing Page), Auth-Cookie-Sharing |
| v1.0 | Self-Hosting-Strategie, Credit Reservation+Commit, UX-Latenzen/Skeleton-Nodes, Convex Lock-in dokumentiert |
| v1.1 | Monorepo verworfen → Zwei unabhängige Repos (lemonspace-web + lemonspace-landing), Auth-Cookie-Sharing via .lemonspace.io |

---

## 1. Vision & Zielsetzung

LemonSpace ist eine self-hosted, source-available Alternative zu Freepik Spaces — ein kollaboratives, KI-gestütztes Creative-Workflow-Tool mit einer Infinite-Canvas-Oberfläche. Ziel ist ein freier und erweiterbarer Workspace für kreative Teams, der auf eigener Infrastruktur betrieben werden kann.

---

## 2. Problemstellung

Freepik Spaces ist ein leistungsstarkes Tool für KI-gestützte kreative Workflows, aber:

- Proprietäres SaaS-Produkt ohne Self-Hosting-Option
- Nutzer abhängig von Freepiks Pricing und Verfügbarkeit
- Keine Anpassbarkeit oder Erweiterbarkeit
- Datenschutzbedenken bei der Speicherung kreativer Assets auf externen Servern

---

## 3. Zielgruppe

| Segment | Primärer Zugang | Beschreibung |
|---------|-----------------|--------------|
| Designer & kreative Teams | Gehostete Version (lemonspace.app) | Datensouveränität ohne technischen Aufwand — zahlende Kernkunden |
| Entwickler & Tech-Teams | Self-Hosted | Anpassbare KI-Canvas-Plattform auf eigener Infra |
| Compliance-sensible Unternehmen | Self-Hosted | Regulatorische Anforderungen, die Cloud-SaaS einschränken |
| Open-Source-Community | Self-Hosted / Contributing | Creative-Tools-Ökosystem, BSL-Lizenz bis Change Date |

---

## 4. Core Features

### 4.1 Infinite Canvas

- Zoom, Pan und Navigation auf einem unbegrenzten Canvas
- Nodes als wiederverwendbare kreative Bausteine
- Drag & Drop von Assets, KI-Outputs und Mediendateien
- Gruppierung und Layering von Canvas-Elementen

### 4.2 Node-System

Das Canvas-System basiert auf einem erweiterbaren Node-Modell. Nodes sind typisierte Bausteine, die untereinander verbunden werden und Daten weitergeben. Es gibt fünf Kategorien.

#### Kategorie 1: Quelle

Quelle-Nodes bringen Inhalte in den Canvas. Sie haben keine eingehenden Verbindungen, nur ausgehende.

| Node | Beschreibung | Phase |
|------|--------------|-------|
| Bild | Upload eigener Bilder (PNG, JPG, WebP) oder Einbindung per URL. Basis-Asset für alle weiteren Operationen. | 1 |
| Text | Freitextfeld mit Markdown-Support. Enthält Inhalte (Copy, Brief, Beschreibung) — semantisch verschieden vom Prompt-Node. | 1 |
| Prompt | Dedizierter Node für Modellinstruktionen. Verbindet sich ausschließlich mit KI-Nodes. | 2 |
| Farbe / Palette | Definiert Farben oder Farbpaletten als Style-Referenz. Kann an KI-Nodes oder Style-Transfer übergeben werden. | 2 |
| Video | Upload von Videodateien oder Einbindung per Link. Darstellung als Thumbnail-Node, Playback im Panel. | 2 |
| Asset | Freepik Stock-Assets (Fotos, Vektoren, Icons), direkt aus dem Asset Browser auf den Canvas gezogen. | 2 |

#### Kategorie 2: KI-Ausgabe

KI-Ausgabe-Nodes sind das Ergebnis einer Modell-Operation. Sie werden vom System erzeugt, nicht vom Nutzer angelegt.

| Node | Beschreibung | Phase |
|------|--------------|-------|
| KI-Bild | Output eines Bildgenerierungs-Calls. Speichert Prompt, verwendetes Modell und Generierungsparameter. | 1 |
| KI-Text | Output eines Text/Reasoning-Calls. Enthält generierten Copy, Captions, strukturierte Texte. | 2 |
| KI-Video | Output eines Videogenerierungs-Calls. Keyframe-basierte Generierung aus Bild-Input möglich. | 2 |
| Agent-Ausgabe | Bundle-Output eines Agent Nodes. Kann mehrere typisierte Sub-Outputs enthalten. | 3 |

#### Kategorie 3: Transformation

| Node | Beschreibung | Phase |
|------|--------------|-------|
| Crop / Resize | Freie Bildausschnitt-Auswahl direkt auf dem Canvas, mit Aspect-Ratio-Lock. | 2 |
| BG entfernen | Hintergrundentfernung via rembg. Output ist ein freigestelltes Bild. Batch-Modus möglich. | 2 |
| Upscale | Hochskalierung via Real-ESRGAN. Unterstützt Faktoren 2×, 4×, 8×. | 2 |
| Style Transfer | Überträgt visuellen Stil eines Referenzbildes auf einen anderen Input. | 3 |
| Gesicht | Face Restoration via GFPGAN. Verbessert Gesichtsdetails in generierten oder degradierten Bildern. | 3 |

#### Kategorie 4: Steuerung & Flow

| Node | Semantik | Beschreibung | Phase |
|------|----------|--------------|-------|
| Splitter | 1 → N | Verteilt 1 Input auf N identische oder abgeleitete Outputs. Ohne Bedingung. | 2 |
| Loop | Liste → N | Iteriert über eine Liste von Inputs und führt dieselbe verknüpfte Operation für jeden Eintrag aus. | 2 |
| Agent | N → Plan → N | LLM-Orchestrator. Analysiert Inputs, plant strukturierten Ausführungsplan, delegiert Operationen. | 2 |
| Mixer / Merge | N → 1 | Kombiniert N Inputs zu 1 Output durch Überblendung, Komposition oder Selektion. | 3 |
| Weiche | 1 → Pfad A/B/... | Bedingter Router. Leitet den Input anhand einer definierbaren Bedingung auf einen von mehreren Ausgangspfaden. | 3 |

#### Kategorie 5: Canvas & Layout

| Node | Beschreibung | Phase |
|------|--------------|-------|
| Gruppe | Container für andere Nodes. Unterstützt Collapse/Expand und benannte Scopes. | 1 |
| Frame | Artboard mit definierter Auflösung. Dient als Export-Boundary. | 1 |
| Notiz | Annotation auf dem Canvas. Markdown-Support, kein Datenanschluss. | 1 |
| Text-Overlay | Editierbarer Text-Layer über Bild- oder Video-Nodes innerhalb eines Frames. Verbraucht keine Credits. | 2 |
| Compare | Stellt zwei Bilder nebeneinander mit interaktivem Slider dar. | 2 |
| Kommentar | Kollaborations-Node für Reviews. Unterstützt Threads, @mentions und Resolve-Status. | 3 |
| Präsentation | Definiert Canvas-Bereiche als geordnete Slideshow. Export als PDF möglich. | 3 |

### 4.3 Agent Nodes

Agent Nodes sind ein spezieller Node-Typ auf dem Canvas. Sie fungieren als Smart Batch Processor: Sie nehmen mehrere Input-Nodes entgegen, orchestrieren komplexe Multi-Step-Workflows über ein Text/Reasoning LLM und produzieren mehrere Output-Nodes direkt auf dem Canvas.

**Ausführungsphasen:**

1. **Analyse:** Agent erhält alle verbundenen Inputs, LLM prüft ob alle nötigen Informationen vorhanden sind
2. **Clarification (optional):** Fehlen Angaben, stellt der Agent gezielt Rückfragen direkt am Node
3. **Execution:** LLM plant einen strukturierten Output-Plan (JSON), der dann als Batch abgearbeitet wird
4. **Output:** Ergebnisse landen als neue Nodes auf dem Canvas, verbunden mit dem Agent Node

**Vordefinierte Agent Templates:**

| Template | Typische Inputs | Typische Outputs |
|----------|-----------------|------------------|
| Instagram Curator | Produktfotos, Brand Brief, Zielgruppe | Feed Posts, Text-Overlays, Captions, Hashtag-Sets |
| (weitere folgen) | — | — |

---

## 5. Tech Stack

| Bereich | Technologie | Version / Hinweis |
|---------|-------------|-------------------|
| Frontend Framework | Next.js | 16.1.1 — App Router, Server Components |
| Styling | Tailwind CSS | v4 |
| UI Komponenten | ShadCN/UI | Aktuelle stabile Version |
| Backend / Realtime | Convex | Self-hosted via convex-backend |
| Authentifizierung | Better Auth | Self-hosted, open-source |
| Canvas / Flow | @xyflow/react | ehem. react-flow-renderer |
| Drag & Drop | dnd-kit | Empfohlen über react-dnd (bessere Performance) |
| Deployment | Coolify | VPS-Deployment für alle Self-hosted Services |
| Payment | Lemon Squeezy | Merchant of Record, VAT-Handling |
| Input Validation | Zod | Frontend + Backend, Convex Mutations |
| In-Memory Store | Redis | Self-hosted via Coolify |
| Rate Limiting | Redis-backed | Next.js Middleware / Route Handler |
| E-Mail | Unsend + Stalwart | Self-hosted via Coolify |
| Analytics | Rybbit | Self-hosted via Coolify |
| Error Tracking | Sentry Cloud | Free Tier (5.000 Errors/Monat) |
| DNS / DDoS / CDN | Cloudflare | Domain-Routing, DDoS-Schutz, Asset-Caching |
| Package Manager | pnpm | Je Repo |

### Zwei-Repo-Strategie

Statt eines Monorepos werden zwei unabhängige Repositories gepflegt. Zwischen den Repos gibt es keinen geteilten Code — die Landing Page hat keine Abhängigkeit auf Convex-Schemas, Node-Types oder andere App-Logik.

| Repo | Domain | Inhalt |
|------|--------|--------|
| `lemonspace-web` | app.lemonspace.io | Next.js App (Canvas, Dashboard, Auth, AI, Convex) |
| `lemonspace-landing` | lemonspace.io | Next.js Marketing Site |

**Auth-Cookie-Sharing:** BetterAuth setzt einen Session-Cookie auf `.lemonspace.io` (Dot-Prefix = gilt für alle Subdomains). Die Landing Page liest diesen Cookie, um den Login-State zu erkennen und zwischen "Get Started" und "Dashboard" Button zu wechseln. Die Landing Page führt keine Auth-Operationen durch — sie liest nur den Cookie.

### Self-Hosting-Strategie

Self-Hosting richtet sich primär an technisch versierte Nutzer und Entwickler. Die gehostete Version (lemonspace.app) ist der empfohlene Weg für alle anderen — insbesondere für Designer und kreative Teams ohne DevOps-Erfahrung.

Das Self-Hosting-Paket umfasst:

- **`docker-compose.yml`** — fasst alle Services zusammen: Next.js, Convex, Redis, Stalwart, Rybbit, rembg, Real-ESRGAN, GFPGAN
- **`.env.example`** — alle Umgebungsvariablen mit Kommentaren und Standardwerten
- **Setup-README** — Schritt-für-Schritt-Anleitung (Voraussetzungen: Docker + Coolify oder plain Docker)

> **Hinweis:** Self-hosted KI-Services (rembg, Real-ESRGAN, GFPGAN) bleiben in separaten Repositories mit eigenem Docker/Infra-Lifecycle und werden über Coolify unabhängig deployt.

### Convex: Architektonische Entscheidung & Lock-in

Convex liefert Realtime-Sync, File Storage und Background Jobs out-of-the-box, ohne dass eine eigene WebSocket-Infrastruktur, S3-Integration und Queue-Lösung zusammengestückelt werden muss. Dieser Geschwindigkeitsvorteil rechtfertigt den bewussten Vendor Lock-in.

> **Risiko (bewusst akzeptiert):** Der gesamte Realtime-, Storage- und Job-Stack ist an Convex gebunden. Eine spätere Migration ist aufwändig. Es wird keine künstliche Abstraktionsschicht eingebaut, da sie den Kernvorteil von Convex aufheben würde.

Dokumentierter Migrations-Pfad bei Skalierung: Convex Cloud mit EU-Standort. Convex bietet das eigene Migrations-Tooling und kennt das Ökosystem. Self-hosted Convex bleibt die Default-Strategie für Phase 1.

---

## 6. KI-Integrationsstrategie

### Zwei LLM-Rollen im System

| Rolle | Zweck | Beispielmodelle | Aufgerufen von |
|-------|-------|-----------------|----------------|
| Text / Reasoning | Agent-Logik, Planung, Clarification, Copywriting | Claude 3.5 Sonnet, GPT-4o | Agent Node |
| Image Generation | Bildgenerierung auf dem Canvas | Gemini 2.5 Flash Image, Flux.1 Pro, GPT-5 Image | Canvas-Aktionen + Agent Node |

### OpenRouter — Image Generation

| Modell | OpenRouter ID | Stärke | ~Kosten/Bild |
|--------|---------------|--------|--------------|
| Gemini 2.5 Flash Image | google/gemini-2.5-flash-image | Multi-Turn Editing, günstig | ~€0,02–0,04 |
| FLUX.2 Klein 4B | black-forest-labs/flux.2-klein-4b | Photorealismus, schnellstes Flux | ~€0,01–0,03 |
| Seedream 4.5 | bytedance-seed/seedream-4.5 | Editing-Konsistenz, Portraits | ~€0,04 |
| Gemini 3.1 Flash Image | google/gemini-3.1-flash-image-preview | Pro-Qualität bei Flash-Speed | ~€0,04–0,08 |
| GPT-5 Image Mini | openai/gpt-5-image-mini | Gutes Preis-Leistungs-Verhältnis | ~€0,04–0,08 |
| Riverflow V2 Fast | sourceful/riverflow-v2-fast | Custom Font Rendering, schnell | ~€0,02 |
| Riverflow V2 Pro | sourceful/riverflow-v2-pro | Text-Rendering, 4K Output | ~€0,15–0,33 |
| Gemini 3 Pro Image | google/gemini-3-pro-image-preview | Multi-Image, 4K, bestes Text-Rendering | ~€0,08–0,15 |
| GPT-5 Image | openai/gpt-5-image | Instruction Following, Text in Bild | ~€0,10–0,20 |

### Self-hosted Services

| Service | Funktion | Credits |
|---------|----------|---------|
| rembg | Hintergrundentfernung | Kostenlos |
| Real-ESRGAN | Upscaling (2×, 4×, 8×) | Kostenlos |
| GFPGAN | Face Restoration | Kostenlos |

---

## 7. High-Level Architektur

```
┌──────────────────────────────────────────────────────────┐
│ Next.js Frontend                                         │
│ Infinite Canvas (@xyflow/react + dnd-kit)                │
│                                                          │
│ Node-Kategorien:                                         │
│ [Quelle] [KI-Ausgabe] [Transformation]                   │
│ [Steuerung] [Canvas & Layout]                            │
└───────────────────────┬──────────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Convex Backend   │
              │  (Self-hosted)    │
              │  - Realtime Sync  │
              │  - File Storage   │
              │  - Auth           │
              │  - Modell-Router  │
              │  - Agent Executor │
              └──┬────────┬───┬───┘
                 │        │   │
    ┌────────────▼──┐ ┌───▼──────────────┐ ┌──▼──────────┐
    │  OpenRouter   │ │ Self-hosted KI   │ │ Freepik API │
    │ Image Gen +   │ │ rembg / ESRGAN   │ │  (Assets)   │
    │ Text/Reason   │ │ GFPGAN           │ └─────────────┘
    └───────────────┘ └──────────────────┘
```

---

## 8. Datenmodell (High-Level)

### Canvas & Node

```
Canvas
├── id, name, ownerId, createdAt / updatedAt
└── nodes[]

Node (Basis)
├── id, canvasId
├── type (image | text | prompt | color | video | asset |
│        ai-image | ai-text | ai-video | agent-output |
│        crop | bg-remove | upscale | style-transfer | face-restore |
│        splitter | loop | agent | mixer | switch |
│        group | frame | note | text-overlay | compare | comment | presentation)
├── position { x, y }
├── size { width, height }
├── data (je nach Typ)
└── createdAt
```

### Credit-System

```
CreditBalance
├── id, userId
├── balance          // tatsächlich verfügbare Credits (Euro-Cent)
├── reserved         // aktuell gesperrte Credits (laufende Jobs)
├── available        // computed: balance - reserved
├── monthlyAllocation // Credits aus dem Abo
└── updatedAt

CreditTransaction
├── id, userId
├── amount           // positiv = Gutschrift, negativ = Verbrauch
├── type             // subscription | topup | usage | reservation | refund
├── status           // committed | reserved | released | failed
├── description      // z.B. "Bildgenerierung – Gemini 2.5 Flash Image"
├── nodeId?          // Referenz auf den auslösenden Node
├── openRouterCost?  // tatsächliche OpenRouter-Kosten (gecacht)
└── createdAt

Subscription
├── id, userId
├── tier             // free | starter | pro | business
├── status           // active | cancelled | past_due
├── currentPeriodStart / currentPeriodEnd
└── lemonSqueezySubscriptionId?
```

---

## 9. Pricing & Credit-System

### Abo-Stufen

| Tier | Preis/Monat | Marge (30%) | Credits (70%) | Credits gesamt | Zielgruppe |
|------|-------------|-------------|---------------|----------------|------------|
| Free | €0 | — | — | €0,50 (Geschenk) | Testen & Evaluieren |
| Starter | €9 | €2,70 | €6,30 | €6,30 | Einzelnutzer |
| Pro | €49 | €12,98 | €34,30 | €36,02 (+5%) | Aktive Creator |
| Business | €99 | €22,77 | €69,30 | €76,23 (+10%) | Teams, hoher Durchsatz |

### Credit Reservation + Commit (Option C)

Credits werden vor jedem KI-Call reserviert und erst nach erfolgreichem Abschluss committed. Bei Fehler werden reservierte Credits automatisch freigegeben — kein manueller Refund-Prozess nötig.

**Flow:**

```
1. RESERVE → CreditTransaction (type: reservation, status: reserved)
   CreditBalance.reserved += estimated_cost
   CreditBalance.available = balance - reserved

2a. SUCCESS → Transaction status: committed
    CreditBalance.balance -= actual_cost
    CreditBalance.reserved -= estimated_cost

2b. FAILURE → Transaction status: released
    CreditBalance.reserved -= estimated_cost
    (balance bleibt unverändert — voller Refund)
```

> **Preisbasis:** Credits werden auf Basis der gecachten OpenRouter-Preise (Redis, TTL ~10 Minuten) reserviert und abgebucht. Minimale Abweichungen zum tatsächlichen API-Preis werden bewusst akzeptiert. Keine nachträgliche Korrektur.

### Agent Partial Failure

Bei Agent-Workflows läuft Reservation + Commit pro Suboperation. Schlägt Step 3 von 5 fehl: Steps 1+2 sind committed, Step 3 wird released, Steps 4+5 werden nicht mehr reserviert. Nur tatsächlich verbrauchte Credits werden berechnet.

### Credit-Verbrauch

| Operation | Modell / Service | Ungefähre Kosten |
|-----------|------------------|------------------|
| Bildgenerierung (Budget) | FLUX.2 Klein 4B | ~€0,01–0,03 |
| Bildgenerierung (Standard) | Gemini 2.5 Flash Image | ~€0,02–0,04 |
| Bildgenerierung (Premium) | GPT-5 Image / Nano Banana Pro | ~€0,10–0,20 |
| Agent Reasoning Call | Claude 3.5 Sonnet | ~€0,01–0,05 |
| BG-Entfernung | rembg (self-hosted) | Kostenlos |
| Upscaling | Real-ESRGAN (self-hosted) | Kostenlos |
| Face Restoration | GFPGAN (self-hosted) | Kostenlos |
| Canvas-Operationen | — | Kostenlos |
| Text-Overlay | — | Kostenlos |
| Export-Funktionen | — | Kostenlos |

---

## 10. UX-Strategie für Latenzen

KI-Operationen haben inhärente Wartezeiten. Einzelne Bildgenerierungen dauern 3–15 Sekunden, Agent-Workflows 20–60+ Sekunden. Die UI überbrückt diese Wartezeiten durch optimistische Darstellung direkt am Node — kein globales Loading-Banner, kein blockierendes Modal.

### Node-Status-Modell

Jeder ausführende Node zeigt seinen Zustand visuell direkt auf dem Canvas:

```
idle → analyzing → clarifying → executing (Step X/N) → done | error
```

Agent Nodes zeigen zusätzlich den Step-Progress während der Execution ("Generating Feed Post 2/3"). Bei Fehler wechselt der Node in einen Error-State mit kurzem Hinweis direkt am Node ("Timeout — Credits wurden nicht abgebucht").

### Skeleton Nodes

Sobald der Agent seinen Execution-Plan (JSON) erstellt hat, kennt das System Anzahl und Typ aller Output-Nodes. Ab diesem Moment werden Skeleton-Nodes auf dem Canvas platziert — noch bevor ein einziger API-Call für die Generierung läuft.

```
Agent Status: analyzing
→ Plan fertig: 3x KI-Bild, 2x KI-Text, 1x Text-Overlay
→ 6 Skeleton-Nodes erscheinen auf dem Canvas, korrekt positioniert
→ Agent Status: executing (1/6)
→ Skeletons füllen sich der Reihe nach mit echten Outputs
```

- Skeleton-Nodes sind bereits verschiebbar und arrangierbar bevor der Output fertig ist
- Sobald der Output fertig ist, ersetzt er den Skeleton in-place — Position bleibt erhalten
- Visuell: gedimmter Node-Rahmen mit Shimmer-Effekt, Node-Typ-Icon sichtbar (Bild vs. Text)

### Browser Notifications (Tab-Wechsel)

- Opt-in Browser Notifications API: wenn der Nutzer den Tab verlässt und der Job fertig wird, native Browser-Benachrichtigung
- Nicht erzwungen — Nutzer die im Tab bleiben sehen den Node-Status direkt

---

## 11. Entwicklungsphasen

### Phase 1 — Foundation (MVP)

**Nodes:**
- Quelle: Bild, Text
- KI-Ausgabe: KI-Bild
- Canvas & Layout: Gruppe, Frame, Notiz

**Infrastruktur & Features:**

| Task | Status |
|------|--------|
| Projektsetup: Next.js 16 + Tailwind v4 + ShadCN | ☐ Offen |
| Zwei Repos aufsetzen (`lemonspace-web` für app.lemonspace.io, `lemonspace-landing` für lemonspace.io) | ☐ Offen |
| Convex Self-hosted Backend aufsetzen | ☐ Offen |
| Basis-Canvas mit @xyflow/react | ☐ Offen |
| Drag & Drop von Bildern via dnd-kit | ☐ Offen |
| Authentifizierung via Better Auth | ☐ Offen |
| OpenRouter Integration (Image Gen, Gemini 2.5 Flash Image) | ☐ Offen |
| Credit-System: Balance-Tracking, Reservation+Commit, Kosten-Voranzeige | ☐ Offen |
| Abo-Verwaltung: Free/Starter/Pro/Business Tiers, monatliche Credit-Zuweisung | ☐ Offen |
| Lemon Squeezy Integration: Checkout, Webhooks, Credit-Zuweisung | ☐ Offen |
| Credit-Nachkauf (Top-Up) zum Selbstkostenpreis | ☐ Offen |
| Node-Status-Modell (idle/executing/done/error) direkt am Node | ☐ Offen |
| docker-compose.yml + .env.example + Setup-README | ☐ Offen |

### Phase 2 — KI-Features

**Nodes:**
- Quelle: Prompt, Farbe / Palette, Video, Asset
- KI-Ausgabe: KI-Text, KI-Video
- Transformation: Crop / Resize, BG entfernen, Upscale
- Steuerung: Splitter, Loop, Agent
- Canvas & Layout: Text-Overlay, Compare

**Infrastruktur & Features:**

| Task | Status |
|------|--------|
| Vollständige OpenRouter Image Gen Integration (alle 9 Modelle) | ☐ Offen |
| Experten-Modus: Modellauswahl-UI im Canvas AI Panel | ☐ Offen |
| OpenRouter Text/Reasoning Integration (Claude 3.5 Sonnet) | ☐ Offen |
| Agent Node: Analyse, Clarification, Execution, Output | ☐ Offen |
| Skeleton-Nodes: Platzierung nach Plan-Erstellung, sequenzielle Befüllung | ☐ Offen |
| Browser Notifications API (opt-in, Tab-Wechsel) | ☐ Offen |
| Erster Agent Template: Instagram Curator | ☐ Offen |
| Self-hosted KI-Services (rembg, Real-ESRGAN) | ☐ Offen |
| Freepik Asset Browser (Stock-Fotos, Vektoren) | ☐ Offen |
| Prompt-History und Re-Generation | ☐ Offen |

### Phase 3 — Kollaboration & Polish

**Nodes:**
- Transformation: Style Transfer, Gesicht (GFPGAN)
- Steuerung: Mixer, Weiche
- Canvas & Layout: Kommentar, Präsentation

**Infrastruktur & Features:**

| Task | Status |
|------|--------|
| Echtzeit-Kollaboration via Convex Subscriptions | ☐ Offen |
| Kommentar- und Annotations-System | ☐ Offen |
| Versions-History | ☐ Offen |
| Weitere Agent Templates | ☐ Offen |
| Export-Funktionen (PNG, PDF, ZIP) | ☐ Offen |
| Performance-Optimierung für große Canvases | ☐ Offen |

---

## 12. Offene Entscheidungen

| Thema | Entscheidung / Status |
|-------|----------------------|
| Authentifizierung | ✅ Better Auth (self-hosted, open-source) |
| Tailwind v4 | ✅ v4 ist Standard, keine Migration nötig |
| Pricing / Credit-System | ✅ 4-Tier Abo + Credit-System, 30% Marge, Reservation+Commit |
| Payment Provider | ✅ Lemon Squeezy (Merchant of Record, VAT-Handling) |
| Self-Hosting-Strategie | ✅ docker-compose.yml + .env.example + README, für technisch versierte Nutzer |
| Convex Lock-in | ✅ Bewusst akzeptiert; Migrations-Pfad: Convex Cloud EU |
| OpenRouter Image-Modelle | ✅ 9 Modelle definiert, alle Tiers haben Zugriff |
| Lizenz | ✅ BSL 1.1, 3 Jahre Change Date, Apache 2.0, nur private Nutzung frei |
| Repo-Strategie | ✅ Zwei unabhängige Repos (lemonspace-web + lemonspace-landing), Auth-Cookie-Sharing via .lemonspace.io |
| Job Queue | ✅ Convex native (Phase 1), externe Lösung bei Bedarf |
| E-Mail | ✅ Unsend + Stalwart, self-hosted |
| Analytics | ✅ Rybbit, self-hosted |
| Error Tracking | ✅ Sentry Cloud (Free Tier) |
| Cache-Strategie | ✅ Cloudflare (Edge) + Redis (Application, TTL ~10min für OpenRouter-Preise) |
| E2E-Testing | ✅ Kein E2E in Phase 1, Neubewertung bei Skalierung |
| UX-Latenzen | ✅ Node-Status-Modell, Skeleton-Nodes, Browser Notifications (opt-in) |
| Credit Fehlerbehandlung | ✅ Reservation + Commit, gecachte Preise, kein nachträglicher Ausgleich |
| Kollaborationstiefe | ⏳ Cursor-Sync, gleichzeitige Edits, Kommentare |
| Agent Clarification UX | ⏳ Inline am Node vs. Modal vs. Chat-Sidebar |
| Agent Template Format | ⏳ Markdown-Datei vs. strukturiertes JSON-Schema |
| Weiche: Bedingungslogik | ⏳ Visueller Rule-Builder vs. Ausdruckssprache |
| Mixer: Blend Modes | ⏳ min. Normal, Multiply, Screen, Overlay |
| Canvas-Export | ⏳ PNG, PDF, ZIP (Phase 3, Library TBD) |

---

## 13. Nicht-funktionale Anforderungen

| Anforderung | Beschreibung |
|-------------|--------------|
| Self-hostable | Vollständiger Betrieb auf eigenem VPS möglich; docker-compose.yml als primäres Deployment-Artefakt |
| Source Available | BSL 1.1 — Quellcode öffentlich, kommerzielle Nutzung lizenzpflichtig (siehe Abschnitt 15) |
| Performance | Canvas mit 100+ Nodes ohne spürbare Verzögerung |
| Datenschutz | Keine externen Tracking-Dienste; Ausnahme: Sentry Cloud für Error Tracking |
| Skalierbarkeit | Convex-Backend skaliert mit wachsender Nutzerzahl; Migrations-Pfad: Convex Cloud EU |
| Sicherheit | Rate Limiting auf allen API-Endpunkten via Redis, DDoS-Schutz via Cloudflare |
| UX-Resilienz | Alle KI-Operationen zeigen Status direkt am Node; Skeleton-Nodes bei Agent-Workflows |
| Credit-Integrität | Reservation+Commit-Mechanismus verhindert Credit-Verlust bei fehlgeschlagenen API-Calls |

---

## 14. Nächste Schritte

1. Zwei Repos aufsetzen (`lemonspace-web` mit Next.js 16 + Tailwind v4 + ShadCN + Better Auth + Convex, `lemonspace-landing` mit Next.js 16 + Tailwind v4 + ShadCN)
2. Convex Schema: Detailliertes Datenbankschema entwerfen (Node-Taxonomie + Credit-System inkl. CreditBalance.reserved/available)
3. UI/UX Wireframes: Canvas-Interface, Node-Status-Modell, Skeleton-Nodes, Agent Clarification-UX skizzieren
4. API-Prototyp: OpenRouter Anbindung testen — Image Gen (Gemini 2.5 Flash Image) und Text/Reasoning (Claude 3.5 Sonnet)
5. Lemon Squeezy Integration: Abo-Tiers anlegen, Webhook-Handling für Subscription-Events und Credit-Zuweisung
6. docker-compose.yml + .env.example + Setup-README ausarbeiten

---

## 15. Lizenzmodell

Die Software wird unter der Business Source License 1.1 (BSL 1.1) veröffentlicht. Der vollständige Quellcode ist öffentlich einsehbar, auditierbar und für private/persönliche Nutzung kostenlos. Kommerzielle Nutzung erfordert eine separate Lizenzvereinbarung.

### Parameter

| Parameter | Wert |
|-----------|------|
| Lizenz | Business Source License 1.1 |
| Change Date | 3 Jahre nach Veröffentlichung jedes Releases |
| Change License | Apache License 2.0 |
| Additional Use Grant | Nutzung ausschließlich für private und persönliche, nicht-kommerzielle Zwecke |

### Kommerzielle Lizenzen (geplant)

| Lizenz | Zielgruppe | Details |
|--------|------------|---------|
| Small Business | Unternehmen ≤ 10 Mitarbeiter | Preis und Konditionen TBD |
| Enterprise | Unternehmen > 10 Mitarbeiter | Preis und Konditionen TBD |
| OEM / Reseller | Einbettung in Drittprodukte | Individuelle Vereinbarung |

> **Positionierung:** LemonSpace wird als „Source Available" bzw. „Fair Source" positioniert — nicht als „Open Source" im Sinne der OSI-Definition. Der Quellcode ist vollständig öffentlich und transparent; Nutzungsrechte sind eingeschränkt bis zum Erreichen des Change Date.

---

*LemonSpace PRD v1.1 — März 2026*
