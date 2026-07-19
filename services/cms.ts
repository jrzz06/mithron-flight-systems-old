import { cache } from "react";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { catalogRoutes } from "@/config/catalog-routes";
import { resolveCategoryNavbarInkByCmsRouteKey } from "@/config/navbar-ink-registry";
import { getResponsiveAssetForSrc } from "@/config/generated-assets";
import { navigation } from "@/config/navigation";
import { inkFromHexColor } from "@/lib/navbar-ink-sampling";
import {
  footerContent,
  productSupportContent,
  type FooterContent,
  type ProductSupportContent
} from "@/config/storefront-content";
import { getSupabaseAdminConfig } from "@/lib/env";
import { resolveDroneCareStorefrontHref } from "@/lib/catalog-categories";
import type { HeroSlide, Interest, NavigationNode } from "@/config/types";
import { hydrateStorefrontMediaAssets } from "@/config/generated-assets";
import {
  getHomepageCmsOrchestration,
  shouldLoadCmsSource,
  type CmsPageOrchestration
} from "@/services/cms-resolver";
import { getCachedAdminSettingsPayload } from "@/services/admin-settings-cache";
import { readThroughCache, REDIS_CACHE_KEYS } from "@/lib/cache-redis";

export type CmsSource = "supabase" | "fallback" | "mixed";
type CmsSurfaceSource = "supabase" | "fallback";

type CategoryMetadata = {
  title: string;
  subtitle: string;
  heroImage: string;
  showcaseImage?: {
    src: string;
    alt: string;
    width: number;
    height: number;
    navbarInk: "light" | "dark";
    fit?: "cinematic" | "native";
  };
};

type FooterLeadContent = Pick<FooterContent, "leadTitle" | "leadBody" | "contactEmail" | "contactPhone" | "legalText">;

type CmsSurfaceName =
  | "navigation"
  | "footer"
  | "faq"
  | "reviews"
  | "heroBanners"
  | "categories"
  | "promotionalCampaigns"
  | "trustCards";

export type PromotionalCampaignContent = {
  id: string;
  label: string;
  headline: string;
  body: string | null;
  ctaLabel: string | null;
  href: string | null;
};

export type TrustCardContent = {
  id: string;
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  imageClassName: string;
  isFeature: boolean;
};

type CmsSurfaceDiagnostic = {
  source: CmsSurfaceSource;
  status: "VERIFIED" | "FALLBACK";
  reason?: string;
  rowCount: number;
};

export type PublicCmsDiagnostics = {
  surfaces: Record<CmsSurfaceName, CmsSurfaceDiagnostic>;
  remoteSurfaces: CmsSurfaceName[];
  fallbackSurfaces: CmsSurfaceName[];
  invalidSurfaces: CmsSurfaceName[];
  filteredDraftRows: number;
  cleanupReady: false;
};

export type PublicCmsSnapshot = {
  source: CmsSource;
  diagnostics: PublicCmsDiagnostics;
  orchestration: Pick<CmsPageOrchestration, "resolverStatus" | "contentSources">;
  navigation: NavigationNode[];
  home: {
    heroBanners: HeroSlide[];
    interests: Interest[];
  };
  categories: Record<string, CategoryMetadata>;
  footer: FooterContent;
  productSupport: ProductSupportContent;
  promotionalCampaigns: PromotionalCampaignContent[];
  trustCards: TrustCardContent[];
};

type CmsRow = Record<string, unknown>;

export type CmsRowsByTable = Partial<Record<
  | "hero_banners"
  | "site_navigation"
  | "footer_columns"
  | "footer_links"
  | "trust_cards"
  | "promotional_campaigns"
  | "faqs"
  | "product_reviews"
  | "category_metadata"
  | "cms_pages"
  | "cms_sections",
  CmsRow[] | null
>>;

const publicCmsQueries = {
  heroBanners: "select=id,product_slug,title,subtitle,cta_label,href,image,poster,video,theme,composition,title_color,subtitle_color,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  siteNavigation: "select=id,label,href,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  footerColumns: "select=id,title,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  footerLinks: "select=id,column_id,label,href,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  faqs: "select=id,question,answer,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  productReviews: "select=id,reviewer_name,body,product_slug,rating,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  categoryMetadata: "select=route_key,title,subtitle,hero_image,showcase_image,sort_order,is_visible,status&order=sort_order.asc&limit=80",
  promotionalCampaigns: "select=id,label,headline,body,cta_label,href,sort_order,is_visible,status,starts_at,ends_at&order=sort_order.asc&limit=20",
  trustCards: "select=id,title,body,image_src,image_alt,image_class_name,is_feature,sort_order,is_visible,status&order=sort_order.asc&limit=20"
};

