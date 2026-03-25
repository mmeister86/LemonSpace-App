"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-4xl font-bold">🍋 LemonSpace</h1>

      {session?.user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg">
            Willkommen, <span className="font-semibold">{session.user.name}</span>
          </p>
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
          >
            Zum Dashboard
          </Link>
          <button
            onClick={() => authClient.signOut().then(() => router.refresh())}
            className="rounded-lg border border-border px-6 py-3 text-sm hover:bg-accent"
          >
            Abmelden
          </button>
        </div>
      ) : (
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
      )}
    </main>
  );
}
