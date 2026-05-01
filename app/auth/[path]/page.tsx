/**
 * Onboarding note:
 * Next.js App Router module for page. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";

import { AuthViewProviders } from "@/components/providers";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <AuthViewProviders>
        <AuthView path={path} />
      </AuthViewProviders>
    </main>
  );
}
