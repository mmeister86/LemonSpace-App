import type { Tour } from "nextstepjs";

const stepDefaults = {
  showControls: true,
  showSkip: true,
  pointerPadding: 12,
  pointerRadius: 12,
};

export const onboardingTours: Tour[] = [
  {
    tour: "dashboardTour",
    steps: [
      {
        ...stepDefaults,
        icon: null,
        title: "Willkommen in LemonSpace",
        content:
          "Hier startest du neue Arbeitsbereiche, behältst Credits im Blick und findest deine letzten Medien wieder.",
        selector: '[data-onboarding="dashboard-header"]',
        side: "bottom",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Credits im Blick",
        content:
          "Generierungen verbrauchen Credits. Die Übersicht zeigt dir, was verfügbar ist und was gerade reserviert wurde.",
        selector: '[data-onboarding="dashboard-credits"]',
        side: "bottom",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Ersten Arbeitsbereich erstellen",
        content:
          "Ein Arbeitsbereich öffnet den Canvas. Dort baust du deinen ersten Prompt-zu-Output-Workflow.",
        selector: '[data-onboarding="dashboard-create-workspace"]',
        side: "left",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Medien kommen hier zurück",
        content:
          "Sobald du Bilder, Videos oder Assets erzeugst, findest du sie in der Medienübersicht wieder.",
        selector: '[data-onboarding="dashboard-media"]',
        side: "top",
      },
    ],
  },
  {
    tour: "canvasTour",
    steps: [
      {
        ...stepDefaults,
        icon: null,
        title: "Das ist dein Canvas",
        content:
          "Auf der Fläche verbindest du Quellen, Prompts und Outputs zu einem visuellen Workflow.",
        selector: '[data-onboarding="canvas-surface"]',
        side: "left",
        pointerPadding: 4,
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Knoten hinzufügen",
        content:
          "Nutze die Palette links oder das Plus in der Toolbar, um einen KI-Bild-Prompt einzufügen.",
        selector: '[data-onboarding="canvas-add-node"]',
        side: "bottom",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Prompt schreiben",
        content:
          "Beschreibe kurz, was entstehen soll. Ein konkreter Prompt ist der schnellste Weg zum ersten Output.",
        selector: '[data-onboarding="canvas-prompt-input"]',
        side: "right",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Bild generieren",
        content:
          "Wenn der Prompt steht, startet dieser Button die Generierung und legt rechts einen Output-Knoten an.",
        selector: '[data-onboarding="canvas-generate-button"]',
        side: "right",
      },
      {
        ...stepDefaults,
        icon: null,
        title: "Dein erster Output",
        content:
          "Fertige Ergebnisse bleiben als Output-Knoten im Workflow und tauchen später auch in der Medienbibliothek auf.",
        selector: '[data-onboarding="canvas-output-node"]',
        side: "left",
      },
    ],
  },
];
