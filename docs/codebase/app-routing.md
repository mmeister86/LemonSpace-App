# App Routing, i18n und Next.js Integration

`app/` enthält die Next.js 16 App-Router-Oberfläche: Root Layout, globale Styles, Auth-Routen, API-Routes, Dashboard und die authentifizierten Canvas-/Billing-Seiten.

**Arbeitskontext:** [`app/CLAUDE.md`](../../app/CLAUDE.md). Dieses Dokument ist hilfreich, aber teilweise stale: Provider/Auth/Sentry werden aktuell nicht mehr ausschließlich im Root Layout gesetzt, sondern in `app/dashboard/layout.tsx` und `app/(app)/layout.tsx`.

## Hauptflows

- **Landing:** `app/page.tsx` prüft Auth und leitet eingeloggte Nutzer nach `/dashboard`.
- **Dashboard:** `app/dashboard/page.tsx` schützt serverseitig, `page-client.tsx` lädt Snapshot, Credits, Canvases und Media-Preview.
- **Canvas:** `app/(app)/canvas/[canvasId]/page.tsx` schützt serverseitig, validiert Canvas-Besitz und rendert `CanvasShell`.
- **Auth:** Eigene Sign-in/-up-Seiten plus Better-Auth catch-all UI/API.
- **i18n:** `routing.ts`, `i18n/request.ts`, `messages/de.json`, `messages/en.json` definieren deutsch/englische Lokalisierung ohne URL-Präfix.
- **Observability:** Sentry läuft über `instrumentation*.ts` und `sentry.*.config.ts`; Rybbit wird im Root Layout eingebunden.

## Root App-Dateien

| Datei | Verantwortung |
|-------|---------------|
| `app/layout.tsx` | Server Root Layout: Manrope Font, Metadata, Locale/Messages/Timezone via `next-intl`, Rybbit Analytics, `RootProviders`. |
| `app/page.tsx` | Landing-/Redirect-Seite: Authenticated → `/dashboard`, sonst minimaler LemonSpace-Einstieg mit Sign-in/-up Links. |
| `app/globals.css` | Tailwind v4 Entry, LemonSpace OKLCH Design Tokens, Light/Dark Themes, React-Flow/Editor.js Overrides, Canvas-spezifische Cursor/Animationen. |
| `app/error.tsx` | Route Error Boundary mit Sentry Capture, Sanitized Logging und deutschem Retry UI. |
| `app/global-error.tsx` | Global Error Boundary mit eigener `<html>/<body>`-Fallback-Struktur, Sentry und Digest-Anzeige. |
| `app/favicon.ico` | Standard App-Router-Favicon; als statisches Asset niedrig priorisiert. |

## Auth-Routen

| Datei | Verantwortung |
|-------|---------------|
| `app/auth/sign-in/page.tsx` | Eigene Client-UI für E-Mail/Passwort, Username/Passwort und Magic-Link Login über Better Auth. |
| `app/auth/sign-up/page.tsx` | Eigene Client-UI für Registrierung, Username-Normalisierung, Availability Check und E-Mail-Bestätigungszustand. |
| `app/auth/[path]/page.tsx` | Dynamische Better-Auth-UI-Route mit `@daveyplate/better-auth-ui`, `dynamicParams = false` und `AuthViewProviders`. |
| `components/auth/auth-page.tsx` | Wiederverwendbarer Auth-Seitenrahmen für Branding, Copy und Layout. |
| `components/auth/auth-page-content.ts` | Pure Auth-Content-/Copy-Helfer, getestet über `tests/auth-page-content.test.ts`. |

## API-Routes

| Datei | Verantwortung |
|-------|---------------|
| `app/api/auth/[...all]/route.ts` | Better-Auth GET/POST Catch-all Handler aus `@/lib/auth-server`. Library-Integration, aber essenziell für Auth. |
| `app/api/pexels-video/route.ts` | Projekt-spezifischer Proxy für Pexels/Vimeo MP4-Streams mit HTTPS-Pflicht, Host-Whitelist, Range-Forwarding und Header-Sanitizing. |

