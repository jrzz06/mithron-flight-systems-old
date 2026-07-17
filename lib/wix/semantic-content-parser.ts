import { decodeHtml } from "./catalog-normalize.ts";
import type { StorySection } from "../../config/types.ts";

export type SemanticFeature = {
  title: string;
  body: string;
};

export type SemanticProductContent = {
  overview_html: string;
  overview_plain: string;
  tagline: string;
  features: SemanticFeature[];
  highlight_specs: Record<string, string>;
  technical_specs: Record<string, string>;
  package_contents: string[];
  warranty: string;
  disclaimers: string[];
  applications: string;
  downloads: Array<{ label: string; url: string }>;
  story_chapters: StorySection[];
};

const KNOWN_TECHNICAL_LABELS = [
  "Operating Altitude",
  "Maximum Operating Altitude",
  "Maximum All-Up-Weight",
  "Maximum Takeoff Weight",
  "Wind Resistance",
  "Maximum Speed",
  "Range (LoS)",
  "Range",
  "Endurance",
  "UAV Category",
  "UAV Type",
  "Payload Capacity",
  "Payload",
  "Battery Cell Configuration",
  "Battery Charging Time",
  "Battery Capacity",
  "Nominal Capacity (mAh)",
  "Nominal Voltage (V)",
  "Battery",
  "Flight Time",
  "Dimensions",
  "Weight",
  "Storage",
  "Camera",
  "Sensor",
  "Resolution",
  "Transmission Range",
  "Max Transmission Range",
  "Spray Tank",
  "Liquid Spray Tank",
  "Spreader Tank",
  "Spreader Tank Capacity",
  "Spreader Radius",
  "Spray Swath",
  "Spray Width",
  "Nozzles",
  "Tank Capacity",
  "Input Voltage",
  "Discharge",
  "Working Temperature",
  "Shipping Weight",
  "Shipping Dimensions"
];

const DISCLAIMER_PATTERN = /exclusive of gst|gst extra|terms and conditions|disclaimer|not included|subject to change|without prior notice|tax extra/i;
const PACKAGE_LINE_PATTERN = /(?:–|-)\s*\d+\s*(unit|units|set|sets|parts?|pcs|piece|pieces)\b/i;
const WARRANTY_PATTERN = /\b\d+[\s-]*(?:year|yr)s?\s+warranty\b|warranty card\b/i;

const FEATURE_TITLE_PATTERN =
  /(?:^|[\n\r]+|(?<=[.!?]\s)|(?<=\s)(?=\d+(?:\.\d+)?\s*[KMG]?))((?:\d+(?:\.\d+)?\s*[KMG]?(?:\s+|(?=[A-Za-z]))?)?[A-Za-z][^\n:.]{1,58}?):\s+/g;

const JUNK_OVERVIEW_PREFIX =
  /^(?:specification|specifications|technical specification|technical specifications|details|video|overview|description|product description)\s*[:\-–]?\s*/i;

function trimSpecValue(value: string) {
  return value.split(/\n/)[0].trim().replace(/[.,;]+$/, "");
}

function stripTags(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function htmlToPlainParagraphs(html: string) {
  const blocks: string[] = [];
  for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const plain = stripTags(match[1]).trim();
    if (plain) blocks.push(plain);
  }
  if (!blocks.length && html.trim()) {
    const plain = stripTags(html).trim();
    if (plain) blocks.push(...plain.split(/\n+/).map((line) => line.trim()).filter(Boolean));
  }
  return blocks;
}

function parseListItems(html: string) {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripTags(match[1]).trim())
    .filter(Boolean);
  if (items.length) return items;
  return html
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function parseTableSpecs(html: string) {
  const specs: Record<string, string> = {};
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripTags(cell[1]).trim())
      .filter(Boolean);
    if (cells.length >= 2) specs[cells[0]] = cells.slice(1).join(" · ");
  }
  return specs;
}

function canonicalSpecLabel(label: string) {
  const match = KNOWN_TECHNICAL_LABELS.find((known) => known.toLowerCase() === label.trim().toLowerCase());
  return match ?? label.trim();
}

function isKnownTechnicalLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return KNOWN_TECHNICAL_LABELS.some((known) => known.toLowerCase() === normalized);
}

export function isMeasurableTechnicalValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 72) return false;
  if (/[.!?]\s+[A-Z]/.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 12) return false;
  return /\d/.test(trimmed) || /^(yes|no|n\/a|ip\d+|in stock|out of stock)$/i.test(trimmed);
}

function isCategoricalSpecValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 48) return false;
  if (/[.!?]/.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 5) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\s\-\/\(\)\.+°%]*$/i.test(trimmed);
}

function isValidTechnicalSpecValue(label: string, value: string) {
  const trimmed = trimSpecValue(value);
  if (!trimmed) return false;
  if (isKnownTechnicalLabel(label)) {
    return isMeasurableTechnicalValue(trimmed) || isCategoricalSpecValue(trimmed);
  }
  return isMeasurableTechnicalValue(trimmed);
}

function isMarketingFeatureTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  if (isKnownTechnicalLabel(title)) return false;
  return /navigation|performance|storage|camera|capture|app support|function|design|safety|intelligent|smart|precision|stable|vertical|high-speed|ample/i.test(normalized);
}

export function classifyColonPair(title: string, body: string): "spec" | "feature" | "disclaimer" {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim().split(/\n/)[0]?.trim() ?? "";
  if (!trimmedTitle || !trimmedBody) return "feature";
  if (DISCLAIMER_PATTERN.test(trimmedTitle) || DISCLAIMER_PATTERN.test(trimmedBody)) return "disclaimer";
  if (isKnownTechnicalLabel(trimmedTitle) && isValidTechnicalSpecValue(trimmedTitle, trimmedBody)) return "spec";
  if (isMeasurableTechnicalValue(trimmedBody) && trimmedBody.length <= 48 && !isMarketingFeatureTitle(trimmedTitle)) {
    return "spec";
  }
  return "feature";
}

export function parseColonPairsFromText(text: string) {
  const pairs: Array<{ title: string; body: string }> = [];
  const matches = [...text.matchAll(FEATURE_TITLE_PATTERN)];
  if (!matches.length) return pairs;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = (match[1] ?? "").trim();
    if (!title) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    if (body) pairs.push({ title, body });
  }

  return pairs;
}

function filterTechnicalSpecs(specs: Record<string, string>) {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    const label = canonicalSpecLabel(key);
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (isKnownTechnicalLabel(label) && isValidTechnicalSpecValue(label, trimmed)) {
      filtered[label] = trimmed;
      continue;
    }
    if (!isMarketingFeatureTitle(label) && isMeasurableTechnicalValue(trimmed)) {
      filtered[label] = trimmed;
    }
  }
  return filtered;
}

function cleanOverviewLabel(text: string) {
  return text.replace(JUNK_OVERVIEW_PREFIX, "").trim();
}

function parseDashListSpecs(html: string) {
  const specs: Record<string, string> = {};
  for (const match of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = stripTags(match[1]).trim();
    const dash = text.match(/^(.{2,48}?)\s+[-–]\s+(.+)$/);
    const colon = text.match(/^(.{2,48}?):\s+(.+)$/);
    const [, label, value] = dash ?? colon ?? [];
    if (label && value && isKnownTechnicalLabel(label) && isValidTechnicalSpecValue(label, value)) {
      specs[canonicalSpecLabel(label)] = trimSpecValue(value);
    }
  }
  return specs;
}

function isSpecListItemText(text: string) {
  const trimmed = text.trim();
  const dash = trimmed.match(/^(.{2,48}?)\s+[-–]\s+(.+)$/);
  const colon = trimmed.match(/^(.{2,48}?):\s+(.+)$/);
  const [, label, value] = dash ?? colon ?? [];
  if (!label || !value) return false;
  return isKnownTechnicalLabel(label) && isValidTechnicalSpecValue(label, value);
}

function isSpecOnlyParagraph(text: string) {
  const colonPairs = parseColonPairsFromText(text);
  if (colonPairs.length > 0) {
    return colonPairs.every((pair) => classifyColonPair(pair.title, pair.body) === "spec");
  }
  return isSpecListItemText(text);
}

function stripSpecBlocksFromHtml(html: string) {
  let working = html;

  for (const match of [...working.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]) {
    const plain = stripTags(match[1]).trim();
    if (plain && isSpecOnlyParagraph(plain)) {
      working = working.replace(match[0], "");
    }
  }

  for (const match of [...working.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]) {
    const plain = stripTags(match[1]).trim();
    if (plain && isSpecListItemText(plain)) {
      working = working.replace(match[0], "");
    }
  }

  for (const match of [...working.matchAll(/<table[\s\S]*?<\/table>/gi)]) {
    const specs = parseTableSpecs(match[0]);
    if (Object.keys(specs).length >= 2) {
      working = working.replace(match[0], "");
    }
  }

  return working;
}

