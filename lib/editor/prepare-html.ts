import { decodeDescriptionEntities } from "@/lib/product-description-normalize";
import { sanitizeEditorHtml, type SanitizeEditorHtmlOptions } from "@/lib/editor/sanitize";

export type PrepareEditorHtmlOptions = SanitizeEditorHtmlOptions;

function escapePlainText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Decode entity-encoded markup (including double-encoded `&lt;p&gt;` blobs). */
export function decodeEscapedEditorHtml(raw: string) {
  let value = String(raw ?? "").trim();
  if (!value) return "";

  for (let pass = 0; pass < 5; pass += 1) {
    if (!/&(?:lt|gt|amp|quot|#39|#x27|nbsp);/i.test(value)) break;
    const decoded = decodeDescriptionEntities(value);
    if (decoded === value) break;
    value = decoded;
  }

  return value.trim();
}

function looksLikeHtml(value: string) {
  return /<[a-z][a-z0-9]*[\s>\/]/i.test(value);
}

function plainTextToSemanticHtml(text: string) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";

  return paragraphs
    .map((part) => {
      const lines = part.split(/\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length <= 1) {
        return `<p>${escapePlainText(part)}</p>`;
      }
      return `<p>${lines.map((line) => escapePlainText(line)).join("<br />")}</p>`;
    })
    .join("");
}

/** Remove empty wrappers and editor cruft after sanitization. */
export function cleanupEditorHtmlMarkup(html: string) {
  let value = html.trim();
  if (!value) return "";

  for (let i = 0; i < 8; i += 1) {
    // Drop empty wrapper spans, but keep spans that carry class, data-*, or style
    // (editor color / highlight marks live on style= spans).
    const next = value.replace(
      /<span(?=\s|>)(?![^>]*\bclass=)(?![^>]*\bdata-)(?![^>]*\bstyle=)[^>]*>([\s\S]*?)<\/span>/gi,
      "$1"
    );
    if (next === value) break;
    value = next;
  }

  value = value.replace(/<strong>\s*<strong>([\s\S]*?)<\/strong>\s*<\/strong>/gi, "<strong>$1</strong>");
  value = value.replace(/<b>\s*<b>([\s\S]*?)<\/b>\s*<\/b>/gi, "<b>$1</b>");
  value = value.replace(/<em>\s*<em>([\s\S]*?)<\/em>\s*<\/em>/gi, "<em>$1</em>");
  value = value.replace(/<i>\s*<i>([\s\S]*?)<\/i>\s*<\/i>/gi, "<i>$1</i>");
  value = value.replace(/<u>\s*<u>([\s\S]*?)<\/u>\s*<\/u>/gi, "<u>$1</u>");
  value = value.replace(/<s>\s*<s>([\s\S]*?)<\/s>\s*<\/s>/gi, "<s>$1</s>");

  value = value.replace(/<(\w+)(\s[^>]*)?>\s*(?:<br\s*\/?>\s*)*<\/\1>/gi, "");
  value = value.replace(/(<br\s*\/?>\s*){2,}/gi, "<br />");
  value = value.replace(/<p>\s*<\/p>/gi, "");
  value = value.replace(/<p>(\s*<p>)+/gi, "<p>");
  value = value.replace(/(<\/p>\s*)+<\/p>/gi, "</p>");

  return value.trim();
}

/**
 * Normalize CMS/editor HTML for save and render.
 * Sanitizes markup; optionally strips color/highlight for product descriptions.
 */
export function prepareEditorHtmlForDisplay(raw: string | null | undefined, options: PrepareEditorHtmlOptions = {}) {
  const decoded = decodeEscapedEditorHtml(String(raw ?? ""));
  if (!decoded) return "";

  const html = looksLikeHtml(decoded) ? decoded : plainTextToSemanticHtml(decoded);
  if (!html) return "";

  return cleanupEditorHtmlMarkup(sanitizeEditorHtml(html, options));
}

export function prepareEditorHtmlForSave(raw: string | null | undefined, options: PrepareEditorHtmlOptions = {}) {
  return prepareEditorHtmlForDisplay(raw, options);
}

/** Plain text for aria labels, meta, and search — strips tags after normalization. */
export function editorHtmlToPlainText(raw: string | null | undefined) {
  const prepared = prepareEditorHtmlForDisplay(raw);
  const source = prepared || String(raw ?? "");
  return source
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
