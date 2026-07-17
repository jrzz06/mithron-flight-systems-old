import type { EditorAiAction } from "@/lib/editor/types";

const BASE_ACTION_PROMPTS: Record<Exclude<EditorAiAction, "normalize_structure">, string> = {
  improve: "Improve the writing while preserving meaning.",
  rewrite: "Rewrite the text with fresh phrasing while preserving meaning.",
  expand: "Expand the text with useful detail.",
  shorten: "Shorten the text while preserving key facts.",
  professional: "Rewrite in a professional enterprise tone.",
  marketing: "Rewrite in persuasive marketing copy.",
  technical: "Rewrite in precise technical language.",
  translate: "Translate to clear English."
};

export const PRODUCT_NORMALIZE_PROMPT = `Refine this product description into clean structured plain text.
Rules:
- Preserve every fact, value, and specification exactly.
- Do not add marketing language or invent specifications.
- Remove malformed characters, duplicate lines, and broken encoding.
- Use one spec per line as Label: Value.
- Use section headers on their own line ending with a colon (Sensors:, Package Contents:, Warranty:, Notes:).
- Use "- item" lines under list sections.
- Keep intro paragraphs as plain prose when present.
- Return plain text only, no HTML or markdown.`;

export const PRODUCT_NORMALIZE_SYSTEM =
  "You edit product catalog descriptions for a drone commerce store. Preserve specifications exactly. Never invent SKUs, prices, or commercial terms. Rewrite description text only. Return only the rewritten passage with no preamble.";

function isProductDescriptionDocument(documentType?: string) {
  return documentType === "product_description" || documentType === "supplier_product_description";
}

export function isProductDescriptionDocumentType(documentType?: string) {
  return isProductDescriptionDocument(documentType);
}

export function buildEditorAiSystemPrompt(documentType?: string) {
  if (isProductDescriptionDocument(documentType)) {
    return PRODUCT_NORMALIZE_SYSTEM;
  }
  return "You edit selected passages for a drone commerce CMS. Return only the rewritten passage with no preamble.";
}

export function buildEditorAiUserPrompt(input: {
  action: EditorAiAction;
  text: string;
  documentType?: string;
}) {
  if (input.action === "normalize_structure") {
    return `${PRODUCT_NORMALIZE_PROMPT}\n\nText:\n${input.text}`;
  }

  const prompt = BASE_ACTION_PROMPTS[input.action];
  return `${prompt}\n\nText:\n${input.text}`;
}

export function productDescriptionAiActions(): Array<{ id: EditorAiAction; label: string }> {
  return [
    { id: "normalize_structure", label: "Normalize structure" },
    { id: "improve", label: "Improve writing" },
    { id: "rewrite", label: "Rewrite" },
    { id: "shorten", label: "Shorten" },
    { id: "professional", label: "Professional tone" },
    { id: "technical", label: "Technical tone" }
  ];
}

export function defaultEditorAiActions(): Array<{ id: EditorAiAction; label: string }> {
  return [
    { id: "improve", label: "Improve writing" },
    { id: "rewrite", label: "Rewrite" },
    { id: "expand", label: "Expand" },
    { id: "shorten", label: "Shorten" },
    { id: "professional", label: "Professional tone" },
    { id: "marketing", label: "Marketing tone" },
    { id: "technical", label: "Technical tone" },
    { id: "translate", label: "Translate" }
  ];
}
