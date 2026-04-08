# 🍋 LemonSpace — Produkt-Manifest

**v2.1 — April 2026**

*Self-Hosted, Source-Available Creative Workspace*

---

## 1. Vision

LemonSpace ist eine self-hosted, source-available Alternative zu Freepik Spaces. Eine visuelle Arbeitsfläche, auf der kreative Teams aus wenigen Input-Assets schnell kampagnenfähige Bildvarianten erzeugen — mit KI-gestützter Generierung, non-destruktiver Bildbearbeitung, durchdachter Latenz-UX und voller Kontrolle über ihre Daten.

Das Produkt positioniert sich nicht als generisches „AI Creative Workspace", sondern löst ein spezifisches Problem: **Vom Rohbild zur fertigen Kampagnenvariante in Minuten statt Stunden** — auf eigener Infrastruktur oder als gehosteter Service.

---

## 2. Problemstellung

Freepik Spaces zeigt, dass KI-gestützte Canvas-Workflows funktionieren. Aber:

- Proprietäres SaaS ohne Self-Hosting-Option
- Abhängig von Freepiks Pricing, Modellauswahl und Verfügbarkeit
- Keine Anpassbarkeit oder Erweiterbarkeit
- Datenschutzbedenken bei kreativen Assets auf fremden Servern

---

## 3. Primärer ICP

**Kleine Design- und Marketing-Teams (2–10 Personen)**, die aus wenigen Input-Assets schnell kampagnenfähige Bildvarianten erzeugen wollen, ohne ihre Daten in generischen SaaS-Tools zu verstreuen.

### Typisches Profil

- In-House-Designteam oder kleine Agentur
- Regelmäßig Social-Media-, Kampagnen- oder Produktbilder
- Entscheider oder Budget-Owner für Creative-Tools
- Datenschutz und Kontrolle über Assets sind kaufentscheidend

> **Sekundäre Segmente (nicht Phase 1):** Entwickler/Tech-Teams (Self-Hosted-Anpassung), Compliance-sensible Unternehmen (Regulatorik), Open-Source-Community (Contributions). Diese Segmente werden adressiert, sobald der Kern-Job für den primären ICP validiert ist.

---

## 4. Der eine MVP-Job

Phase 1 löst genau einen End-to-End-Job so gut, dass Nutzer wiederkommen oder zahlen:

> **Upload Bilder → Prompt / Brief → Bildvarianten generieren → Bearbeiten (Adjustments) → Vergleichen → Export**
>
> *Alles, was diesen Flow nicht direkt besser macht, ist erstmal verdächtig.*

### Konkret bedeutet das für Phase 1

1. Nutzer lädt 1–5 Produktbilder auf den Canvas (Bild-Node)
2. Schreibt einen Prompt oder Brief direkt am Canvas (Prompt-Node)
3. Generiert 4–8 Bildvarianten per KI (KI-Bild-Nodes)
4. Wendet non-destruktive Bildbearbeitung an (Kurven, Farbe, Licht, Detail)
5. Vergleicht Ergebnisse nebeneinander (Compare-Node)
6. Exportiert fertige Varianten als PNG (Export)

> **Phase-1-Umfang erweitert (v2.0):** Video- und Asset-Nodes wurden vorgezogen, Bildbearbeitungs-Nodes (Kurven, Farbe, Licht, Detail, Render) mit vollständiger WebGL-Pipeline implementiert. Der MVP-Job umfasst jetzt auch die non-destruktive Bildbearbeitung als integralen Bestandteil.

---

## 5. Node-System — Phase 1

15 Node-Typen sind in Phase 1 implementiert. Die vollständige Node-Taxonomie (6 Kategorien, 27 Node-Typen) wird im PRD dokumentiert.

