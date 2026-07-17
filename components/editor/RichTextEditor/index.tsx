"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createEditorExtensions } from "@/lib/editor/extensions";
import { clearEditorDraft, readEditorDraft, writeEditorDraft } from "@/lib/editor/draft-storage";
import { prepareEditorHtmlForSave } from "@/lib/editor/prepare-html";
import { editorJsonToHtml, emptyEditorDocument, htmlToEditorDocument, parseEditorJson } from "@/lib/editor/serialize";
import type { RichTextEditorFeatures } from "@/lib/editor/types";
import { EditorBubbleMenu } from "@/components/editor/RichTextEditor/BubbleMenu/editor-bubble-menu";
import { handleEditorImageFiles } from "@/components/editor/RichTextEditor/ImageUploader/editor-image-upload";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { SlashCommands } from "@/components/editor/RichTextEditor/SlashCommands/slash-commands";
import { EditorToolbar } from "@/components/editor/RichTextEditor/Toolbar/editor-toolbar";
import { EditorAiMenu } from "@/components/editor/RichTextEditor/Utils/editor-ai-menu";
import { countEditorCharacters, countEditorWords, estimateReadingMinutes } from "@/components/editor/RichTextEditor/Utils/editor-stats";
import { cn } from "@/lib/utils";
import "@/components/editor/RichTextEditor/editor.css";

export type RichTextEditorProps = {
  value?: JSONContent | null;
  onChange?: (value: JSONContent) => void;
  placeholder?: string;
  documentType?: string;
  documentId?: string;
  features?: RichTextEditorFeatures;
  className?: string;
  minHeight?: number;
  name?: string;
  jsonName?: string;
  defaultValue?: string;
  defaultJson?: string | JSONContent;
};

function prepareOptionsForDocument(_documentType?: string) {
  // Keep text color / highlight (background) marks for all document types,
  // including product descriptions, so storefront styling matches the admin editor.
  return {};
}

