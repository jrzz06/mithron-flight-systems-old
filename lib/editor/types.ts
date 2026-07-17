import type { JSONContent } from "@tiptap/core";

export type EditorDocument = JSONContent;

type EditorRole = "admin" | "supplier" | "warehouse";

export type EditorAiAction =
  | "improve"
  | "rewrite"
  | "expand"
  | "shorten"
  | "professional"
  | "marketing"
  | "technical"
  | "translate"
  | "normalize_structure";

export type RichTextEditorFeatures = {
  ai?: boolean;
  media?: boolean;
  fullscreen?: boolean;
  tables?: boolean;
  blocks?: boolean;
};

type EditorDocumentRef = {
  documentType: string;
  documentId: string;
};

type ProcessedEditorContent = {
  json: EditorDocument;
  html: string;
  mediaAssetIds: string[];
};
