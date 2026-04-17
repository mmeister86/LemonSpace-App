# 🍋 LemonSpace
## Product Requirements Document
*Self-Hosted, Source-Available Alternative to Freepik Spaces*

| Version | Status | Datum | Projekt |
|---------|--------|-------|---------|
| v2.2 | Draft | April 2026 | lemonspace.app |

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
| v1.2 | Pricing überarbeitet: Credit-Abstraktion (1 Cr = €0,01 intern), Tiers €8/€59/€119 (Business→Max), Top-Up-System (fix + Custom mit Bonus-Staffel), Marge nach LS-Gebühr + USt validiert |
| v1.3 | Payment: Lemon Squeezy → Polar.sh (niedrigere Gebühren, Better Auth Plugin, Open Source). Gebührenmodell angepasst: 4% + $0,40 + 1,5% intl. + 0,5% Subscription |
| v1.4 | Bildbearbeitung: Neue Kategorie 4 „Bildbearbeitung" mit non-destruktivem Adjustment-Stack (zwischen Transformation und Steuerung). 4 Adjustment-Nodes (Kurven, Farbe, Licht, Detail) + Render-Node. Alle Operationen credit-frei (client-seitig via Canvas API / WebGL). Steuerung → Kat. 5, Canvas & Layout → Kat. 6. Phase 2. |
| v1.5 | Stage 3 Offline Sync: Local-First Canvas mit IndexedDB Queue, Optimistic Updates, ID-Remapping. Magic Link Auth via Better Auth Plugin. react-resizable-panels für Sidebar Resizing. Canvas Modularisierung, Dashboard Dialoge, Auth Race-Härtung.|
| v2.0 | **Phase-1-Umfang erweitert:** Video- und Asset-Nodes vorgezogen (Phase 2→1). Bildbearbeitungs-Nodes (Kurven, Farbe, Licht, Detail, Render) vorgezogen (Phase 2→1). Vollständige WebGL-basierte Image-Pipeline implementiert (`lib/image-pipeline/`). Node-Taxonomie hat 6 Kategorien mit 27 Node-Typen. Phase-1-Status-Tabelle aktualisiert. |
| v2.1 | **Alle 9 Image-Modelle aktiviert (Phase 2→1):** Vollständige OpenRouter Image Gen Integration mit serverseitigem Tier-Enforcement und modellspezifischen Request-Modalities. Tier-aware Model Selector im Prompt-Node. AI-Modularisierung: `ai_errors.ts`, `ai_node_data.ts`, `ai_retry.ts` aus `ai.ts` extrahiert. Dashboard Snapshot Cache (`convex/dashboard.ts`): Gebündelte Query mit localStorage-Cache (`lib/dashboard-snapshot-cache.ts`). Credits Activity Analytics: `lib/credits-activity.ts` + `CreditsActivityChart` (Recharts). Canvas Graph Query Cache (`convex/canvasGraph.ts` + `canvas-graph-query-cache.ts`): Performance-Optimierung durch separaten Graph-Endpunkt mit Optimistic Store. Neuer Hook `use-dashboard-snapshot.ts`. ShadCN Chart-Komponente (`components/ui/chart.tsx`) + Recharts 3.8. |
| v2.2 | **Codebase-Aktualisierung:** Crop-Node implementiert (Phase 2). Agent-Modelle: GPT-5.4 Nano/Mini/Pro (statt Claude 3.5 Sonnet). Schema: `mediaItems`-, `webhookIdempotencyEvents`-, `userSettings`-Tabellen. Image Pipeline: `crop-node-data.ts`, `geometry-transform.ts`. Neue Lib-Dateien: `agent-models.ts`, `canvas-render-preview.ts`, `canvas-node-favorite.ts`, `media-archive.ts`, `mixer-crop-layout.ts`. Canvas Modularisierung: 13 neue Hooks/Contexts für Flow-Reconciliation, Sync-Engine, Drop, Edge-Insertions. Convex: `media.ts`, `migrations.ts`, `polar_utils.ts`, `presets.ts`, `users.ts`. |

---

## 1. Vision & Zielsetzung

LemonSpace ist eine self-hosted, source-available Alternative zu Freepik Spaces — ein kollaboratives, KI-gestütztes Creative-Workflow-Tool mit einer Infinite-Canvas-Oberfläche. Ziel ist ein freier und erweiterbarer Workspace für kreative Teams, der auf eigener Infrastruktur betrieben werden kann.

---

## 2. Problemstellung

Freepik Spaces ist ein leiststarkes Tool für KI-gestützte kreative Workflows, aber:

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
- Resizable Sidebar mit Rail-Mode (collapsible)
- Offline-fähige Sync-Queue (IndexedDB + localStorage)
- Optimistic Updates mit ID-Remapping

