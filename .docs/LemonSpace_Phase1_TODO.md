# 🍋 LemonSpace — Phase 1 MVP TODO

## 1. Projekt-Setup & Infrastruktur

- [ ] `lemonspace-web` Repo scaffolden (Next.js 16 + Tailwind v4 + ShadCN + Convex + BetterAuth)
- [ ] `lemonspace-landing` Repo scaffolden (Next.js 16 + Tailwind v4 + ShadCN)
- [ ] Auth-Cookie-Sharing: BetterAuth Cookie auf `.lemonspace.io` setzen, Landing Page liest Login-State
- [ ] Convex Self-hosted Backend aufsetzen (via Coolify)
- [ ] Redis aufsetzen (via Coolify)
- [ ] Sentry Cloud anbinden (Free Tier)
- [ ] Cloudflare DNS + DDoS-Schutz konfigurieren
- [ ] Rybbit Analytics deployen (via Coolify)
- [ ] useSend + Stalwart E-Mail-Stack deployen (via Coolify)

## 2. Authentifizierung

- [ ] Better Auth integrieren (Self-hosted)
- [ ] Login / Signup Flow
- [ ] E-Mail-Verifizierung (via useSend)
- [ ] Session-Management

## 3. Canvas — Kernfunktion

- [ ] Basis-Canvas mit @xyflow/react
- [ ] Zoom, Pan, Navigation
- [ ] Drag & Drop von Bildern via dnd-kit
- [ ] Node-Rendering-System (typisierte Bausteine)
- [ ] Node-Verbindungen (Edges) zwischen kompatiblen Nodes
- [ ] Gruppierung und Layering von Canvas-Elementen

## 4. Phase-1-Nodes

### Quelle
- [ ] **Bild-Node** — Upload (PNG, JPG, WebP) + URL-Einbindung
- [ ] **Text-Node** — Freitextfeld mit Markdown-Support
- [ ] **Prompt-Node** — Dedizierter Node für Modellinstruktionen, verbindet sich mit KI-Nodes

### KI-Ausgabe
- [ ] **KI-Bild-Node** — Output eines Bildgenerierungs-Calls, speichert Prompt, Modell, Parameter

### Canvas & Layout
- [ ] **Gruppe-Node** — Container, Collapse/Expand, benannte Scopes
- [ ] **Frame-Node** — Artboard mit definierter Auflösung, Export-Boundary
- [ ] **Notiz-Node** — Annotation, Markdown-Support, kein Datenanschluss
- [ ] **Compare-Node** — Zwei Bilder nebeneinander mit interaktivem Slider

## 5. KI-Integration

- [ ] OpenRouter-Anbindung (Image Generation)
- [ ] Initiales Modell: Gemini 2.5 Flash Image
- [ ] Modellauswahl-UI (mindestens Budget/Standard/Premium)
- [ ] Prompt → KI-Bild-Generierung End-to-End im Canvas
- [ ] Node-Status-Modell implementieren (`idle → executing → done | error`)
- [ ] Error-State direkt am Node mit Hinweistext

## 6. Credit-System

- [ ] Convex Schema: `CreditBalance` (balance, reserved, available, monthlyAllocation)
- [ ] Convex Schema: `CreditTransaction` (amount, type, status, nodeId, openRouterCost)
- [ ] Convex Schema: `Subscription` (tier, status, periodStart/End, lemonSqueezyId)
- [ ] Reservation + Commit Flow implementieren
- [ ] Kosten-Voranzeige vor Generierung
- [ ] OpenRouter-Preise cachen (Redis, TTL ~10min)
- [ ] Credit-Balance-Anzeige in der UI

## 7. Pricing & Payment

- [ ] Lemon Squeezy Integration: Checkout-Flow
- [ ] Webhook-Handling für Subscription-Events
- [ ] Automatische Credit-Zuweisung bei Abo-Start / Abo-Verlängerung
- [ ] 4 Tiers anlegen: Free (€0,50) / Starter €9 / Pro €49 / Business €99
- [ ] Credit-Nachkauf (Top-Up) zum Selbstkostenpreis

## 8. Abuse Prevention

- [ ] Daily Generation Caps (Free: 10, Starter: 50, Pro: 200, Business: 500)
- [ ] Concurrency Limits (Free: 1, Paid: 2 parallele Generierungen)
- [ ] Rate Limiting auf API-Endpunkten (Redis-backed)
- [ ] Premium-Modelle erst ab Starter-Tier
- [ ] Top-Up-Limit pro Monat

## 9. Export

- [ ] PNG-Export aus Frame-Nodes
- [ ] ZIP-Export (mehrere Frames / Varianten)

## 10. Convex Schema (Gesamtübersicht)

- [ ] `Canvas` — id, name, ownerId, createdAt, updatedAt
- [ ] `Node` — id, canvasId, type, position, size, data, createdAt
- [ ] `Edge` — id, canvasId, sourceNodeId, targetNodeId
- [ ] `CreditBalance` — siehe Credit-System
- [ ] `CreditTransaction` — siehe Credit-System
- [ ] `Subscription` — siehe Credit-System
- [ ] `User` — id, email, name, avatarUrl, createdAt

## 11. Nicht Phase 1 (bewusst ausgeklammert)

- Echtzeit-Kollaboration
- Agent Nodes
- Video-Generierung
- Freepik Asset Browser
- Style Transfer / GFPGAN / rembg / Real-ESRGAN
- Team-Features (Workspaces, Rollen, Rechte)
- docker-compose.yml für Self-Hosting
- E2E-Testing

---

*Reihenfolge orientiert sich an den Abhängigkeiten aus dem Manifest v1.2:*
*Repos scaffolden → Convex Schema → Canvas → OpenRouter → Compare + Export → Auth + Credits → Lemon Squeezy*