function resolveInitialContent(props: RichTextEditorProps): JSONContent {
  const options = prepareOptionsForDocument(props.documentType);
  if (props.value) {
    return props.value;
  }
  const parsedJson = parseEditorJson(props.defaultJson);
  if (parsedJson) {
    return parsedJson;
  }
  if (props.defaultValue?.trim()) return htmlToEditorDocument(props.defaultValue, options);
  return emptyEditorDocument();
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing...",
  documentType = "draft",
  documentId = "new",
  features = { ai: true, media: true, fullscreen: true, tables: true, blocks: true },
  className = "",
  minHeight = 220,
  name,
  jsonName,
  defaultValue,
  defaultJson
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadImagesRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const prepareOptions = useMemo(() => prepareOptionsForDocument(documentType), [documentType]);
  const initialContent = useMemo(
    () => resolveInitialContent({ value, defaultJson, defaultValue, documentType }),
    [value, defaultJson, defaultValue, documentType]
  );

  const editor = useEditor({
    extensions: [...createEditorExtensions({ placeholder }), SlashCommands],
    content: initialContent,
    immediatelyRender: false,
    onCreate: ({ editor: createdEditor }) => {
      const draft = readEditorDraft(documentType, documentId);
      if (!draft?.json) {
        return;
      }
      const current = createdEditor.getJSON();
      const draftMatchesDefault = JSON.stringify(draft.json) === JSON.stringify(current);
      // Recover local drafts even when server body_json exists, as long as they differ.
      if ((!value && !defaultJson) || !draftMatchesDefault) {
        if (!draftMatchesDefault) {
          createdEditor.commands.setContent(draft.json as JSONContent, { emitUpdate: false });
          setDraftRecovered(true);
          setIsDirty(true);
        }
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      const json = nextEditor.getJSON();
      onChange?.(json);
      setIsDirty(true);
      writeEditorDraft(documentType, documentId, json);
    },
    editorProps: {
      attributes: {
        class: "ProseMirror",
        "data-placeholder": placeholder
      },
      handleDrop: (view, event) => {
        if (!features.media) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length || !editor) return false;
        event.preventDefault();
        void uploadImagesRef.current(files);
        return true;
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (features.media && files?.length && editor) {
          event.preventDefault();
          void uploadImagesRef.current(files);
          return true;
        }
        return false;
      },
      transformPastedHTML(html) {
        return prepareEditorHtmlForSave(html, prepareOptions);
      }
    }
  });

  const uploadImages = useCallback(async (files: FileList | File[]) => {
    if (!editor) return;
    try {
      await handleEditorImageFiles(editor, files, documentType, documentId);
      const count = Array.from(files).length;
      notify.success(FEEDBACK_MESSAGES.imageUploaded, {
        source: "editor",
        id: `editor:upload:${documentType}:${documentId}`,
        description: count > 1 ? `${count} images inserted.` : undefined
      });
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : FEEDBACK_MESSAGES.uploadFailed,
        { source: "editor", id: `editor:upload-error:${documentType}:${documentId}` }
      );
    }
  }, [documentId, documentType, editor]);

  useEffect(() => {
    uploadImagesRef.current = uploadImages;
  }, [uploadImages]);

  const [serialized, setSerialized] = useState<{ json: string; html: string }>(() => ({
    json: JSON.stringify(initialContent),
    html: editorJsonToHtml(initialContent, prepareOptions)
  }));

  useEffect(() => {
    if (!editor || value === undefined) return;
    const current = JSON.stringify(editor.getJSON());
    const incomingDoc = value ?? emptyEditorDocument();
    const incoming = JSON.stringify(incomingDoc);
    if (current !== incoming) {
      editor.commands.setContent(incomingDoc, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const json = editor.getJSON();
      setSerialized({ json: JSON.stringify(json), html: editorJsonToHtml(json, prepareOptions) });
    };
    sync();
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor, prepareOptions]);

  const stats = useMemo(() => {
    const json = parseEditorJson(serialized.json);
    return {
      characters: countEditorCharacters(json),
      words: countEditorWords(json),
      readingMinutes: estimateReadingMinutes(json)
    };
  }, [serialized.json]);

  if (!editor) {
    return (
      <div data-rich-text-editor className={cn("min-h-[220px] rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)]", className)}>
        {name ? <input type="hidden" name={name} value={serialized.html} /> : null}
        {jsonName ? <input type="hidden" name={jsonName} value={serialized.json} /> : null}
      </div>
    );
  }

  return (
    <div
      data-rich-text-editor
      data-fullscreen={isFullscreen ? "true" : "false"}
      className={cn("overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)]", className)}
      style={{ ["--editor-min-height" as string]: `${minHeight}px` }}
    >
      <EditorToolbar
        editor={editor}
        documentType={documentType}
        isFullscreen={isFullscreen}
        onToggleFullscreen={features.fullscreen ? () => setIsFullscreen((current) => !current) : undefined}
        onInsertImage={
          features.media
            ? () => {
                fileInputRef.current?.click();
              }
            : undefined
        }
      />
      {features.ai ? <EditorAiMenu editor={editor} documentType={documentType} /> : null}
      <EditorBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--platform-border)] px-3 py-2 text-xs text-[var(--platform-text-muted)]">
        <div className="flex flex-wrap gap-3">
          <span>{stats.words} words</span>
          <span>{stats.characters} characters</span>
          <span>~{stats.readingMinutes} min read</span>
        </div>
        <div className="flex items-center gap-2">
          {draftRecovered ? <span className="text-[var(--platform-warning)]">Draft recovered</span> : null}
          {isDirty ? <span className="text-[var(--platform-warning)]">Unsaved changes</span> : <span>Saved</span>}
          {isDirty ? (
            <button
              type="button"
              className="platform-btn-ghost platform-btn-sm"
              onClick={() => {
                clearEditorDraft(documentType, documentId);
                setIsDirty(false);
                setDraftRecovered(false);
              }}
            >
              Clear draft
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          if (!files?.length) return;
          void uploadImagesRef.current(files);
          event.target.value = "";
        }}
      />
      {name ? <input type="hidden" name={name} value={serialized.html} /> : null}
      {jsonName ? <input type="hidden" name={jsonName} value={serialized.json} /> : null}
    </div>
  );
}