### 4.2 Node-System

Das Canvas-System basiert auf einem erweiterbaren Node-Modell. Nodes sind typisierte Bausteine, die untereinander verbunden werden und Daten weitergeben. Es gibt **sechs Kategorien** mit insgesamt **27 Node-Typen**.

> **Single Source of Truth:** Die Node-Taxonomie wird zentral in `lib/canvas-node-types.ts` (Typen), `lib/canvas-node-catalog.ts` (Katalog) und `components/canvas/node-types.ts` (React-Flow-Registrierung) verwaltet. Der Katalog bestimmt automatisch den `implemented`-Status basierend auf vorhandenen React-Flow-Komponenten.

#### Kategorie 1: Quelle

Quelle-Nodes bringen Inhalte in den Canvas.

| Node | Beschreibung | Phase | Implementiert |
|------|--------------|-------|---------------|
| Bild | Upload eigener Bilder (PNG, JPG, WebP) oder Einbindung per URL. Basis-Asset für alle weiteren Operationen. | 1 | ✅ |
| Text | Freitextfeld mit Markdown-Support. Enthält Inhalte (Copy, Brief, Beschreibung) — semantisch verschieden vom Prompt-Node. | 1 | ✅ |
| Video | Upload von Videodateien oder Einbindung per Link. Darstellung als Thumbnail-Node, Playback im Panel. | 2 | ✅ |
| Asset | Stock-Assets (Fotos, Vektoren, Icons), direkt aus dem Asset Browser auf den Canvas gezogen. | 2 | ✅ |
| Farbe / Palette | Definiert Farben oder Farbpaletten als Style-Referenz. Kann an KI-Nodes oder Style-Transfer übergeben werden. | 2 | ☐ |
| Prompt | Dedizierter Node für Modellinstruktionen. Verbindet sich ausschließlich mit KI-Nodes. Kategorie: KI-Ausgabe. | 1 | ✅ |

#### Kategorie 2: KI-Ausgabe

KI-Ausgabe-Nodes sind das Ergebnis einer Modell-Operation. Sie werden vom System erzeugt, nicht vom Nutzer angelegt.

| Node | Beschreibung | Phase | Implementiert |
|------|--------------|-------|---------------|
| KI-Bild (`ai-image`) | Output eines Bildgenerierungs-Calls. Speichert Prompt, verwendetes Modell und Generierungsparameter. | 1 | ✅ |
| KI-Text | Output eines Text/Reasoning-Calls. Enthält generierten Copy, Captions, strukturierte Texte. | 2 | ☐ |
| KI-Video | Output eines Videogenerierungs-Calls. Keyframe-basierte Generierung aus Bild-Input möglich. | 2 | ☐ |
| Agent-Ausgabe | Bundle-Output eines Agent Nodes. Kann mehrere typisierte Sub-Outputs enthalten. | 3 | ☐ |

#### Kategorie 3: Transformation

| Node | Beschreibung | Phase | Implementiert |
|------|--------------|-------|---------------|
| Crop / Resize | Freie Bildausschnitt-Auswahl direkt auf dem Canvas, mit Aspect-Ratio-Lock. | 2 | ✅ |
| BG entfernen | Hintergrundentfernung via rembg. Output ist ein freigestelltes Bild. Batch-Modus möglich. | 2 | ☐ |
| Upscale | Hochskalierung via Real-ESRGAN. Unterstützt Faktoren 2×, 4×, 8×. | 2 | ☐ |
| Style Transfer | Überträgt visuellen Stil eines Referenzbildes auf einen anderen Input. | 3 | ☐ |
| Gesicht | Face Restoration via GFPGAN. Verbessert Gesichtsdetails in generierten oder degradierten Bildern. | 3 | ☐ |

#### Kategorie 4: Bildbearbeitung

Bildbearbeitungs-Nodes arbeiten **non-destruktiv**. Sie verändern das Originalbild nicht, sondern definieren Adjustments, die als Stack auf das Eingangsbild angewendet werden. Erst der Render-Node materialisiert das Ergebnis als neues Bild.

**Architektur: WebGL-basierte Image-Pipeline (`lib/image-pipeline/`)**

Die Bildbearbeitung nutzt eine vollständige WebGL-Pipeline für hardwarebeschleunigte Bildverarbeitung direkt im Browser:

