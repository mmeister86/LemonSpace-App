"use client";

/**
 * Onboarding note:
 * Next.js App Router module for page. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

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
  toGermanSignUpAuthError,
} from "@/components/auth/auth-page-content";

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const MAX_USERNAME_ATTEMPTS = 8;

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[_\.]+|[_\.]+$/g, "");
}

function truncateWithSuffix(base: string, suffix = "") {
  const allowedBaseLength = Math.max(MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH - suffix.length);
  const safeBase = base.slice(0, allowedBaseLength);
  return `${safeBase}${suffix}`.slice(0, MAX_USERNAME_LENGTH);
}

function fallbackUsernameFromInput(name: string, email: string) {
  const emailLocalPart = email.split("@")[0] ?? "";
  const fromName = normalizeUsername(name);
  const fromEmail = normalizeUsername(emailLocalPart);
  const candidate = fromName || fromEmail || "user";

  if (candidate.length >= MIN_USERNAME_LENGTH) {
    return candidate.slice(0, MAX_USERNAME_LENGTH);
  }

  return truncateWithSuffix(`${candidate}user`);
}

async function isUsernameAvailable(username: string) {
  try {
    const result = await authClient.isUsernameAvailable({ username });

    if (result.error) {
      return null;
    }

    return result.data?.available === true;
  } catch {
    return null;
  }
}

async function getAvailableUsername(base: string) {
  const normalizedBase = normalizeUsername(base);
  const seeded =
    normalizedBase.length >= MIN_USERNAME_LENGTH
      ? normalizedBase
      : truncateWithSuffix(`${normalizedBase || "user"}user`);

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 0 ? "" : `.${Math.floor(100 + Math.random() * 900)}`;
    const candidate = truncateWithSuffix(seeded, suffix);
    const available = await isUsernameAvailable(candidate);

    if (available === true) {
      return candidate;
    }

    if (available === null) {
      return candidate;
    }
  }

  return truncateWithSuffix(seeded, `.${Date.now().toString().slice(-4)}`);
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [generateUsername, setGenerateUsername] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [socialMessage, setSocialMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSocialMessage("");
    setLoading(true);

    try {
      const trimmedUsername = username.trim();
      let finalUsername: string | undefined;

      if (trimmedUsername) {
        const normalizedInput = normalizeUsername(trimmedUsername);

        if (normalizedInput.length < MIN_USERNAME_LENGTH) {
          setError("Dein Username ist zu kurz (mindestens 3 Zeichen).");
          return;
        }

        const availability = await isUsernameAvailable(normalizedInput);

        if (availability === false) {
          setError("Dieser Username ist bereits vergeben.");
          return;
        }

        finalUsername = normalizedInput;
      } else if (generateUsername) {
        const generatedBase = fallbackUsernameFromInput(name, email);
        finalUsername = await getAvailableUsername(generatedBase);
      }

      const result = await authClient.signUp.email({
        email,
        password,
        name,
        username: finalUsername,
      });

      if (result.error) {
        setError(toGermanSignUpAuthError(result.error.message));
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialPlaceholder = (provider: string) => {
    setError("");
    setSocialMessage(getAuthSocialPlaceholderMessage(provider, "sign-up"));
  };

  if (success) {
    return (
      <AuthPageShell>
        <AuthCard compact>
          <div className="text-center" role="status" aria-live="polite" aria-atomic="true">
            <div className="text-4xl mb-3">📧</div>
            <h1 className="text-xl font-semibold">E-Mail bestätigen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Wir haben dir eine E-Mail an <strong>{email}</strong> geschickt.
              Klicke auf den Link, um dein Konto zu aktivieren.
            </p>
          </div>
          <button
            onClick={() => router.push("/auth/sign-in")}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Zum Login
          </button>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <AuthHeader title="Konto erstellen 🍋" subtitle="Erstelle dein LemonSpace-Konto" />

        <form onSubmit={handleSignUp} className="space-y-4">
          <AuthField
            id="name"
            label="Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Dein Name"
          />

          <AuthField
            id="email"
            label="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@beispiel.de"
          />

          <div className="space-y-2">
            <AuthField
              id="username"
              label="Username (optional)"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="z. B. max.mustermann"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={generateUsername}
                onChange={(e) => setGenerateUsername(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Username automatisch aus Name oder E-Mail generieren, wenn das Feld leer ist.
            </label>
          </div>

          <AuthField
            id="password"
            label="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Mindestens 8 Zeichen"
          />

          {error && <AuthMessage tone="error">{error}</AuthMessage>}

          <AuthSocialProviders providers={socialProviders} onSelect={handleSocialPlaceholder} />

          {socialMessage && <AuthMessage tone="warning">{socialMessage}</AuthMessage>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Wird erstellt…" : "Konto erstellen"}
          </button>
        </form>

        <AuthFooterLink text="Bereits ein Konto?" href="/auth/sign-in" label="Anmelden" />
      </AuthCard>
    </AuthPageShell>
  );
}
