'use client';

import { useTranslations } from 'next-intl';
import { toast, type ToastDurationOverrides } from './toast';
import type { CanvasNodeDeleteBlockReason } from './toast';
import {
  getCanvasConnectionValidationMessage,
  type CanvasConnectionValidationReason,
} from '@/lib/canvas-connection-policy';

const DURATION = {
  success: 4000,
  successShort: 2000,
  error: 6000,
  warning: 5000,
  info: 4000,
} as const;

type ToastTranslations = ReturnType<typeof useTranslations<'toasts'>>;

function canvasNodeDeleteWhy(
  t: ToastTranslations,
  reasons: Set<CanvasNodeDeleteBlockReason>,
): { title: string; desc: string } {
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

export const msg = {
  canvas: {
    imageUploaded: (t: ToastTranslations) => ({
      title: t('canvas.imageUploaded'),
    }),
    uploadFailed: (t: ToastTranslations) => ({
      title: t('canvas.uploadFailed'),
    }),
    uploadFormatError: (t: ToastTranslations, format: string) => ({
      title: t('canvas.uploadFailed'),
      desc: t('canvas.uploadFormatError', { format }),
    }),
    uploadSizeError: (t: ToastTranslations, maxMb: number) => ({
      title: t('canvas.uploadFailed'),
      desc: t('canvas.uploadSizeError', { maxMb }),
    }),
    nodeRemoved: (t: ToastTranslations) => ({
      title: t('canvas.nodeRemoved'),
    }),
    nodesRemoved: (t: ToastTranslations, count: number) => ({
      title: t('canvas.nodesRemoved', { count }),
    }),
    nodeDeleteBlockedExplain: (t: ToastTranslations, reasons: Set<CanvasNodeDeleteBlockReason>) => canvasNodeDeleteWhy(t, reasons),
    nodeDeleteBlockedPartial: (t: ToastTranslations, blockedCount: number, reasons: Set<CanvasNodeDeleteBlockReason>) => {
      const why = canvasNodeDeleteWhy(t, reasons);
      const suffix =
        blockedCount === 1
          ? t('canvas.nodeDeleteBlockedPartialSuffixOne')
          : t('canvas.nodeDeleteBlockedPartialSuffixOther', { count: blockedCount });
      return {
        title: t('canvas.nodeDeleteBlockedPartialTitle'),
        desc: `${why.desc} ${suffix}`,
      };
    },
    connectionRejected: (
      _t: ToastTranslations,
      reason: CanvasConnectionValidationReason,
    ) => ({
      title: 'Verbindung abgelehnt',
      desc: getCanvasConnectionValidationMessage(reason),
    }),
  },
  ai: {
    generating: (t: ToastTranslations) => ({ title: t('ai.generating') }),
    generated: (t: ToastTranslations, credits: number) => ({
      title: t('ai.generated'),
      desc: t('ai.generatedDesc', { credits }),
    }),
    generatedDesc: (t: ToastTranslations, credits: number) => t('ai.generatedDesc', { credits }),
    generationQueued: (t: ToastTranslations) => ({ title: t('ai.generationQueued') }),
    generationQueuedDesc: (t: ToastTranslations) => t('ai.generationQueuedDesc'),
    generationFailed: (t: ToastTranslations) => ({ title: t('ai.generationFailed') }),
    creditsNotCharged: (t: ToastTranslations) => t('ai.creditsNotCharged'),
    insufficientCredits: (t: ToastTranslations, needed: number, available: number) => ({
      title: t('ai.insufficientCreditsTitle'),
      desc: t('ai.insufficientCreditsDesc', { needed, available }),
    }),
    modelUnavailable: (t: ToastTranslations) => ({
      title: t('ai.modelUnavailableTitle'),
      desc: t('ai.modelUnavailableDesc'),
    }),
    contentPolicy: (t: ToastTranslations) => ({
      title: t('ai.contentPolicyTitle'),
      desc: t('ai.contentPolicyDesc'),
    }),
    timeout: (t: ToastTranslations) => ({
      title: t('ai.timeoutTitle'),
      desc: t('ai.timeoutDesc'),
    }),
    openrouterIssues: (t: ToastTranslations) => ({
      title: t('ai.openrouterIssuesTitle'),
      desc: t('ai.openrouterIssuesDesc'),
    }),
    concurrentLimitReached: (t: ToastTranslations) => ({
      title: t('ai.concurrentLimitReachedTitle'),
      desc: t('ai.concurrentLimitReachedDesc'),
    }),
  },
  export: {
    frameExported: (t: ToastTranslations) => ({ title: t('export.frameExported') }),
    exportFailed: (t: ToastTranslations) => ({ title: t('export.exportFailed') }),
  },
  auth: {
    welcomeBack: (t: ToastTranslations) => ({ title: t('auth.welcomeBack') }),
    welcomeOnDashboard: (t: ToastTranslations) => ({ title: t('auth.welcomeOnDashboard') }),
    checkEmail: (t: ToastTranslations, email: string) => ({
      title: t('auth.checkEmailTitle'),
      desc: t('auth.checkEmailDesc', { email }),
    }),
    sessionExpired: (t: ToastTranslations) => ({
      title: t('auth.sessionExpiredTitle'),
      desc: t('auth.sessionExpiredDesc'),
    }),
    signedOut: (t: ToastTranslations) => ({ title: t('auth.signedOut') }),
    signIn: (t: ToastTranslations) => t('auth.signIn'),
    initialSetup: (t: ToastTranslations) => ({
      title: t('auth.initialSetupTitle'),
      desc: t('auth.initialSetupDesc'),
    }),
  },
  billing: {
    subscriptionActivated: (t: ToastTranslations, credits: number) => ({
      title: t('billing.subscriptionActivatedTitle'),
      desc: t('billing.subscriptionActivatedDesc', { credits }),
    }),
    creditsAdded: (t: ToastTranslations, credits: number) => ({
      title: t('billing.creditsAddedTitle'),
      desc: t('billing.creditsAddedDesc', { credits }),
    }),
    subscriptionCancelled: (t: ToastTranslations, periodEnd: string) => ({
      title: t('billing.subscriptionCancelledTitle'),
      desc: t('billing.subscriptionCancelledDesc', { periodEnd }),
    }),
    paymentFailed: (t: ToastTranslations) => ({
      title: t('billing.paymentFailedTitle'),
      desc: t('billing.paymentFailedDesc'),
    }),
    dailyLimitReached: (t: ToastTranslations, limit: number) => ({
      title: t('billing.dailyLimitReachedTitle'),
      desc: t('billing.dailyLimitReachedDesc', { limit }),
    }),
    lowCredits: (t: ToastTranslations, remaining: number) => ({
      title: t('billing.lowCreditsTitle'),
      desc: t('billing.lowCreditsDesc', { remaining }),
    }),
    topUp: (t: ToastTranslations) => t('billing.topUp'),
    upgrade: (t: ToastTranslations) => t('billing.upgrade'),
    manage: (t: ToastTranslations) => t('billing.manage'),
    redirectingToCheckout: (t: ToastTranslations) => ({
      title: t('billing.redirectingToCheckoutTitle'),
      desc: t('billing.redirectingToCheckoutDesc'),
    }),
    openingPortal: (t: ToastTranslations) => ({
      title: t('billing.openingPortalTitle'),
      desc: t('billing.openingPortalDesc'),
    }),
    testGrantFailed: (t: ToastTranslations) => ({ title: t('billing.testGrantFailedTitle') }),
  },
  system: {
    reconnected: (t: ToastTranslations) => ({ title: t('system.reconnected') }),
    connectionLost: (t: ToastTranslations) => ({
      title: t('system.connectionLostTitle'),
      desc: t('system.connectionLostDesc'),
    }),
    copiedToClipboard: (t: ToastTranslations) => ({ title: t('system.copiedToClipboard') }),
  },
  dashboard: {
    renameEmpty: (t: ToastTranslations) => ({
      title: t('dashboard.renameEmptyTitle'),
      desc: t('dashboard.renameEmptyDesc'),
    }),
    renameSuccess: (t: ToastTranslations) => ({ title: t('dashboard.renameSuccess') }),
    renameFailed: (t: ToastTranslations) => ({ title: t('dashboard.renameFailed') }),
    deleteSuccess: (t: ToastTranslations) => ({ title: t('dashboard.deleteSuccess') }),
    deleteFailed: (t: ToastTranslations) => ({ title: t('dashboard.deleteFailed') }),
  },
} as const;

export function showCanvasConnectionRejectedToast(
  t: ToastTranslations,
  reason: CanvasConnectionValidationReason,
  duration?: ToastDurationOverrides,
): void {
  const payload = msg.canvas.connectionRejected(t, reason);
  toast.warning(payload.title, payload.desc, duration ?? { duration: DURATION.warning });
}
