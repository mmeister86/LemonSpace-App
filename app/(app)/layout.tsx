/**
 * Onboarding note:
 * Next.js App Router module for layout. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import * as Sentry from "@sentry/nextjs";

import { InitUser } from "@/components/init-user";
import { AppProviders } from "@/components/providers";
import { getAuthUser, getToken } from "@/lib/auth-server";

function isRecoverableAuthLookupError(error: unknown): boolean {
  const message = String(error);
  return message.includes("NoAuthProvider") || message.includes("Unauthenticated");
}

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialToken = await getToken();
  let user: Awaited<ReturnType<typeof getAuthUser>> = null;
  try {
    user = await getAuthUser();
  } catch (error) {
    if (!isRecoverableAuthLookupError(error)) {
      throw error;
    }
    console.warn("[app/layout] SSR auth user lookup failed; continuing without Sentry user", {
      error: String(error),
    });
  }

  if (user) {
    const id = user.userId ?? String(user._id);
    Sentry.setUser({
      id,
      email: user.email ?? undefined,
    });
  } else {
    Sentry.setUser(null);
  }

  return (
    <AppProviders initialToken={initialToken}>
      <InitUser />
      {children}
    </AppProviders>
  );
}
