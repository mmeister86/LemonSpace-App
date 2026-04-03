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

function toGermanAuthError(message?: string) {
  if (!message) {
    return "Registrierung fehlgeschlagen. Bitte versuche es erneut.";
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("email") && normalized.includes("already")) {
    return "Diese E-Mail-Adresse wird bereits verwendet.";
  }

  if (normalized.includes("username") && normalized.includes("already")) {
    return "Dieser Username ist bereits vergeben.";
  }

  if (normalized.includes("password")) {
    return "Das Passwort erfüllt die Anforderungen nicht.";
  }

  if (normalized.includes("invalid username")) {
    return "Der Username enthält ungültige Zeichen.";
  }

  return "Registrierung fehlgeschlagen. Bitte prüfe deine Eingaben.";
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
        setError(toGermanAuthError(result.error.message));
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
    setSocialMessage(`${provider}-Signup ist aktuell als Platzhalter eingebunden.`);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8 shadow-sm">
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
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Konto erstellen 🍋</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Erstelle dein LemonSpace-Konto
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1.5">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Dein Name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="name@beispiel.de"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium mb-1.5">
              Username (optional)
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
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
              minLength={8}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              placeholder="Mindestens 8 Zeichen"
            />
          </div>

          {error && (
            <p
              className="text-sm text-red-500"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              {error}
            </p>
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
            <p
              className="text-sm text-amber-600"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {socialMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Wird erstellt…" : "Konto erstellen"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Bereits ein Konto?{" "}
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
