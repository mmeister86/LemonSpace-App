"use client";

import * as Sentry from "@sentry/nextjs";
import { ReactNode, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GooeyToaster } from "goey-toast";
import "goey-toast/styles.css";

import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function SentryAuthUserSync() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session?.user) {
      Sentry.setUser({
        id: session.user.id,
        email: session.user.email ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [session?.user]);

  return null;
}

export function Providers({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  const router = useRouter();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ConvexBetterAuthProvider
        client={convex}
        authClient={authClient}
        initialToken={initialToken}
      >
        <SentryAuthUserSync />
        <AuthUIProvider
          authClient={authClient}
          navigate={router.push}
          replace={router.replace}
          onSessionChange={() => router.refresh()}
          Link={Link}
        >
          {children}
          <GooeyToaster
            position="bottom-right"
            theme="dark"
            visibleToasts={4}
            maxQueue={8}
            queueOverflow="drop-oldest"
          />
        </AuthUIProvider>
      </ConvexBetterAuthProvider>
    </ThemeProvider>
  );
}
