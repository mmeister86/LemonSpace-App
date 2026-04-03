import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

import { DashboardPageClient } from "./page-client";

export default async function DashboardPage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/auth/sign-in");
  }

  return <DashboardPageClient />;
}
