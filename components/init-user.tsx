"use client";

import { authClient } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { api } from "@/convex/_generated/api";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";

/**
 * Initialisiert die Credit-Balance für neue User.
 * Wird einmal im Layout eingebunden und sorgt dafür,
 * dass jeder eingeloggte User eine Balance + Free-Subscription hat.
 */
export function InitUser() {
  const t = useTranslations('toasts');
  const { data: session } = authClient.useSession();

  const balance = useAuthQuery(api.credits.getBalance);
  const initBalance = useMutation(api.credits.initBalance);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (
      !session?.user ||
      !balance ||
      balance.balance !== 0 ||
      balance.monthlyAllocation !== 0
    ) {
      return;
    }
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    void initBalance()
      .then(() => {
        toast.success(t('auth.initialSetupTitle'), t('auth.initialSetupDesc'));
      })
      .catch(() => {
        initStartedRef.current = false;
      });
  }, [t, session?.user, balance, initBalance]);

  return null;
}
