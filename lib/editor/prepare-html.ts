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

  for (let pass = 0; pass < 2; pass += 1) {
    if (!/&(?:lt|gt|amp|quot|#39|#x27|nbsp);/i.test(value)) break;
    const decoded = decodeDescriptionEntities(value);
    if (decoded === value) break;
    const introducedTags = /<[a-z][\s>/]/i.test(decoded) && !/<[a-z][\s>/]/i.test(value);
    const reducedEntities = (decoded.match(/&(?:lt|gt|amp);/gi) ?? []).length
      < (value.match(/&(?:lt|gt|amp);/gi) ?? []).length;
    if (introducedTags || reducedEntities) {
      value = decoded;
      continue;
    }
    break;
  }

  return value.trim();
}

function looksLikeHtml(value: string) {
  return /<[a-z][\s>/]/i.test(value);
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