## Dashboard-Routen

| Datei | Verantwortung |
|-------|---------------|
| `app/dashboard/layout.tsx` | Authenticated Dashboard Layout: Better-Auth/Convex Token, Auth User, Sentry User Context, `AppProviders`, `InitUser`. |
| `app/dashboard/page.tsx` | Server-Gate für Dashboard; redirectet anonyme Nutzer zu `/auth/sign-in`. |
| `app/dashboard/page-client.tsx` | Dashboard Controller: Session, Snapshot, Welcome Toast, Sign-out, Canvas-Erstellung, Media-Library Dialog. |
| `app/dashboard/usage/page.tsx` | Server-Gate für Credit-/Usage-Detailseite. |
| `app/dashboard/usage/page-client.tsx` | Client Controller für Credit Activity: Auth Query, Cache-Fallback, Filter, Sortierung, Pagination, View Model. |
| `app/dashboard/usage/usage-page-sections.tsx` | Präsentationskomponenten für Summary Cards, Filter, Tabelle, Skeletons und Pagination. |

## Authenticated App Route Group

| Datei | Verantwortung |
|-------|---------------|
| `app/(app)/layout.tsx` | Authenticated App Layout mit demselben Token/Sentry/Provider/`InitUser`-Pattern wie Dashboard. |
| `app/(app)/canvas/[canvasId]/page.tsx` | Canvas Server Route: Auth-Check, numerische Canvas-ID-Unterstützung, Convex Ownership Validation, `notFound()` bei ungültigem Zugriff, Render von `CanvasShell`. |
| `app/(app)/canvas/[canvasId]/error.tsx` | Canvas-spezifische Error Boundary mit Retry und Rückweg zum Dashboard. |
| `app/(app)/settings/billing/page.tsx` | Billing-Einstellungen: `ManageSubscription`, `PricingCards`, `TopupPanel`. |

## i18n und Messages

| Datei | Verantwortung |
|-------|---------------|
| `routing.ts` | `next-intl` Routing: Locales `de`/`en`, Default `de`, `localePrefix: "never"`. |
| `i18n/request.ts` | Request-lokale `next-intl` Konfiguration: Locale-Fallback, `Europe/Berlin`, dynamischer Import der Message-Dateien. |
| `messages/de.json` | Deutsche UI-/Domain-Texte für Auth, Dashboard, Canvas, Nodes, Media, Toasts. |
| `messages/en.json` | Englisches Pendant mit gleicher Struktur. |

## Instrumentation und Sentry

| Datei | Verantwortung |
|-------|---------------|
| `instrumentation.ts` | Lädt je nach Runtime `sentry.server.config` oder `sentry.edge.config`; exportiert `onRequestError`. |
| `instrumentation-client.ts` | Sentry Browser Init mit Replay, Trace Sampling, Environment und Router-Transition Capture. |
| `sentry.server.config.ts` | Sentry Server Runtime Init über `NEXT_PUBLIC_SENTRY_DSN`. |
| `sentry.edge.config.ts` | Sentry Edge Runtime Init mit denselben Basisoptionen. |
| `next.config.ts` | Wrappt Next Config mit `next-intl` und Sentry; siehe [`config-and-generated.md`](config-and-generated.md). |

## Wartungshinweise

- Routen mit User-Daten müssen serverseitig Auth prüfen, bevor sie Client-Komponenten rendern.
- Auth-required Convex Queries in Client-Komponenten sollten über `hooks/use-auth-query.ts` laufen.
- `app/dashboard/layout.tsx` und `app/(app)/layout.tsx` enthalten duplizierte Provider-/Auth-Logik; Änderungen dort synchron prüfen.
- Bei Next.js-Routing-Änderungen zuerst die lokalen Next.js 16 Docs lesen, da die Projektregeln explizit vor Breaking Changes warnen.
