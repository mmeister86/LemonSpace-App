"use client";

/**
 * Onboarding note:
 * Feature UI module for init user. Keep server data ownership in the relevant Convex/hooks layer and use this file for presentation and local interaction only.
 */

import { authClient } from "@/lib/auth-client";
import { useMutation } from "convex/react";
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
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const initBalance = useMutation(api.credits.initBalance);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (isSessionPending || !session?.user) {
      return;
    }
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    void initBalance()
      .then((result) => {
        if (result.created) {
          toast.success(t('auth.initialSetupTitle'), t('auth.initialSetupDesc'));
        }
      })
      .catch(() => {
        initStartedRef.current = false;
      });
  }, [t, initBalance, isSessionPending, session?.user]);

  return null;
}
