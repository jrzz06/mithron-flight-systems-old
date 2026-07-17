import type { Bundle, ProductVariant, StorySection } from "../../config/types.ts";
import type { WixProductSnapshot } from "../wix/catalog-client.ts";
import { normalizeCatalogName } from "../wix/catalog-normalize.ts";
import { plainTextToDescriptionHtml } from "../product-reconcile/score-canonical.ts";
import { isSpecLikeBlob } from "../product-spec-text.ts";
import { isPollutedSpecEntry, scrubPollutedSpecs } from "../wix/semantic-content-parser.ts";

export type MigrationDbRow = {
  slug: string;
  name: string;
  tagline?: string | null;
  price?: number | null;
  compare_at?: number | null;
  on_sale?: boolean | null;
  description?: string | null;
  source_description?: string | null;
  source_catalog_id?: string | null;
  source_url?: string | null;
  source_fingerprint?: string | null;
  source_images?: Array<{ src?: string }> | null;
  source_availability?: string | null;
  source_currency?: string | null;
  category?: string | null;
  badge?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: { src?: string } | null;
  image?: { src?: string } | null;
  hero?: { src?: string } | null;
  gallery?: Array<{ src?: string }> | null;
  variants?: ProductVariant[] | null;
  bundles?: Bundle[] | null;
  story?: StorySection[] | null;
  specs?: Record<string, string> | null;
  anchors?: string[] | null;
  workflow_status?: string | null;
  is_visible?: boolean | null;
  merge_status?: string | null;
};

export type MigrationFieldStatus = "ok" | "missing" | "partial" | "truncated" | "drift";

export type MigrationFieldGap = {
  field: string;
  status: MigrationFieldStatus;
  wix_has: boolean;
  db_has: boolean;
  note?: string;
};

export type ProductMigrationAudit = {
  slug: string;
  wix_slug: string | null;
  name: string;
  matched: boolean;
  completeness_score: number;
  status: "full" | "partial" | "missing" | "unmatched";
  gaps: MigrationFieldGap[];
  missing_fields: string[];
  partial_fields: string[];
  missing_specs: string[];
  missing_media: string[];
};

export type MigrationAuditReport = {
  version: 2;
  generated_at: string;
  summary: {
    wix_count: number;
    db_count: number;
    matched_count: number;
    full_count: number;
    partial_count: number;
    unmatched_wix_count: number;
    unmatched_db_count: number;
    average_completeness: number;
  };
  products: ProductMigrationAudit[];
  wix_only: Array<{ wix_slug: string; name: string }>;
  db_only: Array<{ slug: string; name: string }>;
};

const TRACKED_FIELDS = [
  "description",
  "source_description",
  "tagline",
  "category",
  "seo_title",
  "seo_description",
  "specs",
  "story",
  "variants",
  "gallery",
  "image",
  "badge",
  "bundles.includes",
  "anchors"
] as const;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasHtmlDescription(value: string | null | undefined) {
  if (!hasText(value)) return false;
  return value!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length > 40;
}

function countMeaningfulSpecs(specs: Record<string, string> | null | undefined) {
  const hidden = new Set(["Product ID", "Source", "Currency", "Category", "Availability"]);
  return Object.entries(specs ?? {}).filter(([key, value]) => !hidden.has(key) && value.trim()).length;
}

function isBrokenMedia(src: string | null | undefined) {
  if (!src?.trim()) return true;
  return /placeholder|broken/i.test(src);
}

function compareTextLengths(dbValue: string, wixValue: string) {
  const dbLen = dbValue.trim().length;
  const wixLen = wixValue.trim().length;
  if (!dbLen) return "missing" as const;
  if (!wixLen) return "ok" as const;
  if (dbLen < wixLen * 0.55) return "truncated" as const;
  if (normalizeCatalogName(dbValue) !== normalizeCatalogName(wixValue)) return "partial" as const;
  return "ok" as const;
}