```
lib/image-pipeline/
├── adjustment-types.ts    ← Typen und Default-Werte für alle Adjustments
├── contracts.ts           ← Pipeline-Schnittstellen
├── crop-node-data.ts      ← Crop-Node Daten-Typen und Normalisierung
├── geometry-transform.ts  ← Geometrische Transformationen
├── render-core.ts         ← Kern-Rendering-Logik
├── render-types.ts        ← Render-Typen
├── render-size.ts         ← Größenberechnung
├── source-loader.ts       ← Bildquellen-Lader
├── preview-renderer.ts    ← Echtzeit-Vorschau
├── histogram.ts           ← Histogram-Berechnung
├── histogram-plot.ts      ← Histogram-Visualisierung
├── presets.ts             ← Built-in und User-Presets
├── bridge.ts              ← Worker-Bridge
├── worker-client.ts       ← Web-Worker-Client
├── image-pipeline.worker.ts ← Web-Worker für Hintergrundverarbeitung
└── backend/
    ├── backend-router.ts  ← Backend-Auswahl (WebGL/WASM)
    ├── backend-types.ts   ← Backend-Typen
    ├── capabilities.ts    ← Feature-Erkennung
    ├── feature-flags.ts   ← Backend-Flags
    ├── webgl/
    │   ├── webgl-backend.ts  ← WebGL-Renderer
    │   └── shaders/          ← GLSL-Shader
    │       ├── curves.frag.glsl
    │       ├── color-adjust.frag.glsl
    │       ├── light-adjust.frag.glsl
    │       └── detail-adjust.frag.glsl
    └── wasm/
        ├── wasm-loader.ts    ← WASM-Loader (zukünftig)
        └── wasm-backend.ts   ← WASM-Backend (zukünftig)
```

**Adjustment-Stack:**

```
Bild-Node (Original)
  → Kurven-Node (Kontrast-S-Kurve)
    → Farbe-Node (Sättigung +20, Tint Warm)
      → Detail-Node (Sharpen 40%)
        → Render-Node → Neues Bild (materialisiert)
```

| Node | Beschreibung | Phase | Implementiert |
|------|--------------|-------|---------------|
| Kurven | Tonwert-Kurven (RGB + Einzelkanäle). Kontrollpunkte per Drag auf der Kurve. Presets: Kontrast, Aufhellen, Abdunkeln, Film-Look, Cross-Process. | 2 | ✅ |
| Farbe | HSL-Regler (Hue, Saturation, Luminance — global + pro Farbbereich). Color Balance. Temperature/Tint. Presets. | 2 | ✅ |
| Licht | Brightness, Contrast, Exposure, Highlights, Shadows, Whites, Blacks. HDR-Tone-Mapping. Vignette. Presets. | 2 | ✅ |
| Detail | Unscharf maskieren (Amount, Radius, Threshold). Clarity / Structure. Denoise. Grain. Presets. | 2 | ✅ |
| Render | Materialisierer: Wendet den gesamten Adjustment-Stack an und erzeugt ein neues Bild (in Convex Storage). Unterstützt Ausgabe-Auflösung und Format. | 2 | ✅ |

> **Credits:** Alle Adjustment-Nodes sind **credit-frei** — die Verarbeitung läuft vollständig im Browser (WebGL). Nur der Render-Node erzeugt serverseitig ein finales Bild (ebenfalls credit-frei).

> **Technische Umsetzung:** Die Entscheidung für WebGL als primäre Rendering-Engine ist getroffen. GLSL-Shader für alle vier Adjustment-Typen sind implementiert. Ein WASM-Backend ist als Alternative vorbereitet (`wasm-backend.ts`), aber noch nicht aktiv.

#### Kategorie 5: Steuerung & Flow

| Node | Semantik | Beschreibung | Phase | Implementiert |
|------|----------|--------------|-------|---------------|
| Splitter | 1 → N | Verteilt 1 Input auf N identische oder abgeleitete Outputs. | 2 | ☐ |
| Loop | Liste → N | Iteriert über eine Liste von Inputs und führt dieselbe verknüpfte Operation für jeden Eintrag aus. | 2 | ☐ |
| Agent | N → Plan → N | LLM-Orchestrator. Analysiert Inputs, plant strukturierten Ausführungsplan, delegiert Operationen. | 2 | ☐ |
| Mixer / Merge | N → 1 | Kombiniert N Inputs zu 1 Output durch Überblendung, Komposition oder Selektion. | 3 | ☐ |
| Weiche | 1 → Pfad A/B/... | Bedingter Router. Leitet den Input anhand einer definierbaren Bedingung auf einen von mehreren Ausgangspfaden. | 3 | ☐ |

#### Kategorie 6: Canvas & Layout

