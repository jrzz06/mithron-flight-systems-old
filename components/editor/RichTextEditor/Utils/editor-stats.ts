import type { JSONContent } from "@tiptap/core";

export function countEditorWords(json: JSONContent | null | undefined) {
  const text = extractPlainText(json);
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countEditorCharacters(json: JSONContent | null | undefined) {
  return extractPlainText(json).length;
}

export function estimateReadingMinutes(json: JSONContent | null | undefined) {
  const words = countEditorWords(json);
  return Math.max(1, Math.round(words / 200));
}

function extractPlainText(json: JSONContent | null | undefined) {
  if (!json) return "";
  const parts: string[] = [];
  function walk(node: JSONContent) {
    if (node.type === "text" && node.text) parts.push(node.text);
    node.content?.forEach(walk);
  }
  walk(json);
  return parts.join(" ");
}
