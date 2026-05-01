/**
 * Onboarding note:
 * Renders and manages the Canvas text node richtext node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

export {
  createEditorJsDataFromPlainText,
  editorJsDataToPlainText,
  isEditorJsDataEmpty,
  normalizeTextNodeRichText,
  sanitizeEditorJsInlineHtml,
  stripInlineHtml,
  toPersistedEditorJsRichText,
  type EditorJsRichTextData,
} from "@/lib/canvas-rich-text";
