"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

type CanvasErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function CanvasError({ error, unstable_retry }: CanvasErrorProps) {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Canvas konnte nicht geladen werden</h1>
          <p className="text-sm text-muted-foreground">
            Beim Laden dieses Canvas ist ein Fehler aufgetreten.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground/80">Fehler-ID: {error.digest}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button className="sm:flex-1" onClick={() => unstable_retry()}>
            Erneut versuchen
          </Button>
          <Button asChild variant="outline" className="sm:flex-1">
            <Link href="/dashboard">Zum Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
