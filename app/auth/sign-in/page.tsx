"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  AuthCard,
  AuthField,
  AuthFooterLink,
  AuthHeader,
  AuthMessage,
  AuthPageShell,
  AuthSocialProviders,
} from "@/components/auth/auth-page";
import {
  getAuthSocialPlaceholderMessage,
  socialProviders,
  toGermanSignInAuthError,
} from "@/components/auth/auth-page-content";

export default function SignInPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [magicLinkMessage, setMagicLinkMessage] = useState("");
  const [socialMessage, setSocialMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMagicLinkMessage("");
    setLoading(true);

    try {
      const trimmedIdentifier = identifier.trim();
      const isEmailInput = trimmedIdentifier.includes("@");

      if (!trimmedIdentifier) {
        setError("Bitte gib deine E-Mail-Adresse oder deinen Username ein.");
        return;
      }

      const result = isEmailInput
        ? await authClient.signIn.email({
            email: trimmedIdentifier,
            password,
          })
        : await authClient.signIn.username({
            username: trimmedIdentifier,
            password,
          });

      if (result.error) {
        setError(toGermanSignInAuthError(result.error.message));
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setError("");
    setMagicLinkMessage("");

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError("Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }

    if (!trimmedIdentifier.includes("@")) {
      setError("Magic Link funktioniert nur mit einer E-Mail-Adresse.");
      return;
    }

    setMagicLinkLoading(true);
    try {
      const result = await authClient.signIn.magicLink({
        email: trimmedIdentifier,
        callbackURL: "/dashboard",
        errorCallbackURL: "/auth/sign-in",
      });

      if (result.error) {
        setError(toGermanSignInAuthError(result.error.message));
      } else {
        setMagicLinkMessage("Magic Link gesendet. Prüfe dein Postfach.");
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten");
    } finally {
      setMagicLinkLoading(false);
    }
  };

  const handleSocialPlaceholder = (provider: string) => {
    setError("");
    setMagicLinkMessage("");
    setSocialMessage(getAuthSocialPlaceholderMessage(provider, "sign-in"));
  };

  return (
    <AuthPageShell>
      <AuthCard>
        <AuthHeader title="Willkommen zurück 🍋" subtitle="Melde dich bei LemonSpace an" />

        <form onSubmit={handleSignIn} className="space-y-4">
          <AuthField
            id="identifier"
            label="E-Mail oder Username"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            placeholder="name@beispiel.de oder dein Username"
            autoCapitalize="none"
            autoCorrect="off"
          />

          <AuthField
            id="password"
            label="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Dein Passwort"
          />

          {error && <AuthMessage tone="error">{error}</AuthMessage>}

          <AuthSocialProviders providers={socialProviders} onSelect={handleSocialPlaceholder} />

          {socialMessage && <AuthMessage tone="warning">{socialMessage}</AuthMessage>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Wird angemeldet…" : "Anmelden"}
          </button>

          <button
            type="button"
            disabled={magicLinkLoading}
            onClick={handleMagicLink}
            className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {magicLinkLoading ? "Wird gesendet…" : "Magic Link senden"}
          </button>
          {magicLinkMessage && <AuthMessage tone="success">{magicLinkMessage}</AuthMessage>}
        </form>

        <AuthFooterLink text="Noch kein Konto?" href="/auth/sign-up" label="Registrieren" />
      </AuthCard>
    </AuthPageShell>
  );
}