function splitOverviewHtml(html: string, packageLines: string[], disclaimerLines: string[]) {
  let working = html;
  for (const line of [...packageLines, ...disclaimerLines]) {
    working = working.replace(line, "");
  }
  working = stripSpecBlocksFromHtml(working);
  working = working.replace(/<p[^>]*>\s*<\/p>/gi, "");
  working = working.replace(/<ul[^>]*>\s*<\/ul>/gi, "");
  return working.trim();
}

function buildStoryChapters(
  content: Omit<SemanticProductContent, "story_chapters">,
  mediaSrc: string,
  productName: string
): StorySection[] {
  const chapters: StorySection[] = [];
  const media = { src: mediaSrc, alt: productName, kind: "image" as const };

  for (const [index, feature] of content.features.entries()) {
    chapters.push({
      id: `feature-${index}`,
      kicker: "Features",
      title: feature.title,
      body: feature.body,
      media,
      align: "left"
    });
  }

  if (content.applications.trim()) {
    chapters.push({
      id: "applications",
      kicker: "Applications",
      title: "Applications",
      body: content.applications,
      media,
      align: "left"
    });
  }

  if (content.warranty.trim()) {
    chapters.push({
      id: "warranty",
      kicker: "Warranty",
      title: "Warranty",
      body: content.warranty,
      media,
      align: "left"
    });
  }

  if (content.disclaimers.length) {
    chapters.push({
      id: "disclaimers",
      kicker: "Disclaimers",
      title: "Important notes",
      body: content.disclaimers.join("\n\n"),
      media,
      align: "left"
    });
  }

  if (content.downloads.length) {
    chapters.push({
      id: "downloads",
      kicker: "Downloads",
      title: "Documents & downloads",
      body: content.downloads.map((doc) => `${doc.label}: ${doc.url}`).join("\n"),
      media,
      align: "left"
    });
  }

  return chapters;
}

