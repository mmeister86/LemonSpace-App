"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const socialProviders = [
  {
    id: "google",
    name: "Google",
    subtitle: "Platzhalter",
    icon: "G",
  },
  {
    id: "apple",
    name: "Apple",
    subtitle: "Platzhalter",
    icon: "",
  },
];

export default function SignInPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [magicLinkMessage, setMagicLinkMessage] = useState("");
  const [socialMessage, setSocialMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const toGermanAuthError = (message?: string) => {
    if (!message) {
      return "Anmeldung fehlgeschlagen. Bitte versuche es erneut.";
    }

    const normalized = message.toLowerCase();

    if (normalized.includes("invalid") || normalized.includes("credentials")) {
      return "E-Mail/Username oder Passwort ist nicht korrekt.";
    }

    if (normalized.includes("verify") || normalized.includes("verification")) {
      return "Bitte bestätige zuerst deine E-Mail-Adresse.";
    }

    if (normalized.includes("username")) {
      return "Username oder Passwort ist nicht korrekt.";
    }

    return "Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.";
  };

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
        setError(toGermanAuthError(result.error.message));
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
        setError(toGermanAuthError(result.error.message));
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
    setSocialMessage(`${provider}-Login ist aktuell als Platzhalter eingebunden.`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Willkommen zurück 🍋</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Melde dich bei LemonSpace an
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium mb-1.5">
              E-Mail oder Username
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="name@beispiel.de oder dein Username"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Dein Passwort"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-center text-muted-foreground">Oder mit externen Anbietern</p>
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleSocialPlaceholder(provider.name)}
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <span aria-hidden className="inline-block w-6 text-left">{provider.icon}</span>
                {provider.name} {provider.subtitle}
              </button>
            ))}
          </div>

          {socialMessage && (
            <p className="text-sm text-amber-600">{socialMessage}</p>
          )}

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
          {magicLinkMessage && (
            <p className="text-sm text-emerald-600">{magicLinkMessage}</p>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Noch kein Konto?{" "}
          <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}
