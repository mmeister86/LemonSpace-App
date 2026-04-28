import { describe, expect, it } from "vitest";

import {
  getAuthSocialPlaceholderMessage,
  socialProviders,
  toGermanSignInAuthError,
  toGermanSignUpAuthError,
} from "@/components/auth/auth-page-content";

describe("auth page shared content", () => {
  it("keeps the social provider placeholders shared", () => {
    expect(socialProviders).toEqual([
      { id: "google", name: "Google", subtitle: "Platzhalter", icon: "G" },
      { id: "apple", name: "Apple", subtitle: "Platzhalter", icon: "" },
    ]);
  });

  it("keeps German sign-in error copy", () => {
    expect(toGermanSignInAuthError()).toBe(
      "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
    );
    expect(toGermanSignInAuthError("Invalid credentials")).toBe(
      "E-Mail/Username oder Passwort ist nicht korrekt.",
    );
    expect(toGermanSignInAuthError("verification required")).toBe(
      "Bitte bestätige zuerst deine E-Mail-Adresse.",
    );
    expect(toGermanSignInAuthError("username mismatch")).toBe(
      "Username oder Passwort ist nicht korrekt.",
    );
    expect(toGermanSignInAuthError("unknown auth error")).toBe(
      "Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.",
    );
  });

  it("keeps German sign-up error copy", () => {
    expect(toGermanSignUpAuthError()).toBe(
      "Registrierung fehlgeschlagen. Bitte versuche es erneut.",
    );
    expect(toGermanSignUpAuthError("email already exists")).toBe(
      "Diese E-Mail-Adresse wird bereits verwendet.",
    );
    expect(toGermanSignUpAuthError("username already exists")).toBe(
      "Dieser Username ist bereits vergeben.",
    );
    expect(toGermanSignUpAuthError("password is weak")).toBe(
      "Das Passwort erfüllt die Anforderungen nicht.",
    );
    expect(toGermanSignUpAuthError("invalid username")).toBe(
      "Der Username enthält ungültige Zeichen.",
    );
    expect(toGermanSignUpAuthError("unknown auth error")).toBe(
      "Registrierung fehlgeschlagen. Bitte prüfe deine Eingaben.",
    );
  });

  it("keeps social placeholder message copy per auth flow", () => {
    expect(getAuthSocialPlaceholderMessage("Google", "sign-in")).toBe(
      "Google-Login ist aktuell als Platzhalter eingebunden.",
    );
    expect(getAuthSocialPlaceholderMessage("Apple", "sign-up")).toBe(
      "Apple-Signup ist aktuell als Platzhalter eingebunden.",
    );
  });
});
