// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV,

  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: 0.1,

  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
