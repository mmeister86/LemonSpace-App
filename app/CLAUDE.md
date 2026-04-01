# app/ — Next.js Routing & Layouts

Next.js 16 App Router. Vor Änderungen: Relevante Guides in `node_modules/next/dist/docs/` lesen — Breaking Changes gegenüber früheren Versionen möglich.

---

## Route-Struktur

```
app/
├── layout.tsx                    ← Root Layout (Fonts, Providers, Sentry, Analytics)
├── page.tsx                      ← Landing / Redirect
├── globals.css                   ← Tailwind v4 + Design-Tokens
├── (app)/                        ← Authentifizierte App-Routen
│   ├── canvas/[canvasId]/        ← Canvas-Editor
│   │   └── page.tsx              ← SSR-Auth/ID-Validation, rendert dann `CanvasShell`
│   └── settings/
│       └── billing/              ← Billing-Einstellungen
├── auth/                         ← Auth-Routen (Better Auth)
│   ├── [path]/                   ← Catch-all für Better Auth Flows
│   ├── sign-in/
│   └── sign-up/
├── api/
│   ├── auth/[...all]/            ← Better Auth API Handler
│   └── pexels-video/             ← Pexels Video Proxy
└── dashboard/                    ← Dashboard nach Login
```

---

## Root Layout (`layout.tsx`)

Server Component. Initialisiert:

1. **Font:** `Manrope` via `next/font/google` → CSS-Variable `--font-sans`
2. **Auth:** `getToken()` + `getAuthUser()` für SSR-seitigen Convex-Token
3. **Sentry:** `Sentry.setUser()` direkt im Layout (serverseitig)
4. **Analytics:** Rybbit-Script via `<script>` Tag (`rybbit.matthias.lol`)
5. **Providers:** `<Providers initialToken={...}>` — Convex + Theme + Auth
6. **InitUser:** `<InitUser />` — Ruft `api.credits.initBalance` beim ersten Login auf

---

## Provider-Pattern

```tsx
// components/providers.tsx
<ConvexProvider client={convex}>
  <ThemeProvider>
    <AuthProvider>
      {children}
    </AuthProvider>
  </ThemeProvider>
</ConvexProvider>
```

`initialToken` wird server-seitig aus Better Auth ausgelesen und an Convex übergeben — verhindert einen Auth-Flash beim ersten Render. Mit `initialToken` springt `isAuthenticated` sofort auf `true` ohne Loading-Phase.

---

## Auth-Flow

**Better Auth** (self-hosted, open-source). Konfiguration in `lib/auth.ts` (Server) und `lib/auth-client.ts` (Client).

- Server-Helper: `getAuthUser()`, `getToken()` aus `lib/auth-server.ts`
- Client-Helper: `authClient` aus `lib/auth-client.ts`
- Convex-Integration: `convex/auth.config.ts` + `convex/auth.ts`
- Trusted Origins: `https://app.lemonspace.io`, `http://localhost:3000`

---

## Route Groups

`(app)/` — Klammer-Gruppen teilen kein eigenes Layout-Segment, ermöglichen aber eigene `layout.tsx` für Auth-Guards. Alle eingeloggten Routen liegen hier.

---

## API-Routen

- `api/auth/[...all]` — Better Auth catch-all Handler. Nicht anfassen ohne Better Auth Docs zu lesen.
- `api/pexels-video` — Server-seitiger Proxy für Pexels-Video-Anfragen (API-Key bleibt serverseitig).

---

## env-Variablen (Next.js-Seite)

```
BETTER_AUTH_SECRET
BETTER_AUTH_URL
NEXT_PUBLIC_CONVEX_URL
```
