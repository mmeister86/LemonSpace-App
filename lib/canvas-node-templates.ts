export const CANVAS_NODE_TEMPLATES = [
  {
    type: "image",
    label: "Bild",
    width: 280,
    height: 180,
    defaultData: {},
  },
  {
    type: "text",
    label: "Text",
    width: 256,
    height: 120,
    defaultData: { content: "" },
  },
  {
    type: "prompt",
    label: "KI-Bild",
    width: 320,
    height: 220,
    defaultData: { prompt: "", model: "", aspectRatio: "1:1" },
  },
  {
    type: "note",
    label: "Notiz",
    width: 220,
    height: 120,
    defaultData: { content: "" },
  },
  {
    type: "frame",
    label: "Frame",
    width: 360,
    height: 240,
    defaultData: { label: "Untitled", exportWidth: 1080, exportHeight: 1080 },
  },
  {
    type: "compare",
    label: "Compare",
    width: 500,
    height: 380,
    defaultData: {},
  },
] as const;

export type CanvasNodeTemplate = (typeof CANVAS_NODE_TEMPLATES)[number];