| Node | Beschreibung | Phase | Implementiert |
|------|--------------|-------|---------------|
| Gruppe | Container für andere Nodes. Unterstützt Collapse/Expand und benannte Scopes. | 1 | ✅ |
| Frame | Artboard mit definierter Auflösung. Dient als Export-Boundary. | 1 | ✅ |
| Notiz | Annotation auf dem Canvas. Markdown-Support, kein Datenanschluss. | 1 | ✅ |
| Compare | Stellt zwei Bilder nebeneinander mit interaktivem Slider dar. | 1 | ✅ |
| Text-Overlay | Editierbarer Text-Layer über Bild- oder Video-Nodes innerhalb eines Frames. | 2 | ☐ |
| Kommentar | Kollaborations-Node für Reviews. Unterstützt Threads, @mentions und Resolve-Status. | 3 | ☐ |
| Präsentation | Definiert Canvas-Bereiche als geordnete Slideshow. Export als PDF möglich. | 3 | ☐ |

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
| Frontend Framework | Next.js | 16.2.1 — App Router, Server Components |
| Styling | Tailwind CSS | v4 |
| UI Komponenten | ShadCN/UI | Aktuelle stabile Version |
| Backend / Realtime | Convex | Self-hosted via convex-backend |
| Authentifizierung | Better Auth + Magic Link | Self-hosted, open-source, Magic Link via -sh/better-auth plugin |
| Canvas / Flow | @xyflow/react | ehem. react-flow-renderer |
| Drag & Drop | dnd-kit | Empfohlen über react-dnd (bessere Performance) |
| Deployment | Coolify | VPS-Deployment für alle Self-hosted Services |
| Payment | Polar.sh | MoR, VAT-Handling, Better Auth Plugin (@polar-sh/better-auth) |
| Input Validation | Zod | Frontend + Backend, Convex Mutations |
| In-Memory Store | Redis | Self-hosted via Coolify |
| Rate Limiting | Redis-backed | Next.js Middleware / Route Handler |
| E-Mail | Unsend + Stalwart | Self-hosted via Coolify |
| Analytics | Rybbit | Self-hosted via Coolify |
| Error Tracking | Sentry Cloud | Free Tier (5.000 Errors/Monat) |
| DNS / DDoS / CDN | Cloudflare | Domain-Routing, DDoS-Schutz, Asset-Caching |
| Panel Resizing | react-resizable-panels | ShadCN UI Komponente für Resizable Layouts |
| Image Pipeline | WebGL + GLSL Shaders | Hardware-beschleunigte Bildverarbeitung im Browser |
| Offline Sync | IndexedDB + localStorage | Canvas-Sync-Queue, Snapshot-Persistenz, Optimistic Updates |
| Package Manager | pnpm | Je Repo |
| Charts / Visualization | Recharts + ShadCN Chart | v3.8.0 — Dashboard Credits Activity Chart |
| Server-Side Canvas | @napi-rs/canvas | Server-side Canvas Rendering für Export |
| Image Processing | Jimp | Bildverarbeitung (Resize, Konvertierung) |
| ZIP Export | JSZip | ZIP-Archiv-Generierung für Batch-Export |
| Internationalisierung | next-intl | i18n (de/en) |
| Animationen | Framer Motion | UI-Animationen und Transitions |

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

Dokumentierter Migrationspfad bei Skalierung: Convex Cloud mit EU-Standort. Convex bietet das eigene Migrations-Tooling und kennt das Ökosystem. Self-hosted Convex bleibt die Default-Strategie für Phase 1.

---

## 6. KI-Integrationsstrategie

### Zwei LLM-Rollen im System

| Rolle | Zweck | Beispielmodelle | Aufgerufen von |
|-------|-------|-----------------|----------------|
| Text / Reasoning | Agent-Logik, Planung, Clarification, Copywriting | GPT-5.4 Nano, GPT-5.4 Mini, GPT-5.4, GPT-5.4 Pro | Agent Node |
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

### Aktuell aktivierte Modelle (Phase 1)

Alle 9 Image-Modelle sind aktiviert. Server-seitiges Tier-Enforcement prüft `minTier` pro Modell. Der Prompt-Node bietet einen tier-aware Model Selector.

| Modell | ID | Credits | Tier-Zugang | Modalities |
|--------|-----|---------|-------------|------------|
| Gemini 2.5 Flash | google/gemini-2.5-flash-image | 4 Cr | Alle Tiers | image + text |
| FLUX.2 Klein 4B | black-forest-labs/flux.2-klein-4b | 2 Cr | Alle Tiers | image only |
| Seedream 4.5 | bytedance-seed/seedream-4.5 | 5 Cr | Alle Tiers | image only |
| Gemini 3.1 Flash Image | google/gemini-3.1-flash-image-preview | 6 Cr | Alle Tiers | image + text |
| GPT-5 Image Mini | openai/gpt-5-image-mini | 8 Cr | Ab Starter | image + text |
| Riverflow V2 Fast | sourceful/riverflow-v2-fast | 9 Cr | Ab Starter | image only |
| Riverflow V2 Pro | sourceful/riverflow-v2-pro | 12 Cr | Ab Starter | image only |
| Gemini 3 Pro Image | google/gemini-3-pro-image-preview | 13 Cr | Ab Starter | image + text |
| GPT-5 Image | openai/gpt-5-image | 15 Cr | Ab Starter | image + text |

