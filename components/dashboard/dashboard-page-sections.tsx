"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
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

import CanvasCard from "@/components/dashboard/canvas-card";
import { CreditOverview } from "@/components/dashboard/credit-overview";
import { CreditsActivityChart } from "@/components/dashboard/credits-activity-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
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
import type { Doc } from "@/convex/_generated/dataModel";
import type { DashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { resolveMediaPreviewUrl } from "@/components/media/media-preview-utils";
import {
  getDashboardMediaItemKey,
  getDashboardMediaItemLabel,
  getDashboardMediaItemMeta,
} from "@/lib/dashboard-media-preview";

type DashboardHeaderProps = {
  displayName: string;
  initials: string;
  onSignOut: () => void;
};

export function DashboardHeader({ displayName, initials, onSignOut }: DashboardHeaderProps) {
  const { theme = "system", setTheme } = useTheme();

  return (
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
              <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value)}>
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
              <DropdownMenuItem onSelect={onSignOut}>Abmelden</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

type DashboardCreditsSectionProps = {
  snapshot: DashboardSnapshot | undefined;
};

export function DashboardCreditsSection({ snapshot }: DashboardCreditsSectionProps) {
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <Coins className="size-3.5 text-muted-foreground" />
        Credit-Übersicht
      </div>
      <CreditOverview
        balance={snapshot?.balance}
        subscription={snapshot?.subscription}
        usageStats={snapshot?.usageStats}
      />
    </section>
  );
}

type DashboardWorkspaceSectionProps = {
  canvases: DashboardSnapshot["canvases"] | undefined;
  isCreatingWorkspace: boolean;
  isCreateDisabled: boolean;
  isSessionPending: boolean;
  onCreateWorkspace: () => void;
  onNavigateCanvas: (id: Doc<"canvases">["_id"]) => void;
};

export function DashboardWorkspaceSection({
  canvases,
  isCreatingWorkspace,
  isCreateDisabled,
  isSessionPending,
  onCreateWorkspace,
  onNavigateCanvas,
}: DashboardWorkspaceSectionProps) {
  return (
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
          onClick={onCreateWorkspace}
          disabled={isCreateDisabled}
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
          Noch kein Arbeitsbereich vorhanden. Mit „Neuer Arbeitsbereich“ legst du den ersten an.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {canvases.map((canvas: Doc<"canvases">) => (
            <CanvasCard key={canvas._id} canvas={canvas} onNavigate={onNavigateCanvas} />
          ))}
        </div>
      )}
    </section>
  );
}

type DashboardActivitySectionProps = {
  snapshot: DashboardSnapshot | undefined;
};

export function DashboardActivitySection({ snapshot }: DashboardActivitySectionProps) {
  return (
    <section className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <CreditsActivityChart balance={snapshot?.balance} recentTransactions={snapshot?.recentTransactions} />
      <RecentTransactions recentTransactions={snapshot?.recentTransactions} />
    </section>
  );
}

type DashboardMediaPreviewSectionProps = {
  snapshot: DashboardSnapshot | undefined;
  isOpenDisabled: boolean;
  isResolvingMediaPreview: boolean;
  mediaPreviewError: string | null;
  mediaPreviewUrlMap: Record<string, string | undefined>;
  labels: {
    sectionTitle: string;
    openAll: string;
    loading: string;
    empty: string;
    previewError: (error: string) => string;
    unknownSize: string;
    videoFile: string;
    untitledImage: string;
    untitledVideo: string;
    untitledAsset: string;
  };
  onOpenMediaLibrary: () => void;
};

export function DashboardMediaPreviewSection({
  snapshot,
  isOpenDisabled,
  isResolvingMediaPreview,
  mediaPreviewError,
  mediaPreviewUrlMap,
  labels,
  onOpenMediaLibrary,
}: DashboardMediaPreviewSectionProps) {
  const mediaPreview = snapshot?.mediaPreview;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="size-3.5 text-muted-foreground" />
          {labels.sectionTitle}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer text-muted-foreground"
          type="button"
          onClick={onOpenMediaLibrary}
          disabled={isOpenDisabled}
        >
          {labels.openAll}
        </Button>
      </div>

      {snapshot === undefined ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
          {labels.loading}
        </div>
      ) : mediaPreviewError ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
          {labels.previewError(mediaPreviewError)}
        </div>
      ) : !mediaPreview || mediaPreview.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
          {labels.empty}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          {mediaPreview.map((item) => {
            const itemKey = getDashboardMediaItemKey(item);
            const previewUrl = resolveMediaPreviewUrl(item, mediaPreviewUrlMap);
            const itemLabel = getDashboardMediaItemLabel(item, labels);
            const itemMeta = getDashboardMediaItemMeta(item, labels);

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
  );
}
