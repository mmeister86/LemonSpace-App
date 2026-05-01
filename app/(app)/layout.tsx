/**
 * Onboarding note:
 * Next.js App Router module for layout. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import * as Sentry from "@sentry/nextjs";

import { InitUser } from "@/components/init-user";
import { AppProviders } from "@/components/providers";
import { getAuthUser, getToken } from "@/lib/auth-server";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialToken = await getToken();
  const user = await getAuthUser();

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