> **Request Modalities:** Modelle mit `image only` senden `modalities: ["image"]`, alle anderen `modalities: ["image", "text"]`. Dies wird in `convex/openrouter.ts` über das `requestModalities`-Feld gesteuert.

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
│ [Bildbearbeitung] [Steuerung] [Canvas & Layout]          │
│                                                          │
│ Image Pipeline:                                          │
│ WebGL + GLSL Shaders (client-seitig, credit-frei)        │
│ IndexedDB Sync Queue (offline-fähig)                     │
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
│        curves | color-adjust | light-adjust | detail-adjust | render |
│        splitter | loop | agent | mixer | switch |
│        group | frame | note | compare | text-overlay | comment | presentation)
├── position { x, y }
├── size { width, height }
├── data (je nach Typ)
├── status (idle | analyzing | clarifying | executing | done | error)
├── statusMessage?
├── retryCount?
├── parentId?
├── zIndex?
└── createdAt
```

### Credit-System

```
CreditBalance
├── id, userId
├── balance          // verfügbare Credits
├── reserved         // aktuell gesperrte Credits (laufende Jobs)
├── available        // computed: balance - reserved
├── monthlyAllocation // Credits aus dem Abo (50/400/3300/6700)
└── updatedAt

CreditTransaction
├── id, userId
├── amount           // positiv = Gutschrift, negativ = Verbrauch (in Credits)
├── type             // subscription | topup | usage | reservation | refund
├── status           // committed | reserved | released | failed
├── description      // z.B. "Bildgenerierung – Gemini 2.5 Flash Image (4 Cr)"
├── nodeId?          // Referenz auf den auslösenden Node
├── canvasId?        // Zugehöriger Canvas
├── openRouterCost?  // tatsächliche OpenRouter-Kosten in €
├── model?           // OpenRouter Model ID
└── createdAt