const emptyFooterContent: FooterContent = {
  leadTitle: "",
  leadBody: "",
  columns: [],
  legalText: ""
};

const emptyProductSupportContent: ProductSupportContent = {
  faqs: [],
  reviews: []
};

const catalogRouteCategories = Object.fromEntries(
  Object.entries(catalogRoutes).map(([routeKey, route]) => [
    routeKey,
    {
      title: route.title,
      subtitle: route.subtitle,
      heroImage: route.heroImage,
      showcaseImage: "showcaseImage" in route ? route.showcaseImage : undefined
    } satisfies CategoryMetadata
  ])
);

export const emptySupabaseOnlySnapshot: PublicCmsSnapshot = {
  source: "supabase",
  diagnostics: createDiagnostics(),
  orchestration: { resolverStatus: "default", contentSources: [] },
  navigation: [],
  home: {
    heroBanners: [],
    interests: []
  },
  categories: {},
  footer: emptyFooterContent,
  productSupport: emptyProductSupportContent,
  promotionalCampaigns: [],
  trustCards: []
};

export const fallbackSnapshot: PublicCmsSnapshot = {
  ...emptySupabaseOnlySnapshot,
  navigation,
  footer: footerContent,
  productSupport: productSupportContent,
  categories: catalogRouteCategories
};

function mergeCategoryMetadata(routeKey: string, cms?: CategoryMetadata): CategoryMetadata {
  const fallback = catalogRouteCategories[routeKey];
  if (!fallback && !cms) {
    return { title: "", subtitle: "", heroImage: "" };
  }

  const cmsShowcase = cms?.showcaseImage?.src?.trim() ? cms.showcaseImage : undefined;
  const fallbackShowcase = fallback?.showcaseImage;
  const mergedShowcase = cmsShowcase
    ? {
        ...fallbackShowcase,
        ...cmsShowcase,
        fit: cmsShowcase.fit ?? (fallbackShowcase as { fit?: "cinematic" | "native" } | undefined)?.fit
      }
    : fallbackShowcase;
  const showcaseSrc =
    mergedShowcase && "src" in mergedShowcase && typeof mergedShowcase.src === "string"
      ? mergedShowcase.src
      : undefined;
  const showcaseImage = mergedShowcase
    ? {
        ...mergedShowcase,
        navbarInk:
          resolveCategoryNavbarInkByCmsRouteKey(routeKey)
          ?? mergedShowcase.navbarInk
          ?? fallbackShowcase?.navbarInk
          ?? inkFromHexColor(showcaseSrc ? getResponsiveAssetForSrc(showcaseSrc)?.dominantColor : undefined)
          ?? "light"
      }
    : undefined;

  return {
    title: cms?.title?.trim() || fallback?.title || "",
    subtitle: cms?.subtitle?.trim() || fallback?.subtitle || "",
    heroImage: cms?.heroImage?.trim() || fallback?.heroImage || "",
    showcaseImage
  };
}

function getSupabasePublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

const cmsFetchAttempts = 3;
const cmsFetchTimeoutMs = 5_000;
const cmsFetchBudgetMs = 8_000;
const cmsBackoffBaseMs = 250;
const cmsRetryAfterCapMs = 3_000;

function isRetryableCmsServerStatus(status: number) {
  return status === 408 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithJitter(base: number, attempt: number) {
  return base * Math.pow(2, attempt - 1) + Math.random() * base;
}

function parseRetryAfterMs(header: string | null, maxMs = cmsRetryAfterCapMs): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(maxMs, asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.min(maxMs, Math.max(0, asDate - Date.now()));
  }
  return null;
}

function isCmsTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /timed out/i.test(error.message));
}

