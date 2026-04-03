'use client';

import { useTranslations } from 'next-intl';
import { gooeyToast, type GooeyPromiseData } from 'goey-toast';

const DURATION = {
  success: 4000,
  successShort: 2000,
  error: 6000,
  warning: 5000,
  info: 4000,
} as const;

type ToastTranslations = ReturnType<typeof useTranslations<'toasts'>>;

export type ToastDurationOverrides = {
  duration?: number;
};

export const toast = {
  success(message: string, description?: string, opts?: ToastDurationOverrides) {
    return gooeyToast.success(message, {
      description,
      duration: opts?.duration ?? DURATION.success,
    });
  },
  error(message: string, description?: string, opts?: ToastDurationOverrides) {
    return gooeyToast.error(message, {
      description,
      duration: opts?.duration ?? DURATION.error,
    });
  },
  warning(message: string, description?: string, opts?: ToastDurationOverrides) {
    return gooeyToast.warning(message, {
      description,
      duration: opts?.duration ?? DURATION.warning,
    });
  },
  info(message: string, description?: string, opts?: ToastDurationOverrides) {
    return gooeyToast.info(message, {
      description,
      duration: opts?.duration ?? DURATION.info,
    });
  },
  promise<T>(promise: Promise<T>, data: GooeyPromiseData<T>) {
    return gooeyToast.promise(promise, data);
  },
  action(message: string, opts: {
    description?: string;
    label: string;
    onClick: () => void;
    successLabel?: string;
    type?: "success" | "info" | "warning";
    duration?: number;
  }) {
    const t = opts.type ?? "info";
    return gooeyToast[t](message, {
      description: opts.description,
      duration: opts.duration ?? (t === "success" ? DURATION.success : DURATION.info),
      action: {
        label: opts.label,
        onClick: opts.onClick,
        successLabel: opts.successLabel,
      },
    });
  },
  update(id: string | number, opts: {
    title?: string;
    description?: string;
    type?: "default" | "success" | "error" | "warning" | "info";
  }) {
    gooeyToast.update(id, opts);
  },
  dismiss(id?: string | number) {
    gooeyToast.dismiss(id);
  },
};

export const toastDuration = {
  success: DURATION.success,
  successShort: DURATION.successShort,
  error: DURATION.error,
  warning: DURATION.warning,
  info: DURATION.info,
} as const;

export type CanvasNodeDeleteBlockReason = 'optimistic';

export function showImageUploadedToast(t: ToastTranslations) {
  toast.success(t('canvas.imageUploaded'));
}

export function showUploadFailedToast(t: ToastTranslations, reason?: string) {
  if (reason) {
    toast.error(t('canvas.uploadFailed'), reason);
  } else {
    toast.error(t('canvas.uploadFailed'));
  }
}

export function showUploadFormatError(t: ToastTranslations, format: string) {
  toast.error(t('canvas.uploadFailed'), t('canvas.uploadFormatError', { format }));
}

export function showUploadSizeError(t: ToastTranslations, maxMb: number) {
  toast.error(t('canvas.uploadFailed'), t('canvas.uploadSizeError', { maxMb }));
}

export function showNodeRemovedToast(t: ToastTranslations) {
  toast.success(t('canvas.nodeRemoved'));
}

export function showNodesRemovedToast(t: ToastTranslations, count: number) {
  const title = t('canvas.nodesRemoved', { count });
  toast.success(title);
}

export function canvasNodeDeleteWhy(
  t: ToastTranslations,
  reasons: Set<CanvasNodeDeleteBlockReason>,
) {
  if (reasons.size === 0) {
    return {
      title: t('canvas.nodeDeleteBlockedTitle'),
      desc: t('canvas.nodeDeleteBlockedDesc'),
    };
  }
  if (reasons.size === 1) {
    const only = [...reasons][0]!;
    if (only === 'optimistic') {
      return {
        title: t('canvas.nodeDeleteOptimisticTitle'),
        desc: t('canvas.nodeDeleteOptimisticDesc'),
      };
    }
    return {
      title: t('canvas.nodeDeleteBlockedTitle'),
      desc: t('canvas.nodeDeleteBlockedDesc'),
    };
  }
  return {
    title: t('canvas.nodeDeleteBlockedTitle'),
    desc: t('canvas.nodeDeleteBlockedMultiDesc'),
  };
}