Subscription
├── id, userId
├── tier             // free | starter | pro | max | business
├── status           // active | cancelled | past_due | trialing
├── currentPeriodStart / currentPeriodEnd
└── polarSubscriptionId?
```

### Adjustment Presets

```
AdjustmentPreset
├── id, userId
├── name             // Benutzerdefinierter Name
├── nodeType         // curves | color-adjust | light-adjust | detail-adjust
├── params           // Typ-spezifische Parameter (v.any())
└── createdAt
```

### Media Library

```
MediaItem
├── id, ownerId
├── kind              // image | video | asset
├── source            // upload | ai-image | ai-video | freepik-asset | pexels-video
├── dedupeKey         // Deduplication-Key
├── title?, filename?, mimeType?
├── storageId?, previewStorageId?
├── originalUrl?, previewUrl?, sourceUrl?
├── providerAssetId?
├── width?, height?, durationSeconds?
├── metadata?
├── firstSourceCanvasId?, firstSourceNodeId?
├── createdAt, updatedAt, lastUsedAt
```

### Webhook Idempotency

```
WebhookIdempotencyEvent
├── id
├── provider          // polar
├── scope             // topup_paid | subscription_activated_cycle | subscription_revoked
├── idempotencyKey
├── userId
├── polarOrderId?, polarSubscriptionId?
├── createdAt
```

### User Settings

```
UserSettings
├── id, userId
├── locale?           // de | en
├── createdAt, updatedAt
```

---

## 9. Pricing & Credit-System

### Credit-Abstraktion

Nutzer arbeiten mit **Credits** statt mit Euro-Beträgen. Ein Credit entspricht intern €0,01 OpenRouter-Kosten (interner Wechselkurs, wird dem Nutzer nicht kommuniziert). Die Abstraktion entkoppelt das Pricing von API-Preisschwankungen und ermöglicht flexible Anpassungen.

### Abo-Stufen

Preise kalkuliert mit ≥28% Netto-Marge nach Polar Gebühr (4% + $0,40 + 1,5% intl. + 0,5% Subscription) und 19% USt.

| Tier | Preis/Monat | Credits/Monat | Echte Marge | €/Credit | Zielgruppe |
|------|-------------|---------------|-------------|----------|------------|
| Free | €0 | 50 | −€0,50 (Akquise) | gratis | Testen & Evaluieren |
| Starter | €8 | 400 | ~€2,00 (33%) | €0,0200 | Einzelnutzer, Einstieg |
| Pro | €59 | 3.300 | ~€13,71 (29%) | €0,0179 | Aktive Creator |
| Max | €119 | 6.700 | ~€27,61 (29%) | Teams, hoher Durchsatz |

### Credit-Nachkauf (Top-Up)

Fixe Top-Up-Pakete + frei wählbarer Custom-Betrag (€5–200). Top-Ups sind pro Credit immer teurer als das entsprechende Abo — regelmäßige Nachkäufer werden zum Upgrade animiert.

**Fixe Pakete:**

| Paket | Preis | Credits | Marge | €/Credit |
|-------|-------|---------|-------|----------|
| Klein | €5 | 250 | ~31% | €0,0200 |
| Mittel | €10 | 500 | ~34% | €0,0200 |
| Groß | €20 | 1.000 | ~36% | €0,0200 |
| XL | €50 | 3.000 | ~24% | €0,0167 |

**Custom Top-Up (€5–200):** Bonus steigt stufenweise mit dem Betrag. Formel: `Credits = FLOOR(Netto × 0,70 × (1 + Bonus) ÷ Kurs)`. UI zeigt live: "€X → Y Credits".

| Bereich | Bonus | Min. Marge |
|---------|-------|------------|
| €5–9,99 | 0% | ~30% |
| €10–19,99 | 3% | ~28% |
| €20–49,99 | 6% | ~26% |
| €50–99,99 | 10% | ~23% |
| €100–200 | 13% | ~21% |

### Credit-Preise pro Operation

Credits = ROUND(API-Kosten × Markup ÷ Kurs). Agent-Calls haben höheren Markup (Wertschöpfung durch Orchestrierung).

| Operation | Modell | API-Kosten | Markup | Credits | Tier-Zugang |
|-----------|--------|------------|--------|---------|-------------|
| Bildgenerierung (Standard) | Gemini 2.5 Flash | ~€0,04 | 1× | 4 Cr | Alle Tiers |
| Bildgenerierung (Budget) | FLUX.2 Klein 4B | ~€0,02 | 1× | 2 Cr | Alle Tiers |
| Bildgenerierung (Standard) | Seedream 4.5 | ~€0,05 | 1× | 5 Cr | Alle Tiers |
| Bildgenerierung (Standard+) | Gemini 3.1 Flash Image | ~€0,06 | 1× | 6 Cr | Alle Tiers |
| Bildgenerierung (Premium) | GPT-5 Image Mini | ~€0,08 | 1× | 8 Cr | Ab Starter |
| Bildgenerierung (Premium) | Riverflow V2 Fast | ~€0,09 | 1× | 9 Cr | Ab Starter |
| Bildgenerierung (Premium) | Riverflow V2 Pro | ~€0,12 | 1× | 12 Cr | Ab Starter |
| Bildgenerierung (Premium) | Gemini 3 Pro Image | ~€0,13 | 1× | 13 Cr | Ab Starter |
| Bildgenerierung (Ultra) | GPT-5 Image | ~€0,15 | 1× | 15 Cr | Ab Starter |
| Agent Reasoning (Nano) | GPT-5.4 Nano | ~€0,02 | 3× | 6 Cr | Ab Starter |
| Agent Reasoning (Mini) | GPT-5.4 Mini | ~€0,05 | 3× | 15 Cr | Ab Starter |
| Agent Reasoning (Standard) | GPT-5.4 | ~€0,13 | 3× | 38 Cr | Ab Starter |
| Agent Reasoning (Pro) | GPT-5.4 Pro | ~€0,60 | 3× | 180 Cr | Ab Max |
| BG-Entfernung | rembg (self-hosted) | €0 | — | 0 Cr | Alle Tiers |
| Upscaling | Real-ESRGAN (self-hosted) | €0 | — | 0 Cr | Alle Tiers |
| Face Restoration | GFPGAN (self-hosted) | €0 | — | 0 Cr | Alle Tiers |
| Canvas-Operationen | — | €0 | — | 0 Cr | Alle Tiers |
| Bildbearbeitung (Kurven, Farbe, Licht, Detail) | WebGL (client-seitig) | €0 | — | 0 Cr | Alle Tiers |
| Render (Adjustment-Stack materialisieren) | Server-seitig (Canvas API) | €0 | — | 0 Cr | Alle Tiers |
| Export (PNG/ZIP) | — | €0 | — | 0 Cr | Alle Tiers |

### Credit Reservation + Commit

Credits werden vor jedem KI-Call reserviert und erst nach erfolgreichem Abschluss committed. Bei Fehler werden reservierte Credits automatisch freigegeben — kein manueller Refund-Prozess nötig.

**Flow:**

```
1. RESERVE → CreditTransaction (type: reservation, status: reserved)
   CreditBalance.reserved += estimated_credits
   CreditBalance.available = balance - reserved

