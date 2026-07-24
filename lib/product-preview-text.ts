function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#009;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

/** CMS placeholder notes like "( MORE NUMBER QUANTITIES WILL HAVE A DISCOUNT)". */
function stripQuantityDiscountNoise(value: string) {
  return value
    .replace(/\(\s*more\s+number\s+quantit(?:y|ies)\s+will\s+have\s+a\s+discount\s*\)/gi, " ")
    .replace(/\bmore\s+number\s+quantit(?:y|ies)\s+will\s+have\s+a\s+discount\b/gi, " ")
    .replace(/\(\s*[^)]*quantit(?:y|ies)[^)]*discount[^)]*\)/gi, " ")
    .replace(/\b(bulk|volume|quantity)\s+discount[s]?\s+(available|apply|applies)\b/gi, " ");
}

export function sanitizeProductPreviewText(value: string) {
  return stripQuantityDiscountNoise(
    decodeHtmlEntities(value)
      .replace(/<br[^>]*>?/gi, " ")
      .replace(/<[^>]*$/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/\s+imported from\s+[a-z]:\\.*$/i, "")
      .replace(/[a-z]:\\[^\s]+/gi, "")
      .replace(/([a-z0-9])([.!?])([A-Z])/g, "$1$2 $3")
      .replace(/([a-z])([A-Z])(?=\s+[a-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function clipProductPreviewText(value: string, limit: number) {
  const clean = sanitizeProductPreviewText(value);
  if (clean.length <= limit) return clean;

  const clipped = clean.slice(0, limit).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "");
  return `${clipped}...`;
}
