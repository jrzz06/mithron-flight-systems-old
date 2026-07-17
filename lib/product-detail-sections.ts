import type { Product } from "@/config/types";
import {
  getCustomerFacingSpecs,
  getHighlightSpecs,
  getProductOverviewHtml,
  getProductOverviewText,
  getStoryChapters
} from "@/lib/product-detail-content";

export type ProductDetailSectionId =
  | "overview"
  | "features"
  | "specs"
  | "technical"
  | "downloads"
  | "media"
  | "applications"
  | "included"
  | "warranty"
  | "disclaimers"
  | "faq"
  | "reviews"
  | "related";

export type ProductDetailSection = {
  id: ProductDetailSectionId;
  label: string;
};

const SECTION_LABELS: Record<ProductDetailSectionId, string> = {
  overview: "Overview",
  features: "Features",
  specs: "Specifications",
  technical: "Technical Data",
  downloads: "Downloads",
  media: "Media Gallery",
  applications: "Applications",
  included: "What's Included",
  warranty: "Warranty",
  disclaimers: "Disclaimers",
  faq: "FAQs",
  reviews: "Reviews",
  related: "Related Products"
};

function storyChapters(product: Product) {
  return getStoryChapters(product, { includeFallback: false });
}

export type ProductFeatureItem = {
  title: string;
  body: string;
};

export function getProductFeatureItems(product: Product): ProductFeatureItem[] {
  const chapters = storyChapters(product).filter((item) => /feature/i.test(item.kicker));
  if (!chapters.length) return [];

  return chapters
    .map((chapter) => ({
      title: chapter.title.trim(),
      body: chapter.body.trim()
    }))
    .filter((feature) => feature.title && feature.body && !/^key features$/i.test(feature.title));
}

export function getProductDownloads(product: Product) {
  const chapter = storyChapters(product).find((item) => /download|document|manual/i.test(`${item.title} ${item.kicker}`));
  if (!chapter?.body) return [];
  return chapter.body
    .split(/\n+/)
    .map((line) => {
      const match = line.match(/^(.+?):\s*(https?:\/\/\S+)/i);
      if (match) return { label: match[1].trim(), url: match[2].trim() };
      const urlMatch = line.match(/(https?:\/\/\S+)/i);
      if (urlMatch) return { label: line.replace(urlMatch[1], "").replace(/:$/, "").trim() || "Download", url: urlMatch[1] };
      return null;
    })
    .filter((item): item is { label: string; url: string } => Boolean(item));
}

export function getProductApplications(product: Product) {
  const chapter = storyChapters(product).find((item) => /application/i.test(`${item.title} ${item.kicker}`));
  return chapter?.body?.trim() ?? "";
}

export function getProductIncludedItems(product: Product) {
  const bundleIncludes = product.bundles.flatMap((bundle) => bundle.includes).filter(Boolean);
  if (bundleIncludes.length) return bundleIncludes;
  const chapter = storyChapters(product).find((item) => /included|package|contents/i.test(`${item.title} ${item.kicker}`));
  if (!chapter?.body) return [];
  return chapter.body
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function getProductWarranty(product: Product) {
  const chapter = storyChapters(product).find((item) => /warranty/i.test(`${item.title} ${item.kicker}`));
  return chapter?.body?.trim() ?? "";
}

export function getProductDisclaimers(product: Product) {
  const chapter = storyChapters(product).find((item) => /disclaimer|important notes/i.test(`${item.title} ${item.kicker}`));
  if (!chapter?.body) return [];
  return chapter.body
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getProductMediaGallery(product: Product) {
  const items = [product.image, product.hero, ...product.gallery].filter((item) => item?.src?.trim());
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.src)) return false;
    seen.add(item.src);
    return true;
  });
}

export function getProductTechnicalSpecs(product: Product) {
  const specs = getCustomerFacingSpecs(product);
  const highlights = new Set(getHighlightSpecs(product).map(([key]) => key.toLowerCase()));
  return specs.filter(([key]) => !highlights.has(key.toLowerCase()));
}

function getVisibleProductDetailSections(
  product: Product,
  options?: { hasReviews?: boolean; hasRelated?: boolean }
): ProductDetailSection[] {
  const sections: ProductDetailSection[] = [];
  const overview = getProductOverviewText(product);
  const overviewHtml = getProductOverviewHtml(product);

  if (overviewHtml || overview.length > 80) {
    sections.push({ id: "overview", label: SECTION_LABELS.overview });
  }

  if (getProductFeatureItems(product).length > 0) {
    sections.push({ id: "features", label: SECTION_LABELS.features });
  }

  if (getHighlightSpecs(product).length > 0) {
    sections.push({ id: "specs", label: SECTION_LABELS.specs });
  }

  if (getProductTechnicalSpecs(product).length > 0) {
    sections.push({ id: "technical", label: SECTION_LABELS.technical });
  }

  if (getProductDownloads(product).length > 0) {
    sections.push({ id: "downloads", label: SECTION_LABELS.downloads });
  }

  if (getProductMediaGallery(product).length > 1) {
    sections.push({ id: "media", label: SECTION_LABELS.media });
  }

  if (getProductApplications(product)) {
    sections.push({ id: "applications", label: SECTION_LABELS.applications });
  }

  if (getProductIncludedItems(product).length > 0) {
    sections.push({ id: "included", label: SECTION_LABELS.included });
  }

  if (getProductWarranty(product)) {
    sections.push({ id: "warranty", label: SECTION_LABELS.warranty });
  }

  if (getProductDisclaimers(product).length > 0) {
    sections.push({ id: "disclaimers", label: SECTION_LABELS.disclaimers });
  }

  if (options?.hasReviews) sections.push({ id: "reviews", label: SECTION_LABELS.reviews });
  if (options?.hasRelated) sections.push({ id: "related", label: SECTION_LABELS.related });

  return sections;
}