2a. SUCCESS → Transaction status: committed
    CreditBalance.balance -= actual_credits
    CreditBalance.reserved -= estimated_credits

2b. FAILURE → Transaction status: released
    CreditBalance.reserved -= estimated_credits
    (balance bleibt unverändert — voller Refund)
```

> **Preisbasis:** Credit-Preise pro Operation sind fix definiert (siehe Tabelle). Der interne Wechselkurs (1 Credit = €0,01 OR-Kosten) ist ein internes Kalkulationsinstrument. Bei API-Preisänderungen werden die Credit-Preise pro Operation angepasst — nicht der Wechselkurs.

### Agent Partial Failure

Bei Agent-Workflows läuft Reservation + Commit pro Suboperation. Schlägt Step 3 von 5 fehl: Steps 1+2 sind committed, Step 3 wird released, Steps 4+5 werden nicht mehr reserviert. Nur tatsächlich verbrauchte Credits werden berechnet.

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

### Offline-Sync & Optimistic Updates

- **IndexedDB-Sync-Queue** (`lib/canvas-op-queue.ts`): Persistente Queue für Canvas-Mutations mit Retry-Backoff und 24h-TTL
- **localStorage-Cache** (`lib/canvas-local-persistence.ts`): Snapshot + leichtgewichtiger Op-Mirror für sofortige UI-Pins/Recovery
- **Optimistic IDs:** Temporäre Nodes/Edges erhalten `optimistic_`-Prefix, werden durch echte Convex-IDs ersetzt
- **ID-Remapping:** Folge-Operationen werden automatisch auf neue IDs remappt

---

## 11. Entwicklungsphasen

### Phase 1 — Foundation (MVP)

**Nodes (15 implementiert):**
- Quelle: Bild ✅, Text ✅, Video ✅ (Phase 2 vorgezogen), Asset ✅ (Phase 2 vorgezogen)
- KI-Ausgabe: Prompt ✅, KI-Bild (`ai-image`) ✅
- Bildbearbeitung: Kurven ✅ (Phase 2 vorgezogen), Farbe ✅ (Phase 2 vorgezogen), Licht ✅ (Phase 2 vorgezogen), Detail ✅ (Phase 2 vorgezogen), Render ✅ (Phase 2 vorgezogen)
- Canvas & Layout: Gruppe ✅, Frame ✅, Notiz ✅, Compare ✅

**Infrastruktur & Features:**

| Task | Status |
|------|--------|
| Projektsetup: Next.js 16 + Tailwind v4 + ShadCN | ✅ Erledigt |
| Convex Self-hosted Backend | ✅ Erledigt |
| Basis-Canvas mit @xyflow/react | ✅ Erledigt |
| Drag & Drop von Bildern | ✅ Erledigt |
| Authentifizierung via Better Auth + Magic Link | ✅ Erledigt |
| OpenRouter Integration (Gemini 2.5 Flash Image) | ✅ Erledigt |
| Credit-System: Balance, Reservation+Commit | ✅ Erledigt |
| Abo-Verwaltung: Free/Starter/Pro/Max Tiers | ✅ Erledigt |
| Polar Integration: Checkout, Webhooks | ✅ Erledigt |
| Credit-Nachkauf: Fixe Top-Ups + Custom | ✅ Erledigt |
| Node-Status-Modell (idle/executing/done/error) | ✅ Erledigt |
| WebGL Image Pipeline (Adjustments) | ✅ Erledigt |
| Resizable Sidebar mit Rail-Mode | ✅ Erledigt |
| Offline Sync (IndexedDB Queue) | ✅ Erledigt |
| Optimistic Updates + ID-Remapping | ✅ Erledigt |
| Auth Race-Härtung | ✅ Erledigt |
| Canvas Modularisierung | ✅ Erledigt |
| Asset Browser (Stock-Fotos, Vektoren) | ✅ Erledigt |
| Video Browser | ✅ Erledigt |
| Connection Policy (Edge-Validierung) | ✅ Erledigt |
| Adjustment Presets (Built-in + User-defined) | ✅ Erledigt |
| Vollständige OpenRouter Image Gen (alle 9 Modelle + Tier-Enforcement) | ✅ Erledigt |
| Tier-aware Model Selector im Prompt-Node | ✅ Erledigt |
| Dashboard Snapshot Cache (gebündelte Query + localStorage) | ✅ Erledigt |
| Credits Activity Analytics (Recharts Chart) | ✅ Erledigt |
| Canvas Graph Query Cache (Performance-Optimierung) | ✅ Erledigt |
| AI Modularisierung (`ai_errors.ts`, `ai_retry.ts`, `ai_node_data.ts`) | ✅ Erledigt |
| docker-compose.yml + .env.example + Setup-README | ☐ Offen |

### Phase 2 — KI-Features

**Nodes:**
- Quelle: Farbe / Palette
- KI-Ausgabe: KI-Text, KI-Video
- Transformation: Crop / Resize ✅ (implementiert), BG entfernen, Upscale
- Steuerung: Splitter, Loop, Agent
- Canvas & Layout: Text-Overlay

**Infrastruktur & Features:**

| Task | Status |
|------|--------|
| OpenRouter Text/Reasoning Integration (GPT-5.4 Nano/Mini/Pro) | ☐ Offen |
| Agent Node: Analyse, Clarification, Execution, Output | ☐ Offen |
| Skeleton-Nodes: Platzierung nach Plan-Erstellung | ☐ Offen |
| Browser Notifications API (opt-in, Tab-Wechsel) | ☐ Offen |
| Erster Agent Template: Instagram Curator | ☐ Offen |
| Self-hosted KI-Services (rembg, Real-ESRGAN) | ☐ Offen |
| Prompt-History und Re-Generation | ☐ Offen |
| Text-Overlay Node | ☐ Offen |

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
| Performance-Optimierung für große Canvases | ✅ Erledigt |

---

## 12. Offene Entscheidungen

| Thema | Entscheidung / Status |
|-------|----------------------|
| Authentifizierung | ✅ Better Auth (self-hosted, open-source) |
| Tailwind v4 | ✅ v4 ist Standard, keine Migration nötig |
| Pricing / Credit-System | ✅ Credit-Abstraktion (1 Cr = €0,01 intern), 4 Tiers, Reservation+Commit, Top-Up |
| Payment Provider | ✅ Polar (Merchant of Record, VAT-Handling) |
| Self-Hosting-Strategie | ✅ docker-compose.yml + .env.example + README |
| Convex Lock-in | ✅ Bewusst akzeptiert; Migrations-Pfad: Convex Cloud EU |
| OpenRouter Image-Modelle | ✅ Alle 9 Modelle aktiv mit serverseitigem Tier-Enforcement |
| Lizenz | ✅ BSL 1.1, 3 Jahre Change Date, Apache 2.0 |
| Repo-Strategie | ✅ Zwei unabhängige Repos, Auth-Cookie-Sharing |
| Job Queue | ✅ Convex native (Phase 1), externe Lösung bei Bedarf |
| E-Mail | ✅ Unsend + Stalwart, self-hosted |
| Analytics | ✅ Rybbit, self-hosted |
| Error Tracking | ✅ Sentry Cloud (Free Tier) |
| Cache-Strategie | ✅ Cloudflare (Edge) + Redis (Application) |
| E2E-Testing | ✅ Kein E2E in Phase 1 |
| UX-Latenzen | ✅ Node-Status-Modell, Skeleton-Nodes |
| Credit Fehlerbehandlung | ✅ Reservation + Commit |
| Bildbearbeitung: Rendering-Engine | ✅ WebGL + GLSL Shader als primäre Engine. WASM-Backend vorbereitet |
| Bildbearbeitung: Preset-Persistierung | ✅ User-Presets in Convex (`adjustmentPresets`-Tabelle) |
| Offline Sync | ✅ IndexedDB Queue + localStorage Cache + Optimistic Updates |
| Kollaborationstiefe | ⏳ Cursor-Sync, gleichzeitige Edits, Kommentare |
| Agent Clarification UX | ⏳ Inline am Node vs. Modal vs. Chat-Sidebar |
| Agent Template Format | ⏳ Markdown-Datei vs. strukturiertes JSON-Schema |
| Weiche: Bedingungslogik | ⏳ Visueller Rule-Builder vs. Ausdruckssprache |
| Mixer: Blend Modes | ⏳ min. Normal, Multiply, Screen, Overlay |
| OpenRouter Text/Reasoning | ✅ GPT-5.4 Nano/Mini/Pro als Agent-Modelle (via `agent-models.ts`) |
| Canvas-Export | ✅ PNG, ZIP (via @napi-rs/canvas + JSZip) |

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
| Offline-Fähigkeit | Canvas-Sync via IndexedDB Queue; Optimistic Updates mit ID-Remapping |

---

## 14. Nächste Schritte

1. docker-compose.yml + .env.example + Setup-README ausarbeiten
2. Agent Node: Analyse, Clarification, Execution, Output
3. Self-hosted KI-Services (rembg, Real-ESRGAN, GFPGAN)
4. Transformation-Nodes (BG entfernen, Upscale)
5. Echtzeit-Kollaboration via Convex Subscriptions
6. Weitere KI-Modelle (KI-Text, KI-Video)

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

*LemonSpace PRD v2.2 — April 2026*
