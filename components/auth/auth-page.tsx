import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";

import type { AuthSocialProvider } from "@/components/auth/auth-page-content";

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {children}
    </div>
  );
}

export function AuthCard({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm ${compact ? "space-y-4" : "space-y-6"}`}
    >
      {children}
    </div>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function AuthField({
  label,
  className,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label htmlFor={inputProps.id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <input
        {...inputProps}
        className={
          className ??
          "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        }
      />
    </div>
  );
}

export function AuthMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "warning" | "success";
}) {
  const className = {
    error: "text-sm text-red-500",
    warning: "text-sm text-amber-600",
    success: "text-sm text-emerald-600",
  }[tone];
  const role = tone === "error" ? "alert" : "status";
  const live = tone === "error" ? "assertive" : "polite";

  return (
    <p className={className} role={role} aria-live={live} aria-atomic="true">
      {children}
    </p>
  );
}

export function AuthSocialProviders({
  providers,
  onSelect,
}: {
  providers: AuthSocialProvider[];
  onSelect: (provider: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-center text-muted-foreground">Oder mit externen Anbietern</p>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => onSelect(provider.name)}
          className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <span aria-hidden className="inline-block w-6 text-left">
            {provider.icon}
          </span>
          {provider.name} {provider.subtitle}
        </button>
      ))}
    </div>
  );
}

export function AuthFooterLink({
  text,
  href,
  label,
}: {
  text: string;
  href: string;
  label: string;
}) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {text}{" "}
      <Link href={href} className="font-medium text-primary hover:underline">
        {label}
      </Link>
    </p>
  );
}