export function canvasNodeDeleteBlockedPartial(
  t: ToastTranslations,
  blockedCount: number,
  reasons: Set<CanvasNodeDeleteBlockReason>,
) {
  const why = canvasNodeDeleteWhy(t, reasons);
  const suffix =
    blockedCount === 1
      ? t('canvas.nodeDeleteBlockedPartialSuffixOne')
      : t('canvas.nodeDeleteBlockedPartialSuffixOther', { count: blockedCount });
  return {
    title: t('canvas.nodeDeleteBlockedPartialTitle'),
    desc: `${why.desc} ${suffix}`,
  };
}

export function showGeneratingToast(t: ToastTranslations) {
  gooeyToast.info(t('ai.generating'), { duration: Infinity });
}

export function showGeneratedToast(
  t: ToastTranslations,
  credits: number,
) {
  toast.success(t('ai.generated'), t('ai.generatedDesc', { credits }));
}

export function showGenerationQueuedToast(t: ToastTranslations) {
  toast.success(t('ai.generationQueued'), t('ai.generationQueuedDesc'));
}

export function showGenerationFailedToast(t: ToastTranslations) {
  toast.error(t('ai.generationFailed'));
}

export function showCreditsNotChargedToast(t: ToastTranslations) {
  toast.warning(t('ai.creditsNotCharged'));
}

export function showInsufficientCreditsToast(
  t: ToastTranslations,
  needed: number,
  available: number,
) {
  toast.error(t('ai.insufficientCreditsTitle'), t('ai.insufficientCreditsDesc', { needed, available }));
}

export function showModelUnavailableToast(t: ToastTranslations) {
  toast.error(t('ai.modelUnavailableTitle'), t('ai.modelUnavailableDesc'));
}

export function showContentPolicyBlockedToast(t: ToastTranslations) {
  toast.error(t('ai.contentPolicyTitle'), t('ai.contentPolicyDesc'));
}

export function showTimeoutToast(t: ToastTranslations) {
  toast.error(t('ai.timeoutTitle'), t('ai.timeoutDesc'));
}

export function showOpenrouterIssuesToast(t: ToastTranslations) {
  toast.error(t('ai.openrouterIssuesTitle'), t('ai.openrouterIssuesDesc'));
}

export function showConcurrentLimitReachedToast(t: ToastTranslations) {
  toast.error(t('ai.concurrentLimitReachedTitle'), t('ai.concurrentLimitReachedDesc'));
}

export function showFrameExportedToast(t: ToastTranslations) {
  toast.success(t('export.frameExported'));
}

export function showExportingFramesToast(t: ToastTranslations) {
  gooeyToast.info(t('export.exportingFrames'), { duration: Infinity });
}

export function showZipReadyToast(t: ToastTranslations) {
  toast.success(t('export.zipReady'));
}

export function showExportFailedToast(t: ToastTranslations) {
  toast.error(t('export.exportFailed'));
}

export function showFrameEmptyToast(t: ToastTranslations) {
  toast.error(t('export.frameEmptyTitle'), t('export.frameEmptyDesc'));
}

export function showNoFramesOnCanvasToast(t: ToastTranslations) {
  toast.error(t('export.noFramesOnCanvasTitle'), t('export.noFramesOnCanvasDesc'));
}

export function showDownloadToast(t: ToastTranslations) {
  toast.success(t('export.downloaded'), t('export.download'));
}

export function showWelcomeBackToast(t: ToastTranslations) {
  toast.success(t('auth.welcomeBack'));
}

export function showWelcomeOnDashboardToast(t: ToastTranslations) {
  toast.success(t('auth.welcomeOnDashboard'));
}