export function matchDbRowToWixProduct(row: MigrationDbRow, wixProducts: WixProductSnapshot[]) {
  const byCatalogId = new Map(wixProducts.map((product) => [product.source_catalog_id, product]));
  const byWixSlug = new Map(wixProducts.map((product) => [product.wix_slug, product]));
  const byUrl = new Map(wixProducts.map((product) => [product.source_url.toLowerCase(), product]));

  if (row.source_catalog_id && byCatalogId.has(row.source_catalog_id)) {
    return byCatalogId.get(row.source_catalog_id)!;
  }
  if (row.source_url && byUrl.has(row.source_url.toLowerCase())) {
    return byUrl.get(row.source_url.toLowerCase())!;
  }
  if (byWixSlug.has(row.slug)) return byWixSlug.get(row.slug)!;

  const normalizedName = normalizeCatalogName(row.name);
  return wixProducts.find((product) => normalizeCatalogName(product.name) === normalizedName) ?? null;
}

export function auditProductMigration(row: MigrationDbRow, wix: WixProductSnapshot | null): ProductMigrationAudit {
  const gaps: MigrationFieldGap[] = [];
  const missingSpecs: string[] = [];
  const missingMedia: string[] = [];

  if (!wix) {
    return {
      slug: row.slug,
      wix_slug: null,
      name: row.name,
      matched: false,
      completeness_score: 0,
      status: "unmatched",
      gaps: [{ field: "wix_match", status: "missing", wix_has: false, db_has: true }],
      missing_fields: ["wix_match"],
      partial_fields: [],
      missing_specs: [],
      missing_media: []
    };
  }

  const wixSpecs = Object.keys(wix.rich.specs);
  const dbSpecCount = countMeaningfulSpecs(row.specs);
  const wixSpecCount = wixSpecs.length;

  const descriptionStatus = compareTextLengths(
    row.description ?? row.source_description ?? "",
    wix.rich.description_html || wix.description_plain
  );
  gaps.push({
    field: "description",
    status: descriptionStatus,
    wix_has: hasText(wix.description_plain) || hasHtmlDescription(wix.rich.description_html),
    db_has: hasHtmlDescription(row.description) || hasText(row.source_description)
  });

  gaps.push({
    field: "source_description",
    status: hasText(row.source_description) ? "ok" : hasText(wix.description_plain) ? "missing" : "ok",
    wix_has: hasText(wix.description_plain),
    db_has: hasText(row.source_description)
  });

  gaps.push({
    field: "specs",
    status: dbSpecCount >= Math.max(3, Math.min(wixSpecCount, 6)) ? "ok" : wixSpecCount ? "missing" : "ok",
    wix_has: wixSpecCount > 0,
    db_has: dbSpecCount > 0,
    note: `db=${dbSpecCount}, wix=${wixSpecCount}`
  });

  for (const key of wixSpecs) {
    if (!row.specs?.[key]?.trim()) missingSpecs.push(key);
  }

  gaps.push({
    field: "story",
    status: (row.story?.length ?? 0) >= wix.rich.story_chapters.length ? "ok" : wix.rich.story_chapters.length ? "partial" : "ok",
    wix_has: wix.rich.story_chapters.length > 0 || wix.rich.info_sections.length > 0,
    db_has: (row.story?.length ?? 0) > 0
  });

  gaps.push({
    field: "variants",
    status: (row.variants?.length ?? 0) >= wix.rich.variants.length ? "ok" : wix.rich.variants.length > 1 ? "missing" : "ok",
    wix_has: wix.rich.variants.length > 0,
    db_has: (row.variants?.length ?? 0) > 0
  });

  const wixGalleryCount = Math.max(0, wix.media_urls.length - 1);
  const dbGalleryCount = row.gallery?.filter((item) => item.src?.trim()).length ?? 0;
  gaps.push({
    field: "gallery",
    status: dbGalleryCount >= wixGalleryCount ? "ok" : wixGalleryCount ? "partial" : "ok",
    wix_has: wixGalleryCount > 0,
    db_has: dbGalleryCount > 0,
    note: `db=${dbGalleryCount}, wix=${wixGalleryCount}`
  });

  if (isBrokenMedia(row.image?.src)) missingMedia.push("primary_image");
  if (wix.media_urls.length && isBrokenMedia(row.image?.src)) missingMedia.push("wix_primary_available");

  gaps.push({
    field: "seo_title",
    status: hasText(row.seo_title) ? "ok" : hasText(wix.rich.seo.title) ? "missing" : "ok",
    wix_has: hasText(wix.rich.seo.title),
    db_has: hasText(row.seo_title)
  });

  gaps.push({
    field: "seo_description",
    status: hasText(row.seo_description) ? "ok" : hasText(wix.rich.seo.description) ? "missing" : "ok",
    wix_has: hasText(wix.rich.seo.description),
    db_has: hasText(row.seo_description)
  });

  gaps.push({
    field: "features",
    status: wix.rich.features.length && !row.story?.some((chapter) => /feature/i.test(chapter.kicker)) ? "missing" : "ok",
    wix_has: wix.rich.features.length > 0,
    db_has: Boolean(row.story?.length)
  });

  gaps.push({
    field: "downloads",
    status: wix.rich.document_urls.length && !row.story?.some((chapter) => /download|document|manual/i.test(chapter.title)) ? "missing" : "ok",
    wix_has: wix.rich.document_urls.length > 0,
    db_has: Boolean(row.story?.some((chapter) => /download|document|manual/i.test(`${chapter.title} ${chapter.kicker}`)))
  });

  const missingFields = gaps.filter((gap) => gap.status === "missing").map((gap) => gap.field);
  const partialFields = gaps.filter((gap) => gap.status === "partial" || gap.status === "truncated").map((gap) => gap.field);
  const scored = gaps.filter((gap) => gap.status === "ok").length;
  const completeness = Math.round((scored / gaps.length) * 100);
  const status: ProductMigrationAudit["status"] =
    completeness >= 90 ? "full" : completeness >= 45 ? "partial" : "missing";

  return {
    slug: row.slug,
    wix_slug: wix.wix_slug,
    name: row.name,
    matched: true,
    completeness_score: completeness,
    status,
    gaps,
    missing_fields: missingFields,
    partial_fields: partialFields,
    missing_specs: missingSpecs,
    missing_media: missingMedia
  };
}

