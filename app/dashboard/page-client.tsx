"use client";

/**
 * Onboarding note:
 * Next.js App Router module for page client. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import {
  DashboardActivitySection,
  DashboardCreditsSection,
  DashboardHeader,
  DashboardMediaPreviewSection,
  DashboardWorkspaceSection,
} from "@/components/dashboard/dashboard-page-sections";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { MediaLibraryDialog } from "@/components/media/media-library-dialog";
import { useDashboardMediaPreviewUrls } from "@/hooks/use-dashboard-media-preview-urls";
import { useDashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { toast } from "@/lib/toast";
import { useOnboardingActions } from "@/components/onboarding/onboarding-provider";
import { writePendingCanvasTour } from "@/lib/onboarding/storage";

function getInitials(nameOrEmail: string) {
  const normalized = nameOrEmail.trim();
  if (!normalized) return "U";

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return normalized.slice(0, 2).toUpperCase();
}

export function DashboardPageClient() {
  const t = useTranslations("toasts");
  const tMediaCommon = useTranslations("mediaLibrary.common");
  const tMediaDashboard = useTranslations("mediaLibrary.dashboard");
  const tMediaDialog = useTranslations("mediaLibrary.dialog");
  const router = useRouter();
  const welcomeToastSentRef = useRef(false);
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { snapshot: dashboardSnapshot } = useDashboardSnapshot(session?.user?.id);
  const createCanvas = useMutation(api.canvases.create);
  const { markMilestone, markTourProgress } = useOnboardingActions();
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isMediaLibraryDialogOpen, setIsMediaLibraryDialogOpen] = useState(false);
  const [hasClientMounted, setHasClientMounted] = useState(false);
  const {
    urlMap: mediaPreviewUrlMap,
    isResolving: isResolvingMediaPreview,
    error: mediaPreviewError,
  } = useDashboardMediaPreviewUrls(dashboardSnapshot, tMediaDialog("urlResolveError"));

  useEffect(() => {
    setHasClientMounted(true);
  }, []);

  const displayName = session?.user.name?.trim() || session?.user.email || "Nutzer";
  const initials = getInitials(displayName);
  const canvases = dashboardSnapshot?.canvases;

  useEffect(() => {
    if (!session?.user || welcomeToastSentRef.current) return;
    const key = `ls-dashboard-welcome-${session.user.id}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    welcomeToastSentRef.current = true;
    sessionStorage.setItem(key, "1");
    toast.success(t("auth.welcomeOnDashboard"));
  }, [t, session?.user]);

  const handleSignOut = async () => {
    toast.info(t("auth.signedOut"));
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  };

  const handleCreateWorkspace = async () => {
    if (isCreatingWorkspace) return;
    if (!session?.user) return;
    setIsCreatingWorkspace(true);

    try {
      const canvasId = await createCanvas({
        name: "Neuer Workspace",
        description: "",
      });
      markMilestone("firstWorkspace");
      markTourProgress("dashboardTour", "completed", 2);
      writePendingCanvasTour({ canvasId, createdAt: Date.now() });
      router.push(`/canvas/${canvasId}`);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <div className="min-h-full bg-background">
      <DashboardHeader displayName={displayName} initials={initials} onSignOut={handleSignOut} />

      <main className="mx-auto max-w-5xl px-6 pt-10 pb-16">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Guten Tag, {displayName}</h1>
          <p className="mt-1.5 text-muted-foreground">
            Überblick über deine Credits und laufende Generierungen.
          </p>
        </div>

        <DashboardCreditsSection snapshot={dashboardSnapshot} />

        <DashboardWorkspaceSection
          canvases={canvases}
          isCreatingWorkspace={isCreatingWorkspace}
          isCreateDisabled={
            isCreatingWorkspace || !hasClientMounted || isSessionPending || !session?.user
          }
          isSessionPending={isSessionPending}
          onCreateWorkspace={handleCreateWorkspace}
          onNavigateCanvas={(id) => router.push(`/canvas/${id}`)}
        />

        <DashboardActivitySection snapshot={dashboardSnapshot} />

        <DashboardMediaPreviewSection
          snapshot={dashboardSnapshot}
          isOpenDisabled={!hasClientMounted || isSessionPending || !session?.user}
          isResolvingMediaPreview={isResolvingMediaPreview}
          mediaPreviewError={mediaPreviewError}
          mediaPreviewUrlMap={mediaPreviewUrlMap}
          labels={{
            sectionTitle: tMediaDashboard("sectionTitle"),
            openAll: tMediaDashboard("openAll"),
            loading: tMediaDashboard("loading"),
            empty: tMediaDashboard("empty"),
            previewError: (error) => tMediaDashboard("previewError", { error }),
            unknownSize: tMediaCommon("unknownSize"),
            videoFile: tMediaCommon("videoFile"),
            untitledImage: tMediaCommon("untitledImage"),
            untitledVideo: tMediaCommon("untitledVideo"),
            untitledAsset: tMediaCommon("untitledAsset"),
          }}
          onOpenMediaLibrary={() => setIsMediaLibraryDialogOpen(true)}
        />
      </main>

      <MediaLibraryDialog
        open={isMediaLibraryDialogOpen}
        onOpenChange={setIsMediaLibraryDialogOpen}
        title={tMediaDialog("title")}
        description={tMediaDashboard("dialogDescription")}
      />
    </div>
  );
}
