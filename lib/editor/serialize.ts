import { generateHTML, generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { createEditorExtensions } from "@/lib/editor/extensions";
import { prepareEditorHtmlForSave, type PrepareEditorHtmlOptions } from "@/lib/editor/prepare-html";

export function editorJsonToHtml(json: JSONContent | null | undefined, options: PrepareEditorHtmlOptions = {}) {
  if (!json) return "";
  const html = generateHTML(json, createEditorExtensions());
  return prepareEditorHtmlForSave(html, options);
}

export function parseEditorJson(value: string | JSONContent | null | undefined): JSONContent | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value) as JSONContent;
  } catch {
    return null;
  }
}

export function emptyEditorDocument(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function plainTextToEditorDocument(text: string): JSONContent {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) return emptyEditorDocument();

  return {
    type: "doc",
    content: paragraphs.map((part) => ({
      type: "paragraph",
      content: [{ type: "text", text: part }]
    }))
  };
}

export function htmlToEditorDocument(html: string, options: PrepareEditorHtmlOptions = {}): JSONContent {
  const trimmed = prepareEditorHtmlForSave(html.trim(), options);
  if (!trimmed) return emptyEditorDocument();
  if (!/<[^>]+>/.test(trimmed)) {
    return plainTextToEditorDocument(trimmed);
  }

  try {
    const parsed = generateJSON(trimmed, createEditorExtensions()) as JSONContent;
    if (parsed?.type === "doc" && Array.isArray(parsed.content) && parsed.content.length) {
      return parsed;
    }
  } catch {
    // fall through to plain-text extraction
  }

  return plainTextToEditorDocument(trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function extractMediaAssetIds(json: JSONContent | null | undefined): string[] {
  const ids = new Set<string>();

  function walk(node: JSONContent) {
    if (node.type === "image" && node.attrs?.mediaAssetId) {
      ids.add(String(node.attrs.mediaAssetId));
    }
    node.content?.forEach(walk);
  }

  if (json) walk(json);
  return Array.from(ids);
}

export function processEditorSubmission(
  jsonInput: string | JSONContent | null | undefined,
  options: PrepareEditorHtmlOptions = {}
): { json: JSONContent; html: string; mediaAssetIds: string[] } {
  const json = parseEditorJson(jsonInput) ?? emptyEditorDocument();
  const html = editorJsonToHtml(json, options);
  const mediaAssetIds = extractMediaAssetIds(json);
  return { json, html, mediaAssetIds };
}