export function buildMigrationAuditReport(
  wixProducts: WixProductSnapshot[],
  dbRows: MigrationDbRow[]
): MigrationAuditReport {
  const activeRows = dbRows.filter((row) => row.merge_status !== "archived_merged");
  const matchedWix = new Set<string>();
  const matchedDb = new Set<string>();
  const products: ProductMigrationAudit[] = [];

  for (const row of activeRows) {
    const wix = matchDbRowToWixProduct(row, wixProducts);
    if (wix) {
      matchedWix.add(wix.wix_product_id);
      matchedDb.add(row.slug);
    }
    products.push(auditProductMigration(row, wix));
  }

  const wixOnly = wixProducts
    .filter((product) => !matchedWix.has(product.wix_product_id) && product.visible)
    .map((product) => ({ wix_slug: product.wix_slug, name: product.name }));

  const dbOnly = activeRows
    .filter((row) => !matchedDb.has(row.slug) && row.is_visible !== false)
    .map((row) => ({ slug: row.slug, name: row.name }));

  const matchedProducts = products.filter((product) => product.matched);
  const average = matchedProducts.length
    ? Math.round(matchedProducts.reduce((sum, product) => sum + product.completeness_score, 0) / matchedProducts.length)
    : 0;

  return {
    version: 2,
    generated_at: new Date().toISOString(),
    summary: {
      wix_count: wixProducts.length,
      db_count: activeRows.length,
      matched_count: matchedProducts.length,
      full_count: matchedProducts.filter((product) => product.status === "full").length,
      partial_count: matchedProducts.filter((product) => product.status === "partial").length,
      unmatched_wix_count: wixOnly.length,
      unmatched_db_count: dbOnly.length,
      average_completeness: average
    },
    products: products.sort((left, right) => left.completeness_score - right.completeness_score),
    wix_only: wixOnly,
    db_only: dbOnly
  };
}

