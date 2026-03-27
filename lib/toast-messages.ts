// Zentrales Dictionary für alle Toast-Strings.
// Spätere i18n: diese Datei gegen Framework-Lookup ersetzen.

export const msg = {
  canvas: {
    imageUploaded: { title: "Bild hochgeladen" },
    uploadFailed: { title: "Upload fehlgeschlagen" },
    uploadFormatError: (format: string) => ({
      title: "Upload fehlgeschlagen",
      desc: `Format „${format}“ wird nicht unterstützt. Erlaubt: PNG, JPG, WebP.`,
    }),
    uploadSizeError: (maxMb: number) => ({
      title: "Upload fehlgeschlagen",
      desc: `Maximale Dateigröße: ${maxMb} MB.`,
    }),
    nodeRemoved: { title: "Element entfernt" },
    nodesRemoved: (count: number) => ({
      title: count === 1 ? "Element entfernt" : `${count} Elemente entfernt`,
    }),
  },

  ai: {
    generating: { title: "Bild wird generiert…" },
    generated: { title: "Bild generiert" },
    generatedDesc: (credits: number) => `${credits} Credits verbraucht`,
    generationFailed: { title: "Generierung fehlgeschlagen" },
    creditsNotCharged: "Credits wurden nicht abgebucht",
    insufficientCredits: (needed: number, available: number) => ({
      title: "Nicht genügend Credits",
      desc: `${needed} Credits benötigt, ${available} verfügbar.`,
    }),
    modelUnavailable: {
      title: "Modell vorübergehend nicht verfügbar",
      desc: "Versuche ein anderes Modell oder probiere es später erneut.",
    },
    contentPolicy: {
      title: "Anfrage durch Inhaltsrichtlinie blockiert",
      desc: "Versuche, den Prompt umzuformulieren.",
    },
    timeout: {
      title: "Generierung abgelaufen",
      desc: "Credits wurden nicht abgebucht.",
    },
    openrouterIssues: {
      title: "OpenRouter möglicherweise gestört",
      desc: "Mehrere Generierungen fehlgeschlagen.",
    },
  },

  export: {
    frameExported: { title: "Frame exportiert" },
    exportingFrames: { title: "Frames werden exportiert…" },
    zipReady: { title: "ZIP bereit" },
    exportFailed: { title: "Export fehlgeschlagen" },
    frameEmpty: {
      title: "Export fehlgeschlagen",
      desc: "Frame hat keinen sichtbaren Inhalt.",
    },
    noFramesOnCanvas: {
      title: "Export fehlgeschlagen",
      desc: "Keine Frames auf dem Canvas — zuerst einen Frame anlegen.",
    },
    download: "Herunterladen",
    downloaded: "Heruntergeladen!",
  },

  auth: {
    welcomeBack: { title: "Willkommen zurück" },
    welcomeOnDashboard: { title: "Schön, dass du da bist" },
    checkEmail: (email: string) => ({
      title: "E-Mail prüfen",
      desc: `Bestätigungslink an ${email} gesendet.`,
    }),
    sessionExpired: {
      title: "Sitzung abgelaufen",
      desc: "Bitte erneut anmelden.",
    },
    signedOut: { title: "Abgemeldet" },
    signIn: "Anmelden",
    initialSetup: {
      title: "Startguthaben aktiv",
      desc: "Du kannst loslegen.",
    },
  },

  billing: {
    subscriptionActivated: (credits: number) => ({
      title: "Abo aktiviert",
      desc: `${credits} Credits deinem Guthaben hinzugefügt.`,
    }),
    creditsAdded: (credits: number) => ({
      title: "Credits hinzugefügt",
      desc: `+${credits} Credits`,
    }),
    subscriptionCancelled: (periodEnd: string) => ({
      title: "Abo gekündigt",
      desc: `Deine Credits bleiben bis ${periodEnd} verfügbar.`,
    }),
    paymentFailed: {
      title: "Zahlung fehlgeschlagen",
      desc: "Bitte Zahlungsmethode aktualisieren.",
    },
    dailyLimitReached: (limit: number) => ({
      title: "Tageslimit erreicht",
      desc: `Maximal ${limit} Generierungen pro Tag in deinem Tarif.`,
    }),
    lowCredits: (remaining: number) => ({
      title: "Credits fast aufgebraucht",
      desc: `Noch ${remaining} Credits übrig.`,
    }),
    topUp: "Aufladen",
    upgrade: "Upgrade",
    manage: "Verwalten",
    redirectingToCheckout: {
      title: "Weiterleitung…",
      desc: "Du wirst zum sicheren Checkout weitergeleitet.",
    },
    openingPortal: {
      title: "Portal wird geöffnet…",
      desc: "Du wirst zur Aboverwaltung weitergeleitet.",
    },
    testGrantFailed: { title: "Gutschrift fehlgeschlagen" },
  },

  system: {
    reconnected: { title: "Verbindung wiederhergestellt" },
    connectionLost: {
      title: "Verbindung verloren",
      desc: "Änderungen werden möglicherweise nicht gespeichert.",
    },
    copiedToClipboard: { title: "In Zwischenablage kopiert" },
  },

  dashboard: {
    renameEmpty: { title: "Name ungültig", desc: "Name darf nicht leer sein." },
    renameSuccess: { title: "Arbeitsbereich umbenannt" },
    renameFailed: { title: "Umbenennen fehlgeschlagen" },
  },
} as const;