export function parseSemanticProductHtml(
  html: string,
  options?: { productName?: string; mediaSrc?: string; sectionTitle?: string; sectionHtml?: string }
): SemanticProductContent {
  const productName = options?.productName ?? "Product";
  const mediaSrc = options?.mediaSrc ?? "";
  const combinedHtml = [html, options?.sectionHtml ?? ""].filter(Boolean).join("\n");

  const features: SemanticFeature[] = [];
  const highlight_specs: Record<string, string> = {};
  const technical_specs: Record<string, string> = {};
  const package_contents: string[] = [];
  const disclaimers: string[] = [];
  let warranty = "";
  let applications = "";
  const downloads: Array<{ label: string; url: string }> = [];
  const overviewParagraphs: string[] = [];

  Object.assign(technical_specs, filterTechnicalSpecs(parseTableSpecs(combinedHtml)));
  Object.assign(highlight_specs, filterTechnicalSpecs(parseDashListSpecs(combinedHtml)));

  for (const paragraph of htmlToPlainParagraphs(combinedHtml)) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const parts = sentences.length > 1 ? sentences : [paragraph];

    for (const part of parts) {
      if (DISCLAIMER_PATTERN.test(part)) {
        disclaimers.push(part);
        continue;
      }
      if (WARRANTY_PATTERN.test(part)) {
        warranty = warranty ? `${warranty}\n${part}` : part;
        continue;
      }
      if (PACKAGE_LINE_PATTERN.test(part)) {
        package_contents.push(part);
        continue;
      }

      const colonPairs = parseColonPairsFromText(part);
      if (colonPairs.length) {
        for (const pair of colonPairs) {
          const kind = classifyColonPair(pair.title, pair.body);
          if (kind === "spec") {
            highlight_specs[canonicalSpecLabel(pair.title)] = trimSpecValue(pair.body);
          } else if (kind === "disclaimer") {
            disclaimers.push(pair.body);
          } else {
            features.push({ title: pair.title, body: pair.body });
          }
        }
        continue;
      }

      if (part.length > 50 && overviewParagraphs.length < 3 && !isSpecOnlyParagraph(part)) {
        const cleaned = cleanOverviewLabel(part);
        if (cleaned.length > 50) {
          overviewParagraphs.push(cleaned);
        }
      }
    }
  }

  if (options?.sectionTitle && options.sectionHtml) {
    const title = options.sectionTitle.toLowerCase();
    const sectionPlain = stripTags(options.sectionHtml);
    if (/spec|technical|parameter/.test(title)) {
      Object.assign(technical_specs, filterTechnicalSpecs(parseTableSpecs(options.sectionHtml)));
      for (const pair of parseColonPairsFromText(sectionPlain)) {
        if (classifyColonPair(pair.title, pair.body) === "spec") {
          technical_specs[canonicalSpecLabel(pair.title)] = trimSpecValue(pair.body);
        }
      }
    } else if (/feature|highlight|benefit/.test(title)) {
      features.push(...parseListItems(options.sectionHtml).map((item) => ({ title: item.split(":")[0]?.trim() || item, body: item })));
      for (const pair of parseColonPairsFromText(sectionPlain)) {
        if (classifyColonPair(pair.title, pair.body) === "feature") {
          features.push(pair);
        }
      }
    } else if (/included|package|content|what.?s in/.test(title)) {
      package_contents.push(...parseListItems(options.sectionHtml));
    } else if (/warranty/.test(title)) {
      warranty = sectionPlain;
    } else if (/disclaimer|note|gst|terms/.test(title)) {
      disclaimers.push(sectionPlain);
    } else if (/application|use case|mission/.test(title)) {
      applications = sectionPlain;
    } else if (/download|document|manual|brochure/.test(title)) {
      for (const match of options.sectionHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        downloads.push({ url: match[1].trim(), label: stripTags(match[2]).trim() || match[1].trim() });
      }
    }
  }

  const overview_plain = overviewParagraphs.join("\n\n").trim();
  const overview_html = overview_plain
    ? overviewParagraphs.map((paragraph) => `<p>${paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("")
    : splitOverviewHtml(html, package_contents, disclaimers);

  const semanticBase = {
    overview_html,
    overview_plain: overview_plain || (overview_html ? stripTags(overview_html) : ""),
    tagline: overview_plain.slice(0, 180),
    features: dedupeFeatures(features),
    highlight_specs,
    technical_specs: { ...highlight_specs, ...technical_specs },
    package_contents: [...new Set(package_contents)],
    warranty,
    disclaimers: [...new Set(disclaimers)],
    applications,
    downloads
  };

  return {
    ...semanticBase,
    story_chapters: buildStoryChapters(semanticBase, mediaSrc, productName)
  };
}

function dedupeFeatures(features: SemanticFeature[]) {
  const seen = new Set<string>();
  const result: SemanticFeature[] = [];
  for (const feature of features) {
    const key = feature.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(feature);
  }
  return result;
}

export function mergeSemanticContent(parts: SemanticProductContent[]): SemanticProductContent {
  const merged: SemanticProductContent = {
    overview_html: "",
    overview_plain: "",
    tagline: "",
    features: [],
    highlight_specs: {},
    technical_specs: {},
    package_contents: [],
    warranty: "",
    disclaimers: [],
    applications: "",
    downloads: [],
    story_chapters: []
  };

  for (const part of parts) {
    if (!merged.overview_html && part.overview_html) merged.overview_html = part.overview_html;
    if (!merged.overview_plain && part.overview_plain) merged.overview_plain = part.overview_plain;
    if (!merged.tagline && part.tagline) merged.tagline = part.tagline;
    merged.features.push(...part.features);
    Object.assign(merged.highlight_specs, part.highlight_specs);
    Object.assign(merged.technical_specs, part.technical_specs);
    merged.package_contents.push(...part.package_contents);
    if (!merged.warranty && part.warranty) merged.warranty = part.warranty;
    merged.disclaimers.push(...part.disclaimers);
    if (!merged.applications && part.applications) merged.applications = part.applications;
    merged.downloads.push(...part.downloads);
    merged.story_chapters.push(...part.story_chapters);
  }

  merged.features = dedupeFeatures(merged.features);
  merged.package_contents = [...new Set(merged.package_contents)];
  merged.disclaimers = [...new Set(merged.disclaimers)];
  merged.downloads = [...new Map(merged.downloads.map((item) => [item.url, item])).values()];
  merged.technical_specs = filterTechnicalSpecs({ ...merged.highlight_specs, ...merged.technical_specs });
  merged.story_chapters = buildStoryChapters(merged, "", "");
  return merged;
}

export function isPollutedSpecEntry(key: string, value: string) {
  const label = key.trim();
  const body = value.trim();
  if (!label || !body) return true;
  if (isMarketingFeatureTitle(label)) return true;
  if (!isKnownTechnicalLabel(label) && body.length > 72) return true;
  if (!isMeasurableTechnicalValue(body) && body.length > 48) return true;
  return false;
}

export function scrubPollutedSpecs(specs: Record<string, string>) {
  return filterTechnicalSpecs(
    Object.fromEntries(Object.entries(specs).filter(([key, value]) => !isPollutedSpecEntry(key, value)))
  );
}