export function isJunkDescription(value: string | null | undefined) {
  if (!value?.trim()) return true;
  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return /gettyimages\.com/.test(text)
    || /^(df|ss|sfafse)(\s|$)/.test(text)
    || /^[a-z0-9-]+ catalog listing\.?$/.test(text)
    || isSpecLikeBlob(text);
}

function createMediaAsset(src: string, alt: string) {
  return { src, alt, kind: "image" as const, local: false };
}

function countPollutedSpecs(specs: Record<string, string> | null | undefined) {
  return Object.entries(specs ?? {}).filter(([key, value]) => isPollutedSpecEntry(key, value)).length;
}

function specsNeedReshape(specs: Record<string, string> | null | undefined) {
  const entries = Object.entries(specs ?? {});
  if (!entries.length) return false;
  const polluted = countPollutedSpecs(specs);
  return polluted >= 2 || polluted / entries.length >= 0.25;
}

function buildSemanticStory(row: MigrationDbRow, wix: WixProductSnapshot, reshape: boolean) {
  const rich = wix.rich;
  const media = createMediaAsset(wix.media_urls[0] ?? "", wix.name);
  const story = reshape ? [] : [...(row.story ?? [])];
  const existingTitles = new Set(story.map((chapter) => chapter.title.toLowerCase()));
  const featureTitles = new Set(rich.features.map((feature) => feature.title.toLowerCase()));

  for (const feature of rich.features) {
    const title = feature.title.toLowerCase();
    if (existingTitles.has(title)) continue;
    story.push({
      id: `wix-feature-${title.replace(/[^a-z0-9]+/g, "-")}`,
      kicker: "Features",
      title: feature.title,
      body: feature.body,
      media,
      align: "left"
    });
    existingTitles.add(title);
  }

  for (const chapter of rich.story_chapters) {
    if (featureTitles.has(chapter.title.toLowerCase()) && /feature/i.test(chapter.kicker)) continue;
    if (/^key features$/i.test(chapter.title)) continue;
    if (existingTitles.has(chapter.title.toLowerCase())) continue;
    story.push({
      ...chapter,
      media: chapter.media?.src ? chapter.media : media
    });
    existingTitles.add(chapter.title.toLowerCase());
  }

  return story;
}

