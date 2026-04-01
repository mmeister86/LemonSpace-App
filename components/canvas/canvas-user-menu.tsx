"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
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

type CanvasUserMenuProps = {
  compact?: boolean;
};

export function CanvasUserMenu({ compact = false }: CanvasUserMenuProps) {
  const t = useTranslations('toasts');
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const displayName = session?.user.name?.trim() || session?.user.email || "Nutzer";
  const initials = getInitials(displayName);

  const handleSignOut = async () => {
    toast.info(t('auth.signedOut'));
    await authClient.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  };

  if (isPending && !session?.user) {
    return (
      <div className="border-t p-3">
        <div
          className={
            compact
              ? "mx-auto h-9 w-9 animate-pulse rounded-full bg-muted/60"
              : "h-10 animate-pulse rounded-lg bg-muted/60"
          }
        />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="border-t border-border/80 p-2">
        <div className="flex flex-col items-center gap-1.5">
          <Avatar className="size-9 shrink-0 border border-border/60">
            <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            asChild
            title="Dashboard"
          >
            <Link href="/dashboard" aria-label="Dashboard">
              <LayoutDashboard className="size-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            type="button"
            title="Abmelden"
            aria-label="Abmelden"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/80 p-3">
      <div className="flex items-center gap-2.5">
        <Avatar className="size-9 shrink-0 border border-border/60">
          <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          {session?.user.email ? (
            <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="h-9 w-full justify-start" asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="mr-2 size-4 shrink-0" />
            Dashboard
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start text-muted-foreground"
          type="button"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="mr-2 size-4 shrink-0" />
          Abmelden
        </Button>
      </div>
    </div>
  );
}
