"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({
  error,
  unstable_retry,
}: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de" className="h-full antialiased font-sans">
      <body className="min-h-full bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold">Schwerer Fehler</h1>
              <p className="text-sm text-muted-foreground">
                Die Anwendung konnte nicht dargestellt werden. Lade den Bereich
                neu, um fortzufahren.
              </p>
              {error.digest ? (
                <p className="text-xs text-muted-foreground/80">
                  Fehler-ID: {error.digest}
                </p>
              ) : null}
            </div>

            <Button className="w-full" onClick={() => unstable_retry()}>
              Erneut laden
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
