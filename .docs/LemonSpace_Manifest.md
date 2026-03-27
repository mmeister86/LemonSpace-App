# 🍋 LemonSpace — Produkt-Manifest

**v1.4 — März 2026**

*Self-Hosted, Source-Available Creative Workspace*

---

## 1. Vision

LemonSpace ist eine self-hosted, source-available Alternative zu Freepik Spaces. Eine visuelle Arbeitsfläche, auf der kreative Teams aus wenigen Input-Assets schnell kampagnenfähige Bildvarianten erzeugen — mit KI-gestützter Generierung, durchdachter Latenz-UX und voller Kontrolle über ihre Daten.

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

> **Upload Bilder → Prompt / Brief → Bildvarianten generieren → Vergleichen → Export**
>
> *Alles, was diesen Flow nicht direkt besser macht, ist erstmal verdächtig.*

### Konkret bedeutet das für Phase 1

1. Nutzer lädt 1–5 Produktbilder auf den Canvas (Bild-Node)
2. Schreibt einen Prompt oder Brief direkt am Canvas (Prompt-Node — jetzt Phase 1)
3. Generiert 4–8 Bildvarianten per KI (KI-Bild-Nodes)
4. Vergleicht Ergebnisse nebeneinander (Compare-Node — jetzt Phase 1)
5. Exportiert fertige Varianten als PNG oder ZIP (Export — jetzt Phase 1)

> **Inkonsistenzen aus v1.0 behoben:** Prompt-Node und Compare-Node sind in Phase 1 vorgezogen, weil sie für den Kern-Job essenziell sind. Export (PNG/ZIP) ist ebenfalls Phase 1 — ohne Export gibt es kein „Job done".

---

## 5. Node-System — Phase 1

Nur die Nodes, die den MVP-Job ermöglichen. Die vollständige Node-Taxonomie (5 Kategorien, 25+ Node-Typen) wird in einem separaten **Node Spec Doc** dokumentiert.

| Node | Kategorie | Rolle im MVP-Job |
|------|-----------|------------------|
| Bild | Quelle | Upload eigener Bilder (PNG, JPG, WebP) oder Einbindung per URL |
| Text | Quelle | Freitextfeld für Copy, Brief, Beschreibungen — semantisch kein Prompt |
| Prompt | Quelle | Dedizierter Node für Modellinstruktionen. Verbindet sich mit KI-Nodes |
| KI-Bild | KI-Ausgabe | Output eines Bildgenerierungs-Calls. Speichert Prompt, Modell, Parameter |
| Gruppe | Layout | Container für Nodes. Collapse/Expand, benannte Scopes |
| Frame | Layout | Artboard mit definierter Auflösung. Export-Boundary für PNG/ZIP |
| Notiz | Layout | Annotation auf dem Canvas. Markdown, kein Datenanschluss |
| Compare | Layout | Zwei Bilder nebeneinander mit interaktivem Slider |

### Ausblick: Spätere Phasen

Transformation (BG entfernen, Upscale, Crop), Steuerung & Flow (Splitter, Loop, Agent, Mixer, Weiche), erweiterte Layout-Nodes (Text-Overlay, Kommentar, Präsentation) und weitere Quell-Nodes (Video, Asset, Farbe/Palette). Details im Node Spec Doc.

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

---

## 7. Bewusste Entscheidungen

Kompakt statt erschöpfend. Details wandern in eigene Architecture Decision Records (ADRs).