export function showCheckEmailToast(t: ToastTranslations, email: string) {
  toast.success(t('auth.checkEmailTitle'), t('auth.checkEmailDesc', { email }));
}

export function showSessionExpiredToast(t: ToastTranslations) {
  toast.error(t('auth.sessionExpiredTitle'), t('auth.sessionExpiredDesc'));
}

export function showSignedOutToast(t: ToastTranslations) {
  toast.success(t('auth.signedOut'));
}

export function showSignInToast(t: ToastTranslations) {
  toast.success(t('auth.signIn'));
}

export function showInitialSetupToast(t: ToastTranslations) {
  toast.success(t('auth.initialSetupTitle'), t('auth.initialSetupDesc'));
}

export function showSubscriptionActivatedToast(
  t: ToastTranslations,
  credits: number,
) {
  toast.success(t('billing.subscriptionActivatedTitle'), t('billing.subscriptionActivatedDesc', { credits }));
}

export function showCreditsAddedToast(t: ToastTranslations, credits: number) {
  toast.success(t('billing.creditsAddedTitle'), t('billing.creditsAddedDesc', { credits }));
}

export function showSubscriptionCancelledToast(
  t: ToastTranslations,
  periodEnd: string,
) {
  gooeyToast.info(t('billing.subscriptionCancelledTitle'), { description: t('billing.subscriptionCancelledDesc', { periodEnd }) });
}

export function showPaymentFailedToast(t: ToastTranslations) {
  toast.error(t('billing.paymentFailedTitle'), t('billing.paymentFailedDesc'));
}

export function showDailyLimitReachedToast(t: ToastTranslations, limit: number) {
  toast.error(t('billing.dailyLimitReachedTitle'), t('billing.dailyLimitReachedDesc', { limit }));
}

export function showLowCreditsToast(t: ToastTranslations, remaining: number) {
  toast.warning(t('billing.lowCreditsTitle'), t('billing.lowCreditsDesc', { remaining }));
}

export function showTopUpToast(t: ToastTranslations) {
  toast.success(t('billing.topUp'));
}

export function showUpgradeToast(t: ToastTranslations) {
  toast.success(t('billing.upgrade'));
}

export function showManageToast(t: ToastTranslations) {
  toast.success(t('billing.manage'));
}

export function showRedirectingToCheckoutToast(t: ToastTranslations) {
  gooeyToast.info(t('billing.redirectingToCheckoutTitle'), { description: t('billing.redirectingToCheckoutDesc') });
}

export function showOpeningPortalToast(t: ToastTranslations) {
  gooeyToast.info(t('billing.openingPortalTitle'), { description: t('billing.openingPortalDesc') });
}

export function showTestGrantFailedToast(t: ToastTranslations) {
  toast.error(t('billing.testGrantFailedTitle'));
}

export function showReconnectedToast(t: ToastTranslations) {
  toast.success(t('system.reconnected'));
}

export function showConnectionLostToast(t: ToastTranslations) {
  toast.error(t('system.connectionLostTitle'), t('system.connectionLostDesc'));
}

export function showCopiedToClipboardToast(t: ToastTranslations) {
  toast.success(t('system.copiedToClipboard'));
}

export function showRenameEmptyToast(t: ToastTranslations) {
  toast.error(t('dashboard.renameEmptyTitle'), t('dashboard.renameEmptyDesc'));
}

export function showRenameSuccessToast(t: ToastTranslations) {
  toast.success(t('dashboard.renameSuccess'));
}

export function showRenameFailedToast(t: ToastTranslations) {
  toast.error(t('dashboard.renameFailed'));
}

export function showDeleteSuccessToast(t: ToastTranslations) {
  toast.success(t('dashboard.deleteSuccess'));
}

export function showDeleteFailedToast(t: ToastTranslations) {
  toast.error(t('dashboard.deleteFailed'));
}

export function useToastTranslations() {
  const t = useTranslations('toasts');
  return t as ToastTranslations;
}
