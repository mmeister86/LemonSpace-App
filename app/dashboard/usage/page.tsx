/**
 * Onboarding note:
 * Next.js App Router module for page. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

import { UsagePageClient } from "./page-client";

export default async function UsagePage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/auth/sign-in");
  }

  return <UsagePageClient />;
}