async function fetchCmsRows<T extends CmsRow>(table: string, query = "select=id&limit=80") {
  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) return null;

  let lastError: unknown;
  let timeoutRetries = 0;
  let rateLimitRetries = 0;
  const deadlineAt = Date.now() + cmsFetchBudgetMs;

  for (let attempt = 1; attempt <= cmsFetchAttempts; attempt += 1) {
    if (Date.now() > deadlineAt) {
      lastError = new Error(`CMS fetch budget exceeded (${cmsFetchBudgetMs}ms) for ${table}`);
      break;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cmsFetchTimeoutMs);

    try {
      const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        },
        signal: controller.signal,
        next: {
          // revalidate:0 disables the Data Cache, making tags inoperative.
          // Use a short TTL so responses are cached with cms tags and can be
          // purged instantly by revalidateTag("cms","max") on publish.
          revalidate: 60,
          tags: ["cms", "cms-public", `cms-${table}`]
        }
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        const error = new Error(`Failed to load CMS table ${table}: ${response.status} ${response.statusText}`);
        if (response.status === 429) {
          if (rateLimitRetries < 1) {
            rateLimitRetries += 1;
            lastError = error;
            const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
            await wait(retryAfterMs ?? backoffWithJitter(cmsBackoffBaseMs, attempt));
            continue;
          }
        } else if (attempt < cmsFetchAttempts && isRetryableCmsServerStatus(response.status)) {
          lastError = error;
          await wait(backoffWithJitter(cmsBackoffBaseMs, attempt));
          continue;
        }
        if (process.env.MITHRON_CMS_STRICT === "true") {
          throw error;
        }
        return null;
      }

      return await response.json() as T[];
    } catch (error) {
      const mapped =
        error instanceof Error && error.name === "AbortError"
          ? new Error(`Timed out loading CMS table ${table} after ${cmsFetchTimeoutMs}ms`)
          : error;
      lastError = mapped;

      const isTimeout = isCmsTimeoutError(mapped);
      if (isTimeout) {
        if (timeoutRetries >= 1) break;
        timeoutRetries += 1;
      } else if (attempt >= cmsFetchAttempts) {
        break;
      }

      await wait(backoffWithJitter(cmsBackoffBaseMs, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (process.env.MITHRON_CMS_STRICT === "true") {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to load CMS table ${table} after ${cmsFetchAttempts} attempts: ${message}`);
  }
  return null;
}

const getCachedCmsTableRows = cache(async <T extends CmsRow>(table: string, query: string) => {
  return fetchCmsRows<T>(table, query);
});

function createDiagnostics(): PublicCmsDiagnostics {
  const surfaces = Object.fromEntries(
    ([
      "navigation",
      "footer",
      "faq",
      "reviews",
      "heroBanners",
      "categories"
    ] as CmsSurfaceName[]).map((surface) => [
      surface,
      {
        source: "fallback" as const,
        status: "FALLBACK" as const,
        reason: "not evaluated",
        rowCount: 0
      }
    ])
  ) as Record<CmsSurfaceName, CmsSurfaceDiagnostic>;

  return {
    surfaces,
    remoteSurfaces: [],
    fallbackSurfaces: [],
    invalidSurfaces: [],
    filteredDraftRows: 0,
    cleanupReady: false
  };
}

function mediaFromRow(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mediaFromColumns(row: CmsRow, key: "image" | "poster" | "video", fallbackAlt: string) {
  const structured = mediaFromRow(row[key]);
  if (structured) return structured;
  const src = optionalString(row[`${key}_src`]);
  if (!src) return undefined;
  return {
    src,
    alt: optionalString(row[`${key}_alt`]) ?? fallbackAlt,
    kind: key === "video" || /\.(mp4|webm|mov)$/i.test(src) ? "video" : "image",
    local: false,
    ...(key === "image" ? { priority: true } : {})
  };
}

function normalizePublicHref(value: unknown) {
  const href = optionalString(value) ?? "#";
  if (href === "#") return href;
  return resolveDroneCareStorefrontHref(href, href);
}

function optionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function activeInWindow(row: CmsRow, now = new Date()) {
  const startsAt = optionalString(row.starts_at);
  const endsAt = optionalString(row.ends_at);
  const starts = startsAt ? new Date(startsAt) : null;
  const ends = endsAt ? new Date(endsAt) : null;
  if (starts && !Number.isNaN(starts.getTime()) && starts > now) return false;
  if (ends && !Number.isNaN(ends.getTime()) && ends < now) return false;
  return true;
}

function publishedRows(rows: CmsRow[] | null | undefined, options: { timeWindow?: boolean; allowInvisible?: boolean } = {}) {
  const sourceRows = rows ?? [];
  const usableRows = sourceRows.filter((row) => {
    const status = row.status;
    const isPublished = status === undefined || status === "published";
    const isVisible = options.allowInvisible ? true : row.is_visible !== false;
    return isPublished && isVisible && (!options.timeWindow || activeInWindow(row));
  });
  return {
    rows: usableRows,
    filtered: sourceRows.length - usableRows.length
  };
}

function mapHeroRows(rows: CmsRow[] | null): HeroSlide[] | null {
  if (!rows?.length) return null;
  const slides = rows.map((row) => ({
    id: String(row.id),
    productSlug: String(row.product_slug ?? ""),
    title: String(row.title ?? ""),
    subtitle: String(row.subtitle ?? ""),
    cta: String(row.cta_label ?? row.cta ?? ""),
    href: normalizePublicHref(row.href),
    image: mediaFromColumns(row, "image", String(row.title ?? "")) as HeroSlide["image"],
    poster: mediaFromColumns(row, "poster", String(row.title ?? "")) as HeroSlide["poster"],
    video: mediaFromColumns(row, "video", String(row.title ?? "")) as HeroSlide["video"],
    theme: row.theme === "dark" ? "dark" as const : "light" as const,
    composition: mediaFromRow(row.composition) as HeroSlide["composition"],
    titleColor: optionalString(row.title_color),
    subtitleColor: optionalString(row.subtitle_color)
  }));

  return slides.every((slide) => slide.id && slide.title && slide.image?.src) ? slides : null;
}

function mapNavigationRows(rows: CmsRow[] | null): NavigationNode[] | null {
  if (!rows?.length) return null;
  const items = rows.map((row) => ({
    label: String(row.label ?? ""),
    href: normalizePublicHref(row.href)
  }));
  return items.every((item) => item.label && item.href) ? items : null;
}

function mapFooter(rows: CmsRow[] | null, links: CmsRow[] | null): FooterContent | null {
  if (!rows?.length || !links?.length) return null;
  const sortedColumns = rows.slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const columns = sortedColumns.map((column) => ({
    title: String(column.title ?? ""),
    links: links
      .filter((link) => link.column_id === column.id)
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map((link) => [String(link.label ?? ""), normalizePublicHref(link.href)] as [string, string])
  }));

  if (!columns.every((column) => column.title && column.links.length)) return null;
  return { ...emptyFooterContent, columns };
}

function mapFaqRows(rows: CmsRow[] | null): ProductSupportContent["faqs"] | null {
  if (!rows?.length) return null;
  const faqs = rows.map((row) => [String(row.question ?? ""), String(row.answer ?? "")] as [string, string]);
  return faqs.every(([question, answer]) => question && answer) ? faqs : null;
}

function mapReviewRows(rows: CmsRow[] | null): ProductSupportContent["reviews"] | null {
  if (!rows?.length) return null;
  const reviews = rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.reviewer_name ?? row.name ?? ""),
    body: String(row.body ?? ""),
    productSlug: optionalString(row.product_slug),
    rating: optionalNumber(row.rating)
  }));
  return reviews.every((review) => review.name && review.body) ? reviews : null;
}

function mapCategoryRows(rows: CmsRow[] | null): Record<string, CategoryMetadata> | null {
  if (!rows?.length) return null;
  const mapped = Object.fromEntries(rows.map((row) => [
    String(row.route_key),
    {
      title: String(row.title ?? ""),
      subtitle: String(row.subtitle ?? ""),
      heroImage: String(row.hero_image ?? ""),
      showcaseImage: mediaFromRow(row.showcase_image) as CategoryMetadata["showcaseImage"]
    }
  ]));
  return Object.keys(mapped).length ? mapped : null;
}

function mapPromotionalCampaignRows(rows: CmsRow[] | null): PromotionalCampaignContent[] | null {
  if (!rows?.length) return null;
  const campaigns = rows.map((row) => ({
    id: String(row.id ?? ""),
    label: String(row.label ?? ""),
    headline: String(row.headline ?? ""),
    body: optionalString(row.body),
    ctaLabel: optionalString(row.cta_label),
    href: optionalString(row.href)
  }));
  return campaigns.every((campaign) => campaign.id && campaign.label && campaign.headline) ? campaigns : null;
}

function mapTrustCardRows(rows: CmsRow[] | null): TrustCardContent[] | null {
  if (!rows?.length) return null;
  const cards = rows.map((row) => ({
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    imageSrc: String(row.image_src ?? ""),
    imageAlt: String(row.image_alt ?? row.title ?? ""),
    imageClassName: String(row.image_class_name ?? ""),
    isFeature: row.is_feature === true
  }));
  return cards.every((card) => card.id && card.title && card.body && card.imageSrc) ? cards : null;
}

function mapInterestRows(rows: CmsRow[] | null): Interest[] | null {
  if (!rows?.length) return null;
  const interests = rows.map((row) => {
    const routeKey = String(row.route_key ?? "");
    const title = String(row.title ?? "");
    const showcase = mediaFromRow(row.showcase_image) as CategoryMetadata["showcaseImage"];
    const heroImage = optionalString(row.hero_image);
    const imageSrc = showcase?.src ?? heroImage;

    return {
      slug: routeKey,
      label: title,
      headline: String(row.subtitle ?? ""),
      image: {
        src: imageSrc ?? "",
        alt: showcase?.alt ?? title,
        width: showcase?.width,
        height: showcase?.height,
        local: Boolean(imageSrc?.startsWith("/"))
      }
    };
  });

  return interests.every((interest) => interest.slug && interest.label && interest.image.src) ? interests : null;
}

function footerLeadDefaults(): FooterLeadContent {
  return {
    leadTitle: footerContent.leadTitle,
    leadBody: footerContent.leadBody,
    contactEmail: footerContent.contactEmail,
    contactPhone: footerContent.contactPhone,
    legalText: footerContent.legalText
  };
}

function mapFooterLeadSettings(payload: unknown): FooterLeadContent {
  const defaults = footerLeadDefaults();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return defaults;

  const footer = (payload as Record<string, unknown>).footer;
  if (!footer || typeof footer !== "object" || Array.isArray(footer)) return defaults;

  const row = footer as Record<string, unknown>;
  return {
    leadTitle: optionalString(row.leadTitle) ?? optionalString(row.lead_title) ?? defaults.leadTitle,
    leadBody: optionalString(row.leadBody) ?? optionalString(row.lead_body) ?? defaults.leadBody,
    contactEmail: optionalString(row.contactEmail) ?? optionalString(row.contact_email) ?? defaults.contactEmail,
    contactPhone: optionalString(row.contactPhone) ?? optionalString(row.contact_phone) ?? defaults.contactPhone,
    legalText: optionalString(row.legalText) ?? optionalString(row.legal_text) ?? defaults.legalText
  };
}

function mergeFooterContent(columnsFooter: FooterContent, lead: FooterLeadContent): FooterContent {
  return {
    ...lead,
    columns: columnsFooter.columns
  };
}

async function fetchFooterLeadSettings(): Promise<FooterLeadContent> {
  try {
    const row = await getCachedAdminSettingsPayload();
    if (!row?.payload) return footerLeadDefaults();
    return mapFooterLeadSettings(row.payload);
  } catch {
    return footerLeadDefaults();
  }
}

function surface<T>(
  diagnostics: PublicCmsDiagnostics,
  name: CmsSurfaceName,
  rowCount: number,
  mapped: T | null,
  fallback: T,
  fallbackReason: string
) {
  if (mapped) {
    diagnostics.surfaces[name] = {
      source: "supabase",
      status: "VERIFIED",
      rowCount
    };
    return mapped;
  }

  if (isCmsStrictMode()) {
    throw new Error(`CMS surface "${name}" is missing published content: ${fallbackReason}`);
  }

  diagnostics.surfaces[name] = {
    source: "fallback",
    status: "FALLBACK",
    reason: fallbackReason,
    rowCount
  };
  return fallback;
}

function finalizeDiagnostics(diagnostics: PublicCmsDiagnostics) {
  diagnostics.remoteSurfaces = [];
  diagnostics.fallbackSurfaces = [];
  diagnostics.invalidSurfaces = [];

  for (const [surfaceName, state] of Object.entries(diagnostics.surfaces) as Array<[CmsSurfaceName, CmsSurfaceDiagnostic]>) {
    // Partial payloads (shell light) leave unevaluated surfaces at defaults — ignore them.
    if (state.reason === "not evaluated") continue;
    if (state.source === "supabase") {
      diagnostics.remoteSurfaces.push(surfaceName);
    } else {
      diagnostics.fallbackSurfaces.push(surfaceName);
      if (state.rowCount > 0) diagnostics.invalidSurfaces.push(surfaceName);
    }
  }
}

/** Only validate surfaces whose tables were included in the row payload. */
function tableRequested(rowsByTable: CmsRowsByTable, ...keys: Array<keyof CmsRowsByTable>) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(rowsByTable, key));
}

export function buildPublicCmsSnapshotFromRows(rowsByTable: CmsRowsByTable): PublicCmsSnapshot {
  const diagnostics = createDiagnostics();
  const heroRequested = tableRequested(rowsByTable, "hero_banners");
  const navigationRequested = tableRequested(rowsByTable, "site_navigation");
  const footerRequested = tableRequested(rowsByTable, "footer_columns", "footer_links");
  const faqRequested = tableRequested(rowsByTable, "faqs");
  const reviewsRequested = tableRequested(rowsByTable, "product_reviews");
  const categoriesRequested = tableRequested(rowsByTable, "category_metadata");
  const campaignsRequested = tableRequested(rowsByTable, "promotional_campaigns");
  const trustCardsRequested = tableRequested(rowsByTable, "trust_cards");

  const heroRows = publishedRows(rowsByTable.hero_banners);
  const navigationRows = publishedRows(rowsByTable.site_navigation);
  const footerColumnRows = publishedRows(rowsByTable.footer_columns);
  const footerLinkRows = publishedRows(rowsByTable.footer_links);
  const faqRows = publishedRows(rowsByTable.faqs);
  const reviewRows = publishedRows(rowsByTable.product_reviews);
  const categoryRows = publishedRows(rowsByTable.category_metadata);
  const campaignRows = publishedRows(rowsByTable.promotional_campaigns, { timeWindow: true });
  const trustCardRows = publishedRows(rowsByTable.trust_cards);

  diagnostics.filteredDraftRows = [
    heroRequested ? heroRows : { filtered: 0 },
    navigationRequested ? navigationRows : { filtered: 0 },
    footerRequested ? footerColumnRows : { filtered: 0 },
    footerRequested ? footerLinkRows : { filtered: 0 },
    faqRequested ? faqRows : { filtered: 0 },
    reviewsRequested ? reviewRows : { filtered: 0 },
    categoriesRequested ? categoryRows : { filtered: 0 },
    campaignsRequested ? campaignRows : { filtered: 0 },
    trustCardsRequested ? trustCardRows : { filtered: 0 }
  ].reduce((total, entry) => total + entry.filtered, 0);

  const navigationValue = navigationRequested
    ? surface(
      diagnostics,
      "navigation",
      navigationRows.rows.length,
      mapNavigationRows(navigationRows.rows),
      fallbackSnapshot.navigation,
      "missing or invalid published navigation rows"
    )
    : fallbackSnapshot.navigation;
  const footerValue = footerRequested
    ? surface(
      diagnostics,
      "footer",
      footerColumnRows.rows.length + footerLinkRows.rows.length,
      mapFooter(footerColumnRows.rows, footerLinkRows.rows),
      fallbackSnapshot.footer,
      "missing or invalid published footer rows"
    )
    : fallbackSnapshot.footer;
  const faqValue = faqRequested
    ? surface(
      diagnostics,
      "faq",
      faqRows.rows.length,
      mapFaqRows(faqRows.rows),
      fallbackSnapshot.productSupport.faqs,
      "missing or invalid published FAQ rows"
    )
    : fallbackSnapshot.productSupport.faqs;
  const reviewValue = reviewsRequested
    ? surface(
      diagnostics,
      "reviews",
      reviewRows.rows.length,
      mapReviewRows(reviewRows.rows),
      fallbackSnapshot.productSupport.reviews,
      "missing or invalid published review rows"
    )
    : fallbackSnapshot.productSupport.reviews;
  const heroValue = heroRequested
    ? surface(
      diagnostics,
      "heroBanners",
      heroRows.rows.length,
      mapHeroRows(heroRows.rows),
      fallbackSnapshot.home.heroBanners,
      "missing or invalid published hero rows"
    )
    : fallbackSnapshot.home.heroBanners;
  const categoryValue = categoriesRequested
    ? surface(
      diagnostics,
      "categories",
      categoryRows.rows.length,
      mapCategoryRows(categoryRows.rows),
      fallbackSnapshot.categories,
      "missing or invalid published category metadata rows"
    )
    : fallbackSnapshot.categories;
  const campaignMapped = campaignsRequested ? mapPromotionalCampaignRows(campaignRows.rows) : null;
  if (campaignsRequested) {
    diagnostics.surfaces.promotionalCampaigns = {
      source: campaignMapped ? "supabase" : "fallback",
      status: campaignMapped ? "VERIFIED" : "FALLBACK",
      reason: campaignMapped ? undefined : "missing or invalid published promotional campaign rows",
      rowCount: campaignRows.rows.length
    };
  }
  const trustCardMapped = trustCardsRequested ? mapTrustCardRows(trustCardRows.rows) : null;
  if (trustCardsRequested) {
    diagnostics.surfaces.trustCards = {
      source: trustCardMapped ? "supabase" : "fallback",
      status: trustCardMapped ? "VERIFIED" : "FALLBACK",
      reason: trustCardMapped ? undefined : "missing or invalid published trust card rows",
      rowCount: trustCardRows.rows.length
    };
  }

  finalizeDiagnostics(diagnostics);
  const source: CmsSource = diagnostics.fallbackSurfaces.length === 0
    ? "supabase"
    : diagnostics.remoteSurfaces.length > 0
      ? "mixed"
      : "fallback";
  const homeInterests = categoriesRequested
    ? (mapInterestRows(categoryRows.rows) ?? fallbackSnapshot.home.interests)
    : fallbackSnapshot.home.interests;

  if ((heroRequested && heroValue?.length) || (categoriesRequested && homeInterests.length)) {
    hydrateStorefrontMediaAssets({
      slides: heroValue ?? [],
      interests: homeInterests
    });
  }

  return {
    source,
    diagnostics,
    orchestration: { resolverStatus: "default", contentSources: [] },
    navigation: navigationValue,
    home: {
      heroBanners: heroValue,
      interests: homeInterests
    },
    categories: categoryValue,
    footer: footerValue,
    productSupport: {
      faqs: faqValue,
      reviews: reviewValue
    },
    promotionalCampaigns: campaignMapped ?? [],
    trustCards: trustCardMapped ?? []
  };
}

export function getCmsCutoverDiagnostics(snapshot: PublicCmsSnapshot) {
  return {
    status: snapshot.diagnostics.fallbackSurfaces.length === 0 ? "VERIFIED" as const : "PARTIAL" as const,
    verifiedRemoteSurfaces: snapshot.diagnostics.remoteSurfaces,
    remainingFallbackSurfaces: snapshot.diagnostics.fallbackSurfaces,
    invalidRemoteSurfaces: snapshot.diagnostics.invalidSurfaces,
    filteredDraftRows: snapshot.diagnostics.filteredDraftRows,
    cleanupReady: false
  };
}

const hasCmsSchema = cache(async () => {
  const rows = await getCachedCmsTableRows("hero_banners", "select=id&limit=1");
  return rows !== null;
});

async function loadPublicHeroBannersUncached(): Promise<HeroSlide[]> {
  try {
    if (!(await hasCmsSchema())) {
      return fallbackSnapshot.home.heroBanners;
    }

    const orchestration = await getHomepageCmsOrchestration();
    if (!shouldLoadCmsSource(orchestration, "hero_banners")) {
      return fallbackSnapshot.home.heroBanners;
    }

    const heroRows = await getCachedCmsTableRows("hero_banners", publicCmsQueries.heroBanners);
    const published = publishedRows(heroRows);
    return mapHeroRows(published.rows) ?? fallbackSnapshot.home.heroBanners;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cms] public hero banners failed; using fallback: ${message}`);
    return fallbackSnapshot.home.heroBanners;
  }
}

/** Published homepage hero — Redis read-through (60s) + single-flight; preview path stays uncached. */
export const getPublicHeroBanners = cache(async (): Promise<HeroSlide[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.cmsHero, 60, loadPublicHeroBannersUncached);
});

