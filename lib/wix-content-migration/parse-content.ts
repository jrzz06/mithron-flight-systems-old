import sanitizeHtml from "sanitize-html";
import { normalizeProductDescriptionHtml } from "../product-description-normalize.ts";
import {
  parseSemanticProductHtml,
  scrubPollutedSpecs,
  type SemanticProductContent
} from "../wix/semantic-content-parser.ts";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { maximizeWixMediaUrl } from "./images.ts";
import type { CmsContentPayload, MigratedImage, SpecEntry, TipTapDoc, TipTapNode } from "./types.ts";

const TABLE_BLOCK_PATTERN = /<table\b[\s\S]*?<\/table>/gi;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function extractTableSpecs(html: string): SpecEntry[] {
  const specs: SpecEntry[] = [];
  const seen = new Set<string>();

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripTags(cell[1]).trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const key = cells[0];
    const value = cells.slice(1).join(" · ").trim();
    if (!key || !value) continue;
    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    specs.push({ key, value });
  }

  return specs;
}

export function stripHtmlTables(html: string) {
  return html.replace(TABLE_BLOCK_PATTERN, " ").replace(/\s{2,}/g, " ").trim();
}

export function sanitizeOverviewHtml(raw: string): string {
  const withoutTables = stripHtmlTables(raw);
  const cleaned = sanitizeHtml(withoutTables, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "span"
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      span: []
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      b: "strong",
      i: "em",
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" })
    },
    exclusiveFilter(frame) {
      return frame.tag === "span" && !frame.text.trim();
    }
  });

  const normalized = normalizeProductDescriptionHtml(cleaned);
  return (normalized ?? cleaned).replace(/\u0000/g, "").trim();
}

function textNode(text: string, marks?: TipTapNode["marks"]): TipTapNode {
  return marks?.length ? { type: "text", text, marks } : { type: "text", text };
}

function parseInline(html: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  const tokenPattern = /<(strong|b|em|i|u|s|a)(\s[^>]*)?>([\s\S]*?)<\/\1>|<br\s*\/?>|([^<]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html)) !== null) {
    if (match[4]) {
      const text = decodeEntities(match[4]);
      if (text) nodes.push(textNode(text));
      continue;
    }
    if (/^br$/i.test(match[0]) || match[0].startsWith("<br")) {
      nodes.push({ type: "hardBreak" });
      continue;
    }
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const inner = match[3] ?? "";
    const plain = stripTags(inner);
    if (!plain) continue;
    if (tag === "a") {
      const href = attrs.match(/href=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
      if (!href || /^(javascript:|#)/i.test(href)) {
        nodes.push(textNode(plain));
      } else {
        nodes.push(textNode(plain, [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }]));
      }
      continue;
    }
    const markType = tag === "b" || tag === "strong"
      ? "bold"
      : tag === "i" || tag === "em"
        ? "italic"
        : tag === "u"
          ? "underline"
          : "strike";
    nodes.push(textNode(plain, [{ type: markType }]));
  }
  return nodes.length ? nodes : [];
}

function paragraphFromHtml(inner: string): TipTapNode | null {
  const content = parseInline(inner);
  if (!content.length) {
    const plain = stripTags(inner);
    if (!plain) return null;
    return { type: "paragraph", content: [textNode(plain)] };
  }
  return { type: "paragraph", content };
}

