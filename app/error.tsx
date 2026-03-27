"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type AppErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function AppError({ error, unstable_retry }: AppErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);

    const safeError = {
      name: error.name,
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Unexpected application error",
      digest: error.digest,
    };

    console.error("[app/error]", safeError);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="text-sm text-muted-foreground">
            Wir konnten diesen Bereich nicht laden. Du kannst es direkt erneut
            versuchen.
          </p>
        </div>

        <Button className="w-full" onClick={() => unstable_retry()}>
          Erneut versuchen
        </Button>
      </div>
    </main>
  );
}
