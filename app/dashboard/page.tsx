"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  Coins,
  LayoutTemplate,
  Monitor,
  Moon,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const formatEurFromCents = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

const mockRuns = [
  {
    id: "run-8841",
    workspace: "Sommer-Kampagne",
    node: "KI-Bild",
    model: "flux-pro",
    status: "done" as const,
    credits: 42,
    updated: "vor 12 Min.",
  },
  {
    id: "run-8839",
    workspace: "Produktfotos",
    node: "KI-Bild",
    model: "flux-schnell",
    status: "executing" as const,
    credits: 18,
    updated: "gerade eben",
  },
  {
    id: "run-8832",
    workspace: "Social Variants",
    node: "Compare",
    model: "—",
    status: "idle" as const,
    credits: 0,
    updated: "vor 1 Std.",
  },
  {
    id: "run-8828",
    workspace: "Sommer-Kampagne",
    node: "KI-Bild",
    model: "flux-pro",
    status: "error" as const,
    credits: 0,
    updated: "vor 2 Std.",
  },
];

function StatusDot({ status }: { status: (typeof mockRuns)[0]["status"] }) {
  const base = "inline-block size-2 rounded-full";
  switch (status) {
    case "done":
      return <span className={cn(base, "bg-primary")} />;
    case "executing":
      return (
        <span className="relative inline-flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className={cn(base, "relative bg-primary")} />
        </span>
      );
    case "idle":
      return <span className={cn(base, "bg-border")} />;
    case "error":
      return <span className={cn(base, "bg-destructive")} />;
  }
}

function statusLabel(status: (typeof mockRuns)[0]["status"]) {
  switch (status) {
    case "done":
      return "Fertig";
    case "executing":
      return "Läuft";
    case "idle":
      return "Bereit";
    case "error":
      return "Fehler";
  }
}

function getInitials(nameOrEmail: string) {
  const normalized = nameOrEmail.trim();
  if (!normalized) return "U";

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return normalized.slice(0, 2).toUpperCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const { theme = "system", setTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const canvases = useQuery(
    api.canvases.list,
    session?.user && !isSessionPending ? {} : "skip",
  );
  const createCanvas = useMutation(api.canvases.create);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const displayName = session?.user.name?.trim() || session?.user.email || "Nutzer";
  const initials = getInitials(displayName);

  const handleSignOut = async () => {
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

  const balanceCents = 4320;
  const reservedCents = 180;
  const monthlyPoolCents = 5000;
  const usagePercent = Math.round(
    ((monthlyPoolCents - balanceCents) / monthlyPoolCents) * 100,
  );

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
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
                  <span className="hidden text-sm font-medium md:inline">
                    {displayName}
                  </span>
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
        {/* Greeting & Context */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">
            Guten Tag, {displayName}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Überblick über deine Credits und laufende Generierungen.
          </p>
        </div>

        {/* Credits & Active Generation — asymmetric two-column */}
        <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Credits Section */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="size-3.5" />
              <span>Credit-Guthaben</span>
            </div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">
              {formatEurFromCents(balanceCents)}
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Reserviert</span>
                <span className="tabular-nums font-medium">
                  {formatEurFromCents(reservedCents)}
                </span>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">
                    Monatskontingent
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {usagePercent}%
                  </span>
                </div>
                <Progress value={usagePercent} className="h-1.5" />
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground/80">
              Bei fehlgeschlagenen Jobs werden reservierte Credits automatisch
              freigegeben.
            </p>
          </div>

          {/* Active Generation */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm shadow-foreground/3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-3.5" />
                <span>Aktive Generierung</span>
              </div>
              <Badge className="gap-1.5 font-normal">
                <span className="relative inline-flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/60 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
                </span>
                Läuft
              </Badge>
            </div>

            <h2 className="mt-4 text-lg font-medium">
              Produktfotos — Variante 3/4
            </h2>

            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Fortschritt</span>
                <span className="font-medium tabular-nums">62%</span>
              </div>
              <Progress value={62} className="h-1.5" />
            </div>

            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Step 2 von 4 —{" "}
              <span className="font-mono text-[0.7rem]">flux-schnell</span>
            </p>
          </div>
        </div>

        {/* Workspaces */}
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
              Workspaces
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              type="button"
              onClick={handleCreateWorkspace}
              disabled={isCreatingWorkspace || isSessionPending || !session?.user}
            >
              {isCreatingWorkspace ? "Erstelle..." : "Neuer Workspace"}
            </Button>
          </div>

          {isSessionPending || canvases === undefined ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Workspaces werden geladen...
            </div>
          ) : canvases.length === 0 ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm shadow-foreground/3">
              Noch kein Workspace vorhanden. Mit &quot;Neuer Workspace&quot; legst du den
              ersten an.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {canvases.map((canvas) => (
                <button
                  key={canvas._id}
                  type="button"
                  onClick={() => router.push(`/canvas/${canvas._id}`)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm shadow-foreground/3 transition-all",
                    "hover:bg-muted/60 hover:shadow-md hover:shadow-foreground/4",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-sm font-semibold text-primary">
                    {canvas.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{canvas.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Canvas</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Activity className="size-3.5 text-muted-foreground" />
            Letzte Aktivität
          </div>

          <div className="rounded-xl border bg-card shadow-sm shadow-foreground/3">
            <div className="divide-y">
              {mockRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <StatusDot status={run.status} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">
                        {run.workspace}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {run.node}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {run.model !== "—" && (
                        <span className="font-mono text-[0.7rem]">
                          {run.model}
                        </span>
                      )}
                      {run.credits > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{run.credits} ct</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="text-xs text-muted-foreground">
                      {statusLabel(run.status)}
                    </span>
                    <p className="mt-0.5 text-[0.7rem] text-muted-foreground/70">
                      {run.updated}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
