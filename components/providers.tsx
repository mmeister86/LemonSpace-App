"use client";

/**
 * Onboarding note:
 * Feature UI module for providers. Keep server data ownership in the relevant Convex/hooks layer and use this file for presentation and local interaction only.
 */

import * as Sentry from "@sentry/nextjs";
import { ReactNode, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GooeyToaster } from "goey-toast";
import "goey-toast/styles.css";

import { authClient } from "@/lib/auth-client";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";

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

type RootProvidersProps = {
  children: ReactNode;
  locale?: string;
  messages?: AbstractIntlMessages;
  timeZone?: string;
};

type AppProvidersProps = {
  children: ReactNode;
  initialToken?: string | null;
};

function AuthUiShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}

export function RootProviders({
  children,
  locale,
  messages,
  timeZone,
}: RootProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      >
        {children}
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}

export function AppProviders({ children, initialToken }: AppProvidersProps) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <SentryAuthUserSync />
      <AuthUiShell>
        <OnboardingProvider>
          {children}
          <GooeyToaster
            position="bottom-right"
            theme="dark"
            visibleToasts={4}
            maxQueue={8}
            queueOverflow="drop-oldest"
          />
        </OnboardingProvider>
      </AuthUiShell>
    </ConvexBetterAuthProvider>
  );
}

export function AuthViewProviders({ children }: { children: ReactNode }) {
  return <AuthUiShell>{children}</AuthUiShell>;
}
