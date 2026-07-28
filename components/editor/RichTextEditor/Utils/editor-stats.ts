import type { JSONContent } from "@tiptap/core";

export function countTextWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function countEditorWords(jsonOrText: JSONContent | string | null | undefined): number {
  if (typeof jsonOrText === "string") {
    const plain = jsonOrText.replace(/<[^>]+>/g, " ");
    return countTextWords(plain);
  }
  const text = extractPlainText(jsonOrText);
  return countTextWords(text);
}

export function countEditorCharacters(jsonOrText: JSONContent | string | null | undefined): number {
  if (typeof jsonOrText === "string") {
    const plain = jsonOrText.replace(/<[^>]+>/g, " ").trim();
    return plain.length;
  }
  return extractPlainText(jsonOrText).length;
}

export function estimateReadingMinutes(jsonOrText: JSONContent | string | null | undefined): number {
  const words = countEditorWords(jsonOrText);
  return Math.max(1, Math.round(words / 200));
}

function extractPlainText(json: JSONContent | null | undefined): string {
  if (!json) return "";
  const parts: string[] = [];

  function walk(node: JSONContent) {
    if (!node) return;
    if (typeof node.text === "string" && node.text) {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(json);
  return parts.join(" ");
}