export const getPublicHeroBannersForCmsPreview = cache(async (): Promise<HeroSlide[]> => {
  if (!(await hasCmsSchema())) {
    return fallbackSnapshot.home.heroBanners;
  }

  const heroRows = await getCachedCmsTableRows("hero_banners", publicCmsQueries.heroBanners);
  if (!heroRows?.length) return fallbackSnapshot.home.heroBanners;

  const previewRows = heroRows.filter((row) => {
    const status = String((row as Record<string, unknown>).status ?? "draft").toLowerCase();
    return status === "published" || status === "draft";
  });

  return mapHeroRows(previewRows) ?? fallbackSnapshot.home.heroBanners;
});

async function loadPublicCmsSnapshot(options: { omitHero?: boolean } = {}): Promise<PublicCmsSnapshot> {
  try {
    if (!(await hasCmsSchema())) {
      if (process.env.MITHRON_CMS_STRICT === "true") {
        console.warn("[cms] schema unavailable in strict mode; returning storefront fallback snapshot");
      }
      return fallbackSnapshot;
    }

  const orchestration = await getHomepageCmsOrchestration();
  const load = (source: Parameters<typeof shouldLoadCmsSource>[1]) => shouldLoadCmsSource(orchestration, source);
  const loadFooterLead = load("footer_columns") || load("admin_settings");
  const omitHero = options.omitHero === true;

  const [
    heroRows,
    navRows,
    footerColumns,
    footerLinks,
    faqRows,
    reviewRows,
    categoryRows,
    campaignRows,
    trustCardRows,
    footerLead
  ] = await Promise.all([
    // Homepage below-fold bundle skips hero — hero Suspense uses getPublicHeroBanners independently
    // (same React.cache table key when both run; omit avoids redundant work when hero already streamed).
    omitHero || !load("hero_banners")
      ? Promise.resolve(null)
      : getCachedCmsTableRows("hero_banners", publicCmsQueries.heroBanners),
    load("site_navigation") ? getCachedCmsTableRows("site_navigation", publicCmsQueries.siteNavigation) : Promise.resolve(null),
    load("footer_columns") ? getCachedCmsTableRows("footer_columns", publicCmsQueries.footerColumns) : Promise.resolve(null),
    load("footer_links") ? getCachedCmsTableRows("footer_links", publicCmsQueries.footerLinks) : Promise.resolve(null),
    load("faqs") ? getCachedCmsTableRows("faqs", publicCmsQueries.faqs) : Promise.resolve(null),
    load("product_reviews") ? getCachedCmsTableRows("product_reviews", publicCmsQueries.productReviews) : Promise.resolve(null),
    getCachedCmsTableRows("category_metadata", publicCmsQueries.categoryMetadata),
    load("promotional_campaigns") ? getCachedCmsTableRows("promotional_campaigns", publicCmsQueries.promotionalCampaigns) : Promise.resolve(null),
    load("trust_cards") ? getCachedCmsTableRows("trust_cards", publicCmsQueries.trustCards) : Promise.resolve(null),
    loadFooterLead ? fetchFooterLeadSettings() : Promise.resolve(footerLeadDefaults())
  ]);

  const snapshot = buildPublicCmsSnapshotFromRows({
    hero_banners: heroRows,
    site_navigation: navRows,
    footer_columns: footerColumns,
    footer_links: footerLinks,
    faqs: faqRows,
    product_reviews: reviewRows,
    category_metadata: categoryRows,
    promotional_campaigns: campaignRows,
    trust_cards: trustCardRows
  });

  return {
    ...snapshot,
    orchestration: {
      resolverStatus: orchestration.resolverStatus,
      contentSources: orchestration.contentSources
    },
    footer: mergeFooterContent(snapshot.footer, footerLead)
  };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cms] public snapshot failed; using fallback: ${message}`);
    return fallbackSnapshot;
  }
}

export const getPublicCmsSnapshot = cache(async () => {
  return loadPublicCmsSnapshot();
});

/** Homepage below-fold CMS — skips hero_banners (hero Suspense loads them separately). */
export const getPublicCmsSnapshotForHomepageBelowFold = cache(async () => {
  return loadPublicCmsSnapshot({ omitHero: true });
});

export type StorefrontShellCms = {
  navigation: NavigationNode[];
  footer: FooterContent;
};

/**
 * Slim shell CMS: nav + footer (+ footer lead from admin_settings) only.
 * Avoids the full public snapshot fan-out used by getPublicCmsSnapshot.
 */
export async function getStorefrontShellCmsLight(): Promise<StorefrontShellCms> {
  if (!(await hasCmsSchema())) {
    if (process.env.MITHRON_CMS_STRICT === "true") {
      console.warn("[cms] shell CMS schema unavailable in strict mode; using fallback nav/footer");
    }
    return {
      navigation: fallbackSnapshot.navigation,
      footer: fallbackSnapshot.footer
    };
  }

  const [navRows, footerColumns, footerLinks, footerLead] = await Promise.all([
    getCachedCmsTableRows("site_navigation", publicCmsQueries.siteNavigation),
    getCachedCmsTableRows("footer_columns", publicCmsQueries.footerColumns),
    getCachedCmsTableRows("footer_links", publicCmsQueries.footerLinks),
    fetchFooterLeadSettings()
  ]);

  const snapshot = buildPublicCmsSnapshotFromRows({
    site_navigation: navRows,
    footer_columns: footerColumns,
    footer_links: footerLinks
  });

  return {
    navigation: snapshot.navigation,
    footer: mergeFooterContent(snapshot.footer, footerLead)
  };
}

async function loadStorefrontShellCms(): Promise<StorefrontShellCms> {
  return getStorefrontShellCmsLight();
}

export const getStorefrontShellCms = cache(async () => loadStorefrontShellCms());

export const getCategoryCmsMetadataOnly = cache(async (routeKey: string): Promise<CategoryMetadata> => {
  try {
    if (!(await hasCmsSchema())) {
      return mergeCategoryMetadata(routeKey, undefined);
    }

    const rows = await getCachedCmsTableRows(
      "category_metadata",
      `select=route_key,title,subtitle,hero_image,showcase_image,sort_order,is_visible,status&route_key=eq.${encodeURIComponent(routeKey)}&limit=1`
    );
    const published = publishedRows(rows);
    const mapped = mapCategoryRows(published.rows);
    return mergeCategoryMetadata(routeKey, mapped?.[routeKey]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cms] category metadata failed for ${routeKey}; using fallback: ${message}`);
    return mergeCategoryMetadata(routeKey, undefined);
  }
});

export const getProductReviewsCmsSlice = cache(async () => {
  if (!(await hasCmsSchema())) {
    return fallbackSnapshot.productSupport.reviews;
  }

  const rows = await getCachedCmsTableRows("product_reviews", publicCmsQueries.productReviews);
  const published = publishedRows(rows);
  return mapReviewRows(published.rows) ?? fallbackSnapshot.productSupport.reviews;
});

export async function getCategoryCmsMetadata(routeKey: string) {
  return getCategoryCmsMetadataOnly(routeKey);
}