export function htmlToTipTapDoc(html: string): TipTapDoc {
  const content: TipTapNode[] = [];
  const blockPattern = /<(h[1-4]|p|ul|ol|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let matched = false;

  while ((match = blockPattern.exec(html)) !== null) {
    matched = true;
    const tag = match[1].toLowerCase();
    const inner = match[3] ?? "";

    if (tag.startsWith("h")) {
      const level = Number(tag.slice(1));
      const plain = stripTags(inner);
      if (!plain) continue;
      content.push({
        type: "heading",
        attrs: { level: Math.min(Math.max(level, 1), 4) },
        content: parseInline(inner).length ? parseInline(inner) : [textNode(plain)]
      });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((item) => {
          const itemContent = parseInline(item[1]);
          const plain = stripTags(item[1]);
          if (!itemContent.length && !plain) return null;
          return {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: itemContent.length ? itemContent : [textNode(plain)]
              }
            ]
          } satisfies TipTapNode;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      if (items.length) {
        content.push({ type: tag === "ul" ? "bulletList" : "orderedList", content: items });
      }
      continue;
    }

    if (tag === "blockquote") {
      const paragraph = paragraphFromHtml(inner);
      if (paragraph) content.push({ type: "blockquote", content: [paragraph] });
      continue;
    }

    const paragraph = paragraphFromHtml(inner);
    if (paragraph) content.push(paragraph);
  }

  if (!matched) {
    const plain = stripTags(html);
    if (plain) {
      for (const part of plain.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean)) {
        content.push({ type: "paragraph", content: [textNode(part)] });
      }
    }
  }

  if (!content.length) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return { type: "doc", content };
}

export function specificationsToRecord(entries: SpecEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    const value = entry.value.trim();
    if (!key || !value) continue;
    if (!(key in result)) result[key] = value;
  }
  return scrubPollutedSpecs(result);
}

export function recordToSpecifications(specs: Record<string, string> | null | undefined): SpecEntry[] {
  return Object.entries(specs ?? {})
    .filter(([key, value]) => key.trim() && String(value).trim())
    .map(([key, value]) => ({ key, value: String(value) }));
}

function mergeSpecEntries(...groups: SpecEntry[][]): SpecEntry[] {
  const seen = new Set<string>();
  const merged: SpecEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      const key = entry.key.trim();
      const value = entry.value.trim();
      if (!key || !value) continue;
      const normalized = key.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push({ key, value });
    }
  }
  return merged;
}

function semanticToSpecEntries(semantic: SemanticProductContent): SpecEntry[] {
  return recordToSpecifications({
    ...semantic.highlight_specs,
    ...semantic.technical_specs
  });
}

function plainTextLength(html: string) {
  return stripTags(html).length;
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prefer the fullest Wix HTML body — semantic overview often truncates list-heavy descriptions. */
export function pickRichestOverviewHtml(...candidates: Array<string | null | undefined>) {
  const cleaned = candidates
    .map((value) => stripHtmlTables(String(value ?? "").trim()))
    .filter(Boolean);
  if (!cleaned.length) return "";
  cleaned.sort((left, right) => plainTextLength(right) - plainTextLength(left));
  return cleaned[0];
}

function containsSnippet(haystackPlain: string, needleHtml: string) {
  const needle = stripTags(needleHtml).slice(0, 48).toLowerCase().trim();
  if (!needle) return true;
  return haystackPlain.includes(needle);
}

export function assembleFullOverviewHtml(wix: WixProductSnapshot, semantic: SemanticProductContent, rawHtml: string) {
  const semanticHtml = semantic.overview_html?.trim()
    || (semantic.overview_plain?.trim()
      ? semantic.overview_plain
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `<p>${escapeHtmlText(part)}</p>`)
        .join("")
      : "");

  let overview = pickRichestOverviewHtml(
    rawHtml,
    wix.rich?.description_html,
    semanticHtml,
    wix.description_plain ? `<p>${escapeHtmlText(wix.description_plain)}</p>` : ""
  );

  const overviewPlain = stripTags(overview).toLowerCase();
  const extras: string[] = [];

  for (const section of wix.rich?.info_sections ?? []) {
    if (section.kind === "specs" || section.kind === "faq" || section.kind === "downloads") continue;
    const sectionHtml = stripHtmlTables(section.html || "").trim();
    if (!sectionHtml || containsSnippet(overviewPlain, sectionHtml)) continue;
    extras.push(`<h3>${escapeHtmlText(section.title)}</h3>`, sectionHtml);
  }

  if (semantic.features.length) {
    const featureItems = semantic.features
      .map((feature) => {
        const label = feature.title.trim();
        const body = feature.body.trim();
        if (!label) return "";
        const text = body && body.toLowerCase() !== label.toLowerCase() ? `${label}: ${body}` : label;
        if (containsSnippet(overviewPlain, text)) return "";
        return `<li>${escapeHtmlText(text)}</li>`;
      })
      .filter(Boolean);
    if (featureItems.length) {
      extras.push("<h3>Features</h3>", `<ul>${featureItems.join("")}</ul>`);
    }
  }

  if (semantic.package_contents.length && !/package contents|what'?s in the box|in the box/i.test(overviewPlain)) {
    extras.push(
      "<h3>Package Contents</h3>",
      `<ul>${semantic.package_contents.map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`
    );
  }

  if (semantic.applications?.trim() && !containsSnippet(overviewPlain, semantic.applications)) {
    extras.push("<h3>Applications</h3>", `<p>${escapeHtmlText(semantic.applications.trim())}</p>`);
  }

  if (semantic.warranty?.trim() && !containsSnippet(overviewPlain, semantic.warranty)) {
    extras.push("<h3>Warranty</h3>", `<p>${escapeHtmlText(semantic.warranty.trim())}</p>`);
  }

  if (extras.length) {
    overview = [overview, ...extras].filter(Boolean).join("\n");
  }

  return overview;
}

