"use client";

import { authClient } from "@/lib/auth-client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";

/**
 * Initialisiert die Credit-Balance für neue User.
 * Wird einmal im Layout eingebunden und sorgt dafür,
 * dass jeder eingeloggte User eine Balance + Free-Subscription hat.
 */
export function InitUser() {
  const { data: session } = authClient.useSession();
  const balance = useQuery(
    api.credits.getBalance,
    session?.user ? {} : "skip"
  );
  const initBalance = useMutation(api.credits.initBalance);

  useEffect(() => {
    if (
      session?.user &&
      balance &&
      balance.balance === 0 &&
      balance.monthlyAllocation === 0
    ) {
      initBalance();
    }
  }, [session?.user, balance, initBalance]);

  return null;
}
