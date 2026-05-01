/**
 * Onboarding note:
 * Public entry route. Keep redirects and landing behavior aligned with the auth flow documented in app/CLAUDE.md.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authenticated = await isAuthenticated();

  if (authenticated) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-4xl font-bold">🍋 LemonSpace</h1>

      <div className="flex gap-4">
        <Link
          href="/auth/sign-in"
          className="rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
        >
          Anmelden
        </Link>
        <Link
          href="/auth/sign-up"
          className="rounded-lg border border-border px-6 py-3 hover:bg-accent"
        >
          Registrieren
        </Link>
      </div>
    </main>
  );
}
