"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import {
  Box,
  ChevronDown,
  Coins,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  Monitor,
  Moon,
  Search,
  Sun,
  Video,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { CreditOverview } from "@/components/dashboard/credit-overview";
import { CreditsActivityChart } from "@/components/dashboard/credits-activity-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import CanvasCard from "@/components/dashboard/canvas-card";
import { MediaLibraryDialog } from "@/components/media/media-library-dialog";
import {
  collectMediaStorageIdsForResolution,
  resolveMediaPreviewUrl,
} from "@/components/media/media-preview-utils";
import { useDashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { toast } from "@/lib/toast";

function getInitials(nameOrEmail: string) {
  const normalized = nameOrEmail.trim();
  if (!normalized) return "U";

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return normalized.slice(0, 2).toUpperCase();
}

function formatDimensions(width: number | undefined, height: number | undefined): string {
  if (typeof width === "number" && typeof height === "number") {
    return `${width} x ${height}px`;
  }

  return "Größe unbekannt";
}

function getMediaItemKey(item: NonNullable<ReturnType<typeof useDashboardSnapshot>["snapshot"]>["mediaPreview"][number]): string {
  if (item.storageId) {
    return item.storageId;
  }

  if (item.originalUrl) {
    return `url:${item.originalUrl}`;
  }

  if (item.previewUrl) {
    return `preview:${item.previewUrl}`;
  }

  if (item.sourceUrl) {
    return `source:${item.sourceUrl}`;
  }

  return `${item.kind}:${item.createdAt}:${item.filename ?? "unnamed"}`;
}

function getMediaItemMeta(item: NonNullable<ReturnType<typeof useDashboardSnapshot>["snapshot"]>["mediaPreview"][number]): string {
  if (item.kind === "video") {
    return "Videodatei";
  }

  return formatDimensions(item.width, item.height);
}

function getMediaItemLabel(item: NonNullable<ReturnType<typeof useDashboardSnapshot>["snapshot"]>["mediaPreview"][number]): string {
  if (item.filename) {
    return item.filename;
  }

  if (item.kind === "video") {
    return "Unbenanntes Video";
  }

  if (item.kind === "asset") {
    return "Unbenanntes Asset";
  }

  return "Unbenanntes Bild";
}

export function DashboardPageClient() {
  const t = useTranslations("toasts");
  const router = useRouter();
  const welcomeToastSentRef = useRef(false);
  const { theme = "system", setTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { snapshot: dashboardSnapshot } = useDashboardSnapshot(session?.user?.id);
  const createCanvas = useMutation(api.canvases.create);
  const resolveMediaPreviewUrls = useMutation(api.storage.batchGetUrlsForUserMedia);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isMediaLibraryDialogOpen, setIsMediaLibraryDialogOpen] = useState(false);
  const [mediaPreviewUrlMap, setMediaPreviewUrlMap] = useState<Record<string, string | undefined>>({});
  const [isResolvingMediaPreview, setIsResolvingMediaPreview] = useState(false);
  const [mediaPreviewError, setMediaPreviewError] = useState<string | null>(null);
  const [hasClientMounted, setHasClientMounted] = useState(false);

  useEffect(() => {
    setHasClientMounted(true);
  }, []);

  const displayName = session?.user.name?.trim() || session?.user.email || "Nutzer";
  const initials = getInitials(displayName);
  const canvases = dashboardSnapshot?.canvases;
  const mediaPreview = dashboardSnapshot?.mediaPreview;
  const mediaPreviewStorageIds = useMemo(() => {
    const previewItems = mediaPreview ?? [];
    return collectMediaStorageIdsForResolution(previewItems);
  }, [mediaPreview]);

  useEffect(() => {
    if (!session?.user || welcomeToastSentRef.current) return;
    const key = `ls-dashboard-welcome-${session.user.id}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    welcomeToastSentRef.current = true;
    sessionStorage.setItem(key, "1");
    toast.success(t("auth.welcomeOnDashboard"));
  }, [t, session?.user]);

  useEffect(() => {
    let isCancelled = false;

    async function run() {
      if (dashboardSnapshot === undefined) {
        setMediaPreviewUrlMap({});
        setMediaPreviewError(null);
        setIsResolvingMediaPreview(false);
        return;
      }

      if (mediaPreviewStorageIds.length === 0) {
        setMediaPreviewUrlMap({});
        setMediaPreviewError(null);
        setIsResolvingMediaPreview(false);
        return;
      }

      setIsResolvingMediaPreview(true);
      setMediaPreviewError(null);

      try {
        const resolved = await resolveMediaPreviewUrls({ storageIds: mediaPreviewStorageIds });
        if (isCancelled) {
          return;
        }
        setMediaPreviewUrlMap(resolved);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        setMediaPreviewUrlMap({});
        setMediaPreviewError(
          error instanceof Error ? error.message : "Vorschau konnte nicht geladen werden.",
        );
      } finally {
        if (!isCancelled) {
          setIsResolvingMediaPreview(false);
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [dashboardSnapshot, mediaPreviewStorageIds, resolveMediaPreviewUrls]);

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
      router.push(`/canvas/${canvasId}`);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
          <div className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
            <Image
              src="/logos/lemonspace-logo-v2-primary-rgb.svg"
              alt=""
              width={449}
              height={86}
              unoptimized
              className="h-5 w-auto shrink-0"
              aria-hidden
              loading="eager"
            />
          </div>

          <div className="relative ml-8 hidden max-w-xs flex-1 sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 rounded-lg bg-muted/60 pl-8 text-sm"
              placeholder="Suchen…"
              type="search"
              disabled
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-1.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary/12 text-xs font-medium text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">{displayName}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value)}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="size-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="size-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="size-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>Einstellungen</DropdownMenuItem>
                <DropdownMenuItem disabled>Abrechnung</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>Abmelden</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-10 pb-16">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Guten Tag, {displayName}</h1>
          <p className="mt-1.5 text-muted-foreground">
            Überblick über deine Credits und laufende Generierungen.
          </p>
        </div>

        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Coins className="size-3.5 text-muted-foreground" />
            Credit-Übersicht
          </div>
          <CreditOverview
            balance={dashboardSnapshot?.balance}
            subscription={dashboardSnapshot?.subscription}
            usageStats={dashboardSnapshot?.usageStats}
          />
        </section>

        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
              Arbeitsbereiche
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              type="button"
              onClick={handleCreateWorkspace}
              disabled={
                isCreatingWorkspace ||
                !hasClientMounted ||
                isSessionPending ||
                !session?.user
              }
            >
              {isCreatingWorkspace ? "Erstelle..." : "Neuen Arbeitsbereich"}
            </Button>
          </div>

          {isSessionPending || canvases === undefined ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Arbeitsbereiche werden geladen...
            </div>
          ) : canvases.length === 0 ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Noch kein Arbeitsbereich vorhanden. Mit „Neuer Arbeitsbereich“ legst du den
              ersten an.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {canvases.map((canvas: Doc<"canvases">) => (
                <CanvasCard
                  key={canvas._id}
                  canvas={canvas}
                  onNavigate={(id) => router.push(`/canvas/${id}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
          <CreditsActivityChart
            balance={dashboardSnapshot?.balance}
            recentTransactions={dashboardSnapshot?.recentTransactions}
          />
          <RecentTransactions recentTransactions={dashboardSnapshot?.recentTransactions} />
        </section>

        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              Mediathek
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              type="button"
              onClick={() => setIsMediaLibraryDialogOpen(true)}
              disabled={!hasClientMounted || isSessionPending || !session?.user}
            >
              Ganze Mediathek öffnen
            </Button>
          </div>

          {dashboardSnapshot === undefined ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Mediathek wird geladen...
            </div>
          ) : mediaPreviewError ? (
            <div className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Mediathek-Vorschau konnte nicht geladen werden. {mediaPreviewError}
            </div>
          ) : !mediaPreview || mediaPreview.length === 0 ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Noch keine Medien vorhanden. Sobald du Bilder hochlädst oder generierst, werden
              sie hier angezeigt.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              {(mediaPreview ?? []).map((item) => {
                const itemKey = getMediaItemKey(item);
                const previewUrl = resolveMediaPreviewUrl(item, mediaPreviewUrlMap);
                const itemLabel = getMediaItemLabel(item);
                const itemMeta = getMediaItemMeta(item);

                return (
                  <article key={itemKey} className="overflow-hidden rounded-xl border bg-card">
                    <div className="relative aspect-square bg-muted/50">
                      {previewUrl && item.kind === "video" ? (
                        <video
                          src={previewUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt={itemLabel}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : isResolvingMediaPreview ? (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          {item.kind === "video" ? (
                            <Video className="size-5" />
                          ) : item.kind === "asset" ? (
                            <Box className="size-5" />
                          ) : (
                            <ImageIcon className="size-5" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs font-medium" title={itemLabel}>
                        {itemLabel}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{itemMeta}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <MediaLibraryDialog
        open={isMediaLibraryDialogOpen}
        onOpenChange={setIsMediaLibraryDialogOpen}
        title="Mediathek"
        description="Alle deine Medien aus LemonSpace in einer zentralen Vorschau."
      />
    </div>
  );
}