| Thema | Entscheidung | Status |
|-------|-------------|--------|
| Backend | Convex (self-hosted). Bewusster Lock-in für Realtime, Storage, Jobs. Migrations-Pfad: Convex Cloud EU. | ✅ |
| Auth | Better Auth (self-hosted, open-source) | ✅ |
| AI Layer | OpenRouter als primäre AI-Schicht. 9 Image-Modelle, Text/Reasoning via Claude / GPT. | ✅ |
| Self-hosted KI | rembg, Real-ESRGAN, GFPGAN — kostenlos, separate Repos | ✅ |
| Payment | Polar.sh (MoR, VAT, Better Auth Plugin @polar-sh/better-auth) | ✅ |
| Credits | Reservation + Commit. Credit-Abstraktion (1 Cr = €0,01 OR intern). Markup: 2× Bild, 2,5–3× Agent. | ✅ |
| Pricing | 4 Tiers: Free (50 Cr) / Starter €8 (400 Cr) / Pro €59 (3.300 Cr) / Max €119 (6.700 Cr). ≥29% Marge nach LS + USt. Top-Up: fix (€5/€10/€20/€50) + Custom (€5–200, Bonus-Staffel 0–13%). | ✅ |
| Lizenz | BSL 1.1, 3J Change Date → Apache 2.0. Private Nutzung frei. | ✅ |
| Repo-Strategie | Zwei unabhängige Repos (lemonspace-web + lemonspace-landing). Auth-Cookie-Sharing via `.lemonspace.io`. | ✅ |
| Frontend | Next.js 16 + Tailwind v4 + ShadCN | ✅ |
| Canvas | @xyflow/react + dnd-kit | ✅ |
| E-Mail | useSend + Stalwart (Self-Hosted). Für lemonspace.app pragmatisch externer SMTP möglich. | ✅ |
| Kollaboration | Phase 3. Phase 1 fokussiert auf Solo-/Kleinteam-Workflows. | ⏳ |
| Abuse Prevention | Daily Caps, Concurrency Limits, Freemium-Guardrails — Design TBD. | ⏳ |

---

## 8. Was wir bewusst nicht bauen (Phase 1)

Fokus heißt Nein sagen. Diese Features sind bewusst ausgeklammert, nicht vergessen:

| Feature | Warum nicht jetzt |
|---------|-------------------|
| Echtzeit-Kollaboration | Kein Kernbedürfnis des primären ICP in Phase 1. Solo-/Kleinteam reicht. |
| Agent Nodes | Zu komplex für MVP. Erst bauen, wenn der Basis-Job validiert ist. |
| Video-Generierung | Anderer Job, andere Kosten, anderer ICP. |
| Freepik Asset Browser | Nice-to-have, nicht Kern-Job. |
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

### Geplante Maßnahmen

- Daily Generation Caps pro Tier (Free: 10/Tag, Starter: 50, Pro: 200, Max: 500)
- Concurrency Limits: max. 2 parallele Generierungen (Free: 1)
- Rate Limiting auf allen API-Endpunkten (Redis-backed)
- Premium-Modelle erst ab Starter-Tier (Free nur Budget-Modelle)
- Top-Up-Limit pro Monat (verhindert Missbrauch des Selbstkostenpreises)
- Account-Verifizierung per E-Mail, optional Telefon bei Abuse-Verdacht

> **Offene Entscheidung:** Konkretes Design der Caps und Limits wird nach ersten Nutzungsdaten kalibriert. Initiale Werte sind konservativ.

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

| # | Schritt | Artefakt |
|---|---------|----------|
| 1 | Repos scaffolden | `lemonspace-web` (Next.js + Convex + BetterAuth) + `lemonspace-landing` (Next.js) |
| 2 | Convex Schema entwerfen | Schema-Datei mit Node-Typen + Credit-System |
| 3 | Basis-Canvas mit @xyflow/react | Funktionierender Canvas mit Bild- und Prompt-Nodes |
| 4 | OpenRouter-Prototyp | Image Gen (Gemini 2.5 Flash) funktioniert im Canvas |
| 5 | Compare + Export | PNG/ZIP-Export aus Frame-Nodes |
| 6 | Better Auth + Polar + Credit-System | Login, Polar Checkout via @polar-sh/better-auth, Balance-Tracking, Reservation+Commit |
| 7 | Polar Webhook-Handling | Subscription-Events, automatische Credit-Zuweisung |

---

## 13. Ausgelagerte Dokumente

Folgende Themen werden in eigenen Dokumenten vertieft. Das Manifest bleibt schlank.

| Dokument | Inhalt |
|----------|--------|
| System Design Doc | Tech Stack mit Versionen, Zwei-Repo-Strategie, Infra-Details, Convex-Architektur, Redis, Cloudflare |
| Node Spec Doc | Vollständige Node-Taxonomie (5 Kategorien, 25+ Typen), Datenmodell pro Node-Typ |
| Credit & Pricing Doc | Detaillierte Pricing-Tabellen, Credit-Abstraktion, Tier-Kalkulation (nach LS + USt), Top-Up-System (fix + Custom mit Bonus-Staffel), Reservation+Commit-Flow, Agent Partial Failure |
| Self-Hosting Guide | docker-compose.yml, .env.example, Setup-README, Coolify-Anleitung |
| ADR-Sammlung | Architecture Decision Records für Convex, OpenRouter, BSL 1.1, useSend, etc. |

---

*LemonSpace Manifest v1.4 — März 2026*