| Node | Kategorie | Implementiert | Rolle im MVP-Job |
|------|-----------|---------------|------------------|
| Bild | Quelle | ✅ | Upload eigener Bilder (PNG, JPG, WebP) oder Einbindung per URL |
| Text | Quelle | ✅ | Freitextfeld für Copy, Brief, Beschreibungen |
| Video | Quelle | ✅ | Video-Upload und Playback |
| Asset | Quelle | ✅ | Stock-Assets aus Asset Browser |
| Prompt | KI-Ausgabe | ✅ | Dedizierter Node für Modellinstruktionen |
| KI-Bild | KI-Ausgabe | ✅ | Output eines Bildgenerierungs-Calls |
| Kurven | Bildbearbeitung | ✅ | Tonwert-Kurven, Levels, Histogram |
| Farbe | Bildbearbeitung | ✅ | HSL, Color Balance, Temperature/Tint |
| Licht | Bildbearbeitung | ✅ | Brightness, Contrast, Exposure, HDR, Vignette |
| Detail | Bildbearbeitung | ✅ | Sharpen, Clarity, Denoise, Grain |
| Render | Bildbearbeitung | ✅ | Materialisiert den Adjustment-Stack als neues Bild |
| Gruppe | Layout | ✅ | Container für Nodes, Collapse/Expand |
| Frame | Layout | ✅ | Artboard mit definierter Auflösung |
| Notiz | Layout | ✅ | Annotation auf dem Canvas |
| Compare | Layout | ✅ | Zwei Bilder nebeneinander mit Slider |

### Ausblick: Spätere Phasen

**Phase 2:** Farbe/Palette (Quelle), KI-Text, KI-Video (KI-Ausgabe), Crop/Resize, BG entfernen, Upscale (Transformation), Splitter, Loop, Agent (Steuerung), Text-Overlay (Layout).

**Phase 3:** Style Transfer, Gesicht (Transformation), Mixer, Weiche (Steuerung), Kommentar, Präsentation (Layout).

---

## 6. UX-Prinzipien

Die UX-Strategie für Latenzen ist **Kern-DNA des Produkts**, nicht Nice-to-have. Sie unterscheidet LemonSpace von Tools, die KI-Wartezeiten als globale Spinner behandeln.

### Node-Status-Modell

Jeder ausführende Node zeigt seinen Zustand visuell direkt auf dem Canvas:

```
idle → analyzing → clarifying → executing (Step X/N) → done | error
```