export function buildSafeMigrationPatch(
  row: MigrationDbRow,
  wix: WixProductSnapshot,
  options?: { reshapeContent?: boolean }
) {
  const patch: Record<string, unknown> = {};
  const rich = wix.rich;
  const semantic = rich.semantic;
  const shouldReshape = options?.reshapeContent || specsNeedReshape(row.specs);
  const overviewHtml = rich.description_html.trim();
  const overviewPlain = semantic.overview_plain.trim();
  const overviewStripped = overviewHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const overviewIsSpec = isJunkDescription(overviewStripped) || isSpecLikeBlob(overviewStripped);
  const needsDescription =
    shouldReshape
    || !hasHtmlDescription(row.description)
    || isJunkDescription(row.description)
    || !hasText(row.description);

  if (needsDescription) {
    if (!overviewIsSpec && overviewHtml) {
      patch.description = /<[^>]+>/.test(overviewHtml)
        ? overviewHtml
        : plainTextToDescriptionHtml(overviewHtml);
    } else if (overviewPlain && !isSpecLikeBlob(overviewPlain)) {
      patch.description = plainTextToDescriptionHtml(overviewPlain);
    } else if (wix.description_plain.trim() && !isSpecLikeBlob(wix.description_plain)) {
      patch.description = plainTextToDescriptionHtml(wix.description_plain);
    } else {
      console.warn(
        `[product-migration] No valid marketing overview for ${row.slug}; description left unchanged.`
      );
    }
  }

  if (!hasText(row.source_description) && wix.description_plain.trim()) {
    patch.source_description = wix.description_plain;
  }

  if ((!hasText(row.tagline) || shouldReshape) && semantic.tagline.trim()) {
    patch.tagline = semantic.tagline;
  } else if (!hasText(row.tagline) && wix.description_plain.trim()) {
    patch.tagline = wix.description_plain.slice(0, 180);
  }

  if (!hasText(row.seo_title) && rich.seo.title.trim()) patch.seo_title = rich.seo.title;
  if (!hasText(row.seo_description) && rich.seo.description.trim()) patch.seo_description = rich.seo.description;
  if (!hasText(row.og_title) && rich.seo.title.trim()) patch.og_title = rich.seo.title;
  if (!hasText(row.og_description) && rich.seo.description.trim()) patch.og_description = rich.seo.description;

  if (!hasText(row.category) || row.category === "Imported Wix Inventory") {
    patch.category = wix.category;
  }

  if (!hasText(row.source_url)) patch.source_url = wix.source_url;
  if (!hasText(row.source_catalog_id)) patch.source_catalog_id = wix.source_catalog_id;
  if (!hasText(row.source_fingerprint)) patch.source_fingerprint = wix.source_fingerprint;

  const wixTechnicalSpecs = scrubPollutedSpecs({ ...rich.technical_specs });
  if (shouldReshape) {
    const reshapedSpecs = scrubPollutedSpecs({
      ...Object.fromEntries(Object.entries(row.specs ?? {}).filter(([key, value]) => !isPollutedSpecEntry(key, value))),
      ...wixTechnicalSpecs
    });
    if (Object.keys(reshapedSpecs).length) patch.specs = reshapedSpecs;
  } else {
    const mergedSpecs = scrubPollutedSpecs({ ...(row.specs ?? {}) });
    for (const [key, value] of Object.entries(wixTechnicalSpecs)) {
      if (!mergedSpecs[key]?.trim()) mergedSpecs[key] = value;
    }
    const cleanedCount = countPollutedSpecs(mergedSpecs);
    const rowPollutedCount = countPollutedSpecs(row.specs);
    if (
      Object.keys(mergedSpecs).length > Object.keys(row.specs ?? {}).length
      || (rowPollutedCount > 0 && cleanedCount < rowPollutedCount)
    ) {
      patch.specs = mergedSpecs;
    }
  }

  const story = buildSemanticStory(row, wix, shouldReshape);
  if (story.length > (row.story?.length ?? 0) || shouldReshape) {
    if (story.length) patch.story = story;
  }

  if (rich.included_items.length && (shouldReshape || !(row.bundles?.[0]?.includes?.length))) {
    const bundles = row.bundles?.length ? [...row.bundles] : [{
      id: "standard",
      name: wix.name,
      price: wix.price,
      compareAt: wix.compare_at ?? undefined,
      description: wix.description_plain.slice(0, 140),
      includes: [] as string[]
    }];
    const primary = bundles[0];
    if (!primary.includes.length || shouldReshape) {
      primary.includes = rich.included_items;
      patch.bundles = bundles;
    }
  }

  if ((row.variants?.length ?? 0) < 2 && rich.variants.length > 1) {
    patch.variants = rich.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      tone: variant.sku || "default"
    }));
  }

  const anchors = new Set(row.anchors ?? []);
  if (patch.description || row.description) anchors.add("Overview");
  if (patch.specs || countMeaningfulSpecs(row.specs) > 0) anchors.add("Specifications");
  if (patch.story || story.length) anchors.add("Features");
  if (rich.document_urls.length) anchors.add("Downloads");
  if (anchors.size > (row.anchors?.length ?? 0)) patch.anchors = [...anchors];

  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    patch.source_extracted_at = wix.updated_at;
  }

  return patch;
}

export { TRACKED_FIELDS };
