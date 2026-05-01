"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas editor js text editor node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type EditorJS from "@editorjs/editorjs";
import type {
  EditorConfig,
  I18nDictionary,
  OutputData,
  ToolConstructable,
} from "@editorjs/editorjs";

type EditorJsTextEditorProps = {
  data: OutputData;
  placeholder?: string;
  loadingLabel: string;
  i18nMessages: I18nDictionary;
  onChange: (data: OutputData) => void;
  onRequestClose: () => void;
};

export default function EditorJsTextEditor({
  data,
  placeholder = "Text eingeben...",
  loadingLabel,
  i18nMessages,
  onChange,
  onRequestClose,
}: EditorJsTextEditorProps) {
  const reactId = useId();
  const holderId = `text-node-editor-${reactId.replace(/:/g, "")}`;
  const editorRef = useRef<EditorJS | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const initialDataRef = useRef(data);
  const onChangeRef = useRef(onChange);
  const onRequestCloseRef = useRef(onRequestClose);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    let isDisposed = false;
    let editor: EditorJS | null = null;

    async function initializeEditor() {
      const [{ default: EditorJSConstructor }, { default: Header }, { default: List }] =
        await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
        ]);

      if (isDisposed) {
        return;
      }

      const config: EditorConfig = {
        holder: holderId,
        data: initialDataRef.current,
        autofocus: true,
        placeholder,
        i18n: {
          messages: i18nMessages,
        },
        inlineToolbar: ["bold", "italic", "link"],
        tools: {
          header: {
            class: Header as unknown as ToolConstructable,
            inlineToolbar: ["bold", "italic", "link"],
            config: {
              levels: [2, 3],
              defaultLevel: 2,
            },
          },
          list: {
            class: List as unknown as ToolConstructable,
            inlineToolbar: ["bold", "italic", "link"],
            config: {
              defaultStyle: "unordered",
              maxLevel: 3,
            },
          },
        },
        onChange: async () => {
          if (!editor || isDisposed) {
            return;
          }
          const output = await editor.save();
          if (!isDisposed) {
            onChangeRef.current(output);
          }
        },
      };

      editor = new EditorJSConstructor(config);
      editorRef.current = editor;

      try {
        await editor.isReady;
        if (!isDisposed) {
          setIsLoading(false);
          editor.focus();
        }
      } catch (error) {
        console.error("[TextNode] Editor.js initialization failed", error);
      }
    }

    void initializeEditor();

    return () => {
      isDisposed = true;
      const currentEditor = editorRef.current;
      editorRef.current = null;
      if (currentEditor) {
        currentEditor.destroy();
      }
    };
  }, [holderId, i18nMessages, placeholder]);

  const persistAndClose = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      onRequestCloseRef.current();
      return;
    }

    void editor.save().then((output) => {
      onChangeRef.current(output);
      onRequestCloseRef.current();
    });
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      persistAndClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [persistAndClose]);

  return (
    <div
      ref={rootRef}
      className="nodrag nowheel min-h-[220px] rounded-md border border-border bg-background/95 px-3 py-2 text-sm shadow-inner"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          persistAndClose();
        }
      }}
    >
      {isLoading ? (
        <div className="py-2 text-sm text-muted-foreground">{loadingLabel}</div>
      ) : null}
      <div
        id={holderId}
        className="text-node-editorjs min-h-[190px] [&_.ce-block__content]:max-w-none [&_.ce-toolbar__content]:max-w-none [&_.codex-editor]:text-sm [&_.codex-editor__redactor]:pb-2 [&_.ce-paragraph]:leading-6 [&_.ce-header]:font-semibold [&_.ce-header]:tracking-normal"
      />
    </div>
  );
}