export function collectWixProductImages(wix: WixProductSnapshot): MigratedImage[] {
  const urls = [
    ...(wix.media_urls ?? []),
    ...(wix.rich?.media_urls ?? [])
  ];
  const images: MigratedImage[] = [];
  const seen = new Set<string>();

  for (const rawUrl of urls) {
    const url = maximizeWixMediaUrl(String(rawUrl ?? "").trim());
    if (!url) continue;
    const key = url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    images.push({
      url,
      alt: wix.name,
      order: images.length,
      sourceUrl: url
    });
  }

  return images;
}

export function parseWixProductContent(wix: WixProductSnapshot): CmsContentPayload {
  const rawHtml = String(wix.rich?.description_html || wix.description_plain || "").trim();
  const sectionHtml = (wix.rich?.info_sections ?? [])
    .map((section) => section.html)
    .filter(Boolean)
    .join("\n");
  const combinedForSpecs = [rawHtml, sectionHtml].filter(Boolean).join("\n");

  const semantic = wix.rich?.semantic
    ?? parseSemanticProductHtml(rawHtml, {
      productName: wix.name,
      mediaSrc: wix.media_urls[0] ?? "",
      sectionHtml
    });

  const tableSpecs = extractTableSpecs(combinedForSpecs);
  const richSpecs = recordToSpecifications({
    ...(wix.rich?.specs ?? {}),
    ...(wix.rich?.technical_specs ?? {})
  });
  const semanticSpecs = semanticToSpecEntries(semantic);
  const specifications = mergeSpecEntries(tableSpecs, richSpecs, semanticSpecs);

  const overviewSource = assembleFullOverviewHtml(wix, semantic, rawHtml);
  const overview = sanitizeOverviewHtml(overviewSource);
  const overviewJson = htmlToTipTapDoc(overview);
  const images = collectWixProductImages(wix);

  return {
    overview,
    overviewJson,
    specifications,
    images
  };
}

export function assertNonEmptyContent(payload: CmsContentPayload) {
  const hasOverview = Boolean(payload.overview.trim() && stripTags(payload.overview));
  const hasSpecs = payload.specifications.length > 0;
  const hasImages = payload.images.length > 0;
  return { hasOverview, hasSpecs, hasImages, hasAny: hasOverview || hasSpecs || hasImages };
}

export function overviewContainsHtmlTable(html: string) {
  return /<table\b[\s\S]*?<\/table>/i.test(html);
}
