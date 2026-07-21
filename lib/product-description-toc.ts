export type ProductDescriptionTocEntry = {
  id: string;
  label: string;
  kind: "heading" | "feature";
};

export type ProductDescriptionTocResult = {
  html: string;
  entries: ProductDescriptionTocEntry[];
};

const TOC_TARGET_RE =
  /<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>|<(div)(\s[^>]*\bdata-type=["']feature-card["'][^>]*)>/gi;

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeBasicEntities(value.replace(/<[^>]+>/g, " "));
}

function readAttribute(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? "";
}

function slugifyAnchor(value: string) {
  return decodeBasicEntities(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function uniqueId(base: string, used: Set<string>) {
  const fallback = "section";
  const root = slugifyAnchor(base) || fallback;
  let candidate = root;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${root}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function injectIdAttribute(openTagAttrs: string, id: string) {
  if (/\bid\s*=/i.test(openTagAttrs)) {
    return openTagAttrs.replace(/\bid\s*=\s*(["'])[\s\S]*?\1/i, ` id="${id}"`);
  }
  return `${openTagAttrs} id="${id}"`;
}

/**
 * Extract TOC entries from product description HTML and inject stable ids
 * onto h2/h3 headings and TipTap feature-card blocks so anchor links work.
 */
export function prepareProductDescriptionToc(html: string): ProductDescriptionTocResult {
  const trimmed = html.trim();
  if (!trimmed) {
    return { html: "", entries: [] };
  }

  const usedIds = new Set<string>();
  const entries: ProductDescriptionTocEntry[] = [];
  let output = "";
  let lastIndex = 0;

  for (const match of trimmed.matchAll(TOC_TARGET_RE)) {
    const full = match[0];
    const start = match.index ?? 0;
    output += trimmed.slice(lastIndex, start);

    const headingTag = match[1]?.toLowerCase();
    if (headingTag === "h2" || headingTag === "h3") {
      const attrs = match[2] ?? "";
      const inner = match[3] ?? "";
      const label = stripTags(inner);
      if (!label) {
        output += full;
        lastIndex = start + full.length;
        continue;
      }

      const existingId = readAttribute(attrs, "id");
      const id = existingId ? uniqueId(existingId, usedIds) : uniqueId(label, usedIds);
      const nextAttrs = injectIdAttribute(attrs, id);
      output += `<${headingTag}${nextAttrs}>${inner}</${headingTag}>`;
      entries.push({ id, label, kind: "heading" });
      lastIndex = start + full.length;
      continue;
    }

    const attrs = match[5] ?? "";
    const titleAttr = decodeBasicEntities(readAttribute(attrs, "data-title"));
    const label = titleAttr || "Feature";
    const existingId = readAttribute(attrs, "id");
    const id = existingId ? uniqueId(existingId, usedIds) : uniqueId(label, usedIds);
    const nextAttrs = injectIdAttribute(attrs, id);
    output += `<div${nextAttrs}>`;
    entries.push({ id, label, kind: "feature" });
    lastIndex = start + full.length;
  }

  output += trimmed.slice(lastIndex);
  return { html: output, entries };
}

export const PRODUCT_SPECS_ANCHOR_ID = "product-specs";
