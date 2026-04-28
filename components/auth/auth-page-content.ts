export type AuthSocialProvider = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
};

export const socialProviders: AuthSocialProvider[] = [
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

export function toGermanSignInAuthError(message?: string) {
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
}

export function toGermanSignUpAuthError(message?: string) {
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

export function getAuthSocialPlaceholderMessage(
  provider: string,
  flow: "sign-in" | "sign-up",
) {
  const action = flow === "sign-in" ? "Login" : "Signup";
  return `${provider}-${action} ist aktuell als Platzhalter eingebunden.`;
}
