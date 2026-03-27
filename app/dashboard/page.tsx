"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation } from "convex/react";
import {
  ChevronDown,
  Coins,
  LayoutTemplate,
  Monitor,
  Moon,
  Search,
  Sun,
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
import { authClient } from "@/lib/auth-client";
import { CreditOverview } from "@/components/dashboard/credit-overview";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import CanvasCard from "@/components/dashboard/canvas-card";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import { useAuthQuery } from "@/hooks/use-auth-query";


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
  const welcomeToastSentRef = useRef(false);
  const { theme = "system", setTheme } = useTheme();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const canvases = useAuthQuery(
    api.canvases.list,
    session?.user && !isSessionPending ? {} : "skip",
  );
  const createCanvas = useMutation(api.canvases.create);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const displayName = session?.user.name?.trim() || session?.user.email || "Nutzer";
  const initials = getInitials(displayName);

  useEffect(() => {
    if (!session?.user || welcomeToastSentRef.current) return;
    const key = `ls-dashboard-welcome-${session.user.id}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    welcomeToastSentRef.current = true;
    sessionStorage.setItem(key, "1");
    toast.success(msg.auth.welcomeOnDashboard.title);
  }, [session?.user]);

  const handleSignOut = async () => {
    toast.info(msg.auth.signedOut.title);
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

        {/* Credits Overview */}
        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Coins className="size-3.5 text-muted-foreground" />
            Credit-Übersicht
          </div>
          <CreditOverview />
        </section>

        {/* Workspaces */}
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
              disabled={isCreatingWorkspace || isSessionPending || !session?.user}
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
              {canvases.map((canvas) => (
                <CanvasCard
                  key={canvas._id}
                  canvas={canvas}
                  onNavigate={(id) => router.push(`/canvas/${id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent Transactions */}
        <section className="mb-12">
          <RecentTransactions />
        </section>
      </main>
    </div>
  );
}