Bei Fehler: Error-State direkt am Node mit kurzem Hinweis („Timeout — Credits wurden nicht abgebucht"). Kein globales Loading-Banner, kein blockierendes Modal.

### Skeleton Nodes

Sobald ein Agent seinen Execution-Plan erstellt hat, erscheinen Skeleton-Nodes auf dem Canvas — noch bevor API-Calls laufen. Skeletons sind verschiebbar, zeigen Node-Typ-Icons und füllen sich sequenziell mit echten Outputs. Visuell: gedimmter Rahmen mit Shimmer-Effekt.

### Browser Notifications

Opt-in via Browser Notifications API: Bei Tab-Wechsel und fertigem Job erhält der Nutzer eine native Benachrichtigung. Nicht erzwungen.

### Offline-Sync & Optimistic Updates

- **IndexedDB-Sync-Queue:** Persistente Queue für Canvas-Mutations mit Retry-Backoff und 24h-TTL
- **localStorage-Cache:** Snapshot + leichtgewichtiger Op-Mirror für sofortige UI
- **Optimistic IDs:** Temporäre IDs mit `optimistic_`-Prefix, automatisches Remapping bei Server-Bestätigung

---

## 7. Bewusste Entscheidungen

Kompakt statt erschöpfend. Details wandern in eigene Architecture Decision Records (ADRs).

| Thema | Entscheidung | Status |
|-------|-------------|--------|
| Backend | Convex (self-hosted). Bewusster Lock-in für Realtime, Storage, Jobs. Migrations-Pfad: Convex Cloud EU. | ✅ |
| Auth | Better Auth + Magic Link (via polar-sh/better-auth plugin) | ✅ |
| AI Layer | OpenRouter als primäre AI-Schicht. Alle 9 Image-Modelle aktiv, serverseitiges Tier-Enforcement, tier-aware Model Selector. | ✅ |
| Self-hosted KI | rembg, Real-ESRGAN, GFPGAN — kostenlos, separate Repos | ✅ |
| Payment | Polar.sh (MoR, VAT, Better Auth Plugin @polar-sh/better-auth) | ✅ |
| Credits | Reservation + Commit. Credit-Abstraktion (1 Cr = €0,01 OR intern). Markup: 2× Bild, 2,5–3× Agent. | ✅ |
| Pricing | 4 Tiers: Free (50 Cr) / Starter €8 (400 Cr) / Pro €59 (3.300 Cr) / Max €119 (6.700 Cr). ≥29% Marge. Top-Up: fix + Custom. | ✅ |
| Lizenz | BSL 1.1, 3J Change Date → Apache 2.0. Private Nutzung frei. | ✅ |
| Repo-Strategie | Zwei unabhängige Repos (lemonspace-web + lemonspace-landing). Auth-Cookie-Sharing via `.lemonspace.io`. | ✅ |
| Frontend | Next.js 16 + Tailwind v4 + ShadCN | ✅ |
| Canvas | @xyflow/react + dnd-kit | ✅ |
| Bildbearbeitung | WebGL + GLSL Shader als primäre Engine. WASM-Backend vorbereitet. Client-seitig, credit-frei. | ✅ |
| Preset-Persistierung | User-Presets in Convex (`adjustmentPresets`-Tabelle) | ✅ |
| Offline Sync | IndexedDB Queue + localStorage Cache + Optimistic Updates | ✅ |
| Sidebar | Resizable via react-resizable-panels, Rail-Mode (collapsible) | ✅ |
| E-Mail | useSend + Stalwart (Self-Hosted). Für lemonspace.app pragmatisch externer SMTP möglich. | ✅ |
| Kollaboration | Phase 3. Phase 1 fokussiert auf Solo-/Kleinteam-Workflows. | ⏳ |

---

## 8. Was wir bewusst nicht bauen (Phase 1)

Fokus heißt Nein sagen. Diese Features sind bewusst ausgeklammert, nicht vergessen:

| Feature | Warum nicht jetzt |
|---------|-------------------|
| Echtzeit-Kollaboration | Kein Kernbedürfnis des primären ICP in Phase 1. Solo-/Kleinteam reicht. |
| Agent Nodes | Zu komplex für MVP. Erst bauen, wenn der Basis-Job validiert ist. |
| Video-Generierung | Anderer Job, andere Kosten, anderer ICP. |
| Style Transfer / GFPGAN | Transformation-Nodes kommen in Phase 2–3. |
| Team-Features | Workspaces, Rollen, Rechte, Seat-Management — erst wenn Business-Tier validiert. |
| docker-compose.yml | Self-Hosting dokumentieren, aber nicht den Hosted-MVP verzögern. |
| E2E-Testing | Neubewertung bei Skalierung. |


---

## 9. Erfolgskriterien

Ohne messbare Ziele ist jedes PRD Wünsch-dir-was. Diese Metriken entscheiden, ob Phase 1 funktioniert:

### Produkt-Metriken

| Metrik | Ziel (Phase 1) | Messung |
|--------|----------------|---------|
| Time to first output | < 3 Minuten | Onboarding-Flow-Tracking |
| Erfolgsquote pro Generierung | > 90% | API-Success-Rate |
| Median-Latenz Bildgenerierung | < 10 Sekunden | Node-Status-Events |
| Export-Rate | > 40% der Sessions | Export-Events |
| D7-Retention | > 25% | Rybbit Analytics |
| W4-Retention | > 15% | Rybbit Analytics |

### Business-Metriken

| Metrik | Ziel (6 Monate) | Messung |
|--------|-----------------|---------|
| Conversion Free → Paid | > 5% | Polar Events |
| COGS pro aktivem Workspace | < 70% des Credit-Werts | OpenRouter-Kosten / aktive User |
| MRR | €2.000+ | Polar Dashboard |
| Churn (monatlich) | < 8% | Subscription-Events |

---

## 10. Abuse Prevention & Guardrails

Ein AI-Kreativtool mit Free-Tier und Premium-Modellen braucht von Tag 1 Schutzmaßnahmen. Kein Randthema.

### Implementierte Maßnahmen

- Daily Generation Caps pro Tier (Free: 10/Tag, Starter: 50, Pro: 200, Max: 500)
- Concurrency Limits: max. 2 parallele Generierungen (Free: 1)
- Rate Limiting auf allen API-Endpunkten (Redis-backed)
- Premium-Modelle erst ab Starter-Tier (Free nur Budget-Modelle)
- Top-Up-Limit pro Monat
- Account-Verifizierung per E-Mail

---

## 11. Lizenz-Klarstellung

LemonSpace ist **Source Available**, nicht Open Source.

| | Community Use | Commercial Self-Host | Hosted SaaS |
|---|---|---|---|
| Zugang | Quellcode öffentlich | Separate Lizenz | lemonspace.app |
| Kosten | Kostenlos | Lizenzgebühr (TBD) | Abo-Tiers |
| Nutzung | Privat / persönlich | Unternehmen, produktiv | Jeder |
| Self-hosted KI | Kostenlos | Kostenlos | Kostenlos |
| Support | Community | E-Mail | In-App |

BSL 1.1 mit 3-Jahres-Change-Date zu Apache 2.0. Nach Change Date ist jedes Release vollständig Apache-2.0-lizenziert.

---

## 12. Nächste Schritte

Priorisiert nach Abhängigkeiten. Jeder Schritt hat ein klares Artefakt.

| # | Schritt | Artefakt | Status |
|---|---------|----------|--------|
| 1 | Repos scaffolden | `lemonspace-web` + `lemonspace-landing` | ✅ |
| 2 | Convex Schema entwerfen | Schema-Datei mit Node-Typen + Credit-System | ✅ |
| 3 | Basis-Canvas mit @xyflow/react | Funktionierender Canvas mit Bild- und Prompt-Nodes | ✅ |
| 4 | OpenRouter-Prototyp | Image Gen (Gemini 2.5 Flash) funktioniert im Canvas | ✅ |
| 5 | Compare + Export | PNG-Export aus Frame-Nodes | ✅ |
| 6 | Better Auth + Polar + Credit-System | Login, Checkout, Balance-Tracking, Reservation+Commit | ✅ |
| 7 | Polar Webhook-Handling | Subscription-Events, automatische Credit-Zuweisung | ✅ |
| 8 | WebGL Image Pipeline | Adjustment-Nodes mit GLSL-Shadern | ✅ |
| 9 | Vollständige OpenRouter Integration | Alle 9 Modelle + Modellauswahl-UI | ✅ |
| 10 | Agent Node | Analyse, Clarification, Execution, Output | ☐ |
| 11 | Self-hosted KI-Services | rembg, Real-ESRGAN, GFPGAN | ☐ |
| 12 | docker-compose.yml + Setup-README | Self-Hosting-Anleitung | ☐ |
| 13 | Dashboard Snapshot + Analytics | Gebündelte Query, localStorage-Cache, Credits-Activity-Chart | ✅ |

---

## 13. Ausgelagerte Dokumente

Folgende Themen werden in eigenen Dokumenten vertieft. Das Manifest bleibt schlank.

| Dokument | Inhalt |
|----------|--------|
| PRD | Vollständige Node-Taxonomie, Tech Stack, Datenmodell, Pricing-Details, Phasen-Plan |
| System Design Doc | Tech Stack mit Versionen, Zwei-Repo-Strategie, Infra-Details, Convex-Architektur, Redis, Cloudflare |
| Credit & Pricing Doc | Detaillierte Pricing-Tabellen, Credit-Abstraktion, Tier-Kalkulation, Top-Up-System, Reservation+Commit-Flow |
| Self-Hosting Guide | docker-compose.yml, .env.example, Setup-README, Coolify-Anleitung |
| ADR-Sammlung | Architecture Decision Records für Convex, OpenRouter, BSL 1.1, WebGL, etc. |
| CLAUDE.md (pro Ordner) | Implementierungsdokumentation, synchronisiert mit Codebase |

---

*LemonSpace Manifest v2.1 — April 2026*
