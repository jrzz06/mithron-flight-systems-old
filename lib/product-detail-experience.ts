import type { MediaAsset, Product, StorySection } from "@/config/types";
import type { TrustCardContent } from "@/services/cms";
import type { ProductShellItem } from "@/services/catalog";
import {
  getCustomerFacingSpecs,
  getDedicatedProductStoryChapters,
  getHighlightSpecs,
  getProductOverviewHtml,
  getProductOverviewText,
  getStoryChapters
} from "@/lib/product-detail-content";
import {
  getProductApplications,
  getProductDisclaimers,
  getProductDownloads,
  getProductIncludedItems,
  getProductWarranty
} from "@/lib/product-detail-sections";

export type MediaPlanRole = "hero" | "angle" | "detail" | "lifestyle" | "story";

export type ProductMediaPlanItem = MediaAsset & {
  role: MediaPlanRole;
};

export type ProductFeatureSpotlight = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  media?: MediaAsset;
};

export type ProductNarrativeChapter = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  media?: MediaAsset;
  align?: StorySection["align"];
};

export type ProductUseCase = {
  id: string;
  label: string;
  description: string;
  benefits: string[];
};

export type ProductSpecGroup = {
  id: string;
  label: string;
  entries: Array<[string, string]>;
};

export type ProductComparisonColumn = {
  slug: string;
  name: string;
  price: number;
  tagline: string;
  isCurrent: boolean;
};

export type ProductComparisonRow = {
  label: string;
  values: string[];
};

export type ProductComparison = {
  columns: ProductComparisonColumn[];
  rows: ProductComparisonRow[];
};

export type ProductInTheBoxItem = {
  id: string;
  label: string;
};

export type ShowcaseSectionId =
  | "description"
  | "overview"
  | "features"
  | "narrative"
  | "use-cases"
  | "specs"
  | "comparison"
  | "included"
  | "trust"
  | "downloads"
  | "reviews"
  | "faq"
  | "related";

export type ShowcaseSection = {
  id: ShowcaseSectionId;
  label: string;
};

const SHOWCASE_SECTION_LABELS: Record<ShowcaseSectionId, string> = {
  description: "Description",
  overview: "Overview",
  features: "Features",
  narrative: "Story",
  "use-cases": "Use Cases",
  specs: "Specifications",
  comparison: "Compare",
  included: "In the Box",
  trust: "Trust",
  downloads: "Downloads",
  reviews: "Reviews",
  faq: "FAQ",
  related: "Related"
};

const SPEC_GROUP_RULES: Array<{ id: string; label: string; keys: string[] }> = [
  {
    id: "aircraft",
    label: "Aircraft",
    keys: ["UAV Type", "UAV Category", "Dimensions", "Weight", "Maximum Takeoff Weight", "Maximum All-Up-Weight"]
  },
  {
    id: "camera",
    label: "Camera",
    keys: ["Camera", "Sensor", "Resolution", "Gimbal", "Video", "Photo"]
  },
  {
    id: "flight",
    label: "Flight",
    keys: ["Endurance", "Flight Time", "Maximum Speed", "Range", "Range (LoS)", "Wind Resistance", "Operating Altitude", "Maximum Operating Altitude"]
  },
  {
    id: "battery",
    label: "Battery",
    keys: ["Battery", "Battery Capacity", "Charging Time", "Charge Time"]
  },
  {
    id: "payload",
    label: "Payload",
    keys: ["Payload", "Payload Capacity", "Spray Tank", "Tank Capacity"]
  },
  {
    id: "transmission",
    label: "Transmission",
    keys: ["Transmission", "Control Range", "Video Link", "Frequency"]
  },
  {
    id: "environment",
    label: "Environmental",
    keys: ["IP Rating", "Operating Temperature", "Humidity", "Environmental"]
  }
];

const COMPARISON_SPEC_KEYS = [
  "Payload",
  "Payload Capacity",
  "Flight Time",
  "Endurance",
  "Range",
  "Range (LoS)",
  "Battery",
  "Battery Capacity",
  "Camera"
] as const;

const USE_CASE_COPY: Record<string, { description: string; benefits: string[] }> = {
  agriculture: {
    description: "Precision spraying, crop monitoring, and field operations at scale.",
    benefits: ["Targeted application", "Reduced input waste", "Faster field coverage"]
  },
  surveying: {
    description: "High-accuracy mapping and geospatial capture for survey teams.",
    benefits: ["Repeatable flight paths", "Consistent data capture", "Rapid site turnaround"]
  },
  mapping: {
    description: "Orthomosaic and terrain modeling for planning and analysis.",
    benefits: ["Large-area coverage", "GIS-ready outputs", "Efficient repeat surveys"]
  },
  inspection: {
    description: "Close visual inspection for infrastructure and industrial assets.",
    benefits: ["Safer access", "Detailed imagery", "Reduced downtime"]
  },
  security: {
    description: "Persistent aerial awareness for perimeter and event monitoring.",
    benefits: ["Wide-area visibility", "Rapid deployment", "Live situational context"]
  },
  surveillance: {
    description: "Long-range observation and monitoring for security operations.",
    benefits: ["Extended range", "Stable imaging", "Mission flexibility"]
  },
  industrial: {
    description: "Field-ready systems for industrial inspection and operations.",
    benefits: ["Rugged field use", "Operator-ready setup", "Serviceable design"]
  }
};

function normalizeCopy(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueMediaBySrc(items: MediaAsset[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const src = item.src?.trim();
    if (!src || seen.has(src)) return false;
    seen.add(src);
    return true;
  });
}

function mediaReliabilityScore(src: string) {
  // Cutouts are never preferred on storefront — Wix/original Supabase uploads win.
  if (src.includes("/catalog-cutouts/")) return 0;
  if (src.includes("/wix-content/")) return 5;
  if (src.includes("/storage/v1/object/public/")) return 3;
  if (src.startsWith("/")) return 2;
  return 1;
}

function preferNonCutoutDisplayAsset(asset: MediaAsset): MediaAsset | null {
  if (asset.src.includes("/catalog-cutouts/")) return null;

  const ownFallback = asset.responsive?.fallbackSrc?.trim() ?? "";
  if (ownFallback.includes("/catalog-cutouts/")) {
    return {
      ...asset,
      responsive: asset.responsive
        ? { ...asset.responsive, fallbackSrc: asset.src, fallbackAlt: asset.alt }
        : undefined
    };
  }

  return asset;
}

function sortMediaAssets(items: MediaAsset[]) {
  return [...items].sort((left, right) => mediaReliabilityScore(right.src) - mediaReliabilityScore(left.src));
}

function assignMediaRole(index: number, total: number): MediaPlanRole {
  if (index === 0) return "hero";
  if (index === 1) return "angle";
  if (index < Math.min(4, total)) return "detail";
  if (index < total - 1) return "lifestyle";
  return "story";
}

export function buildProductMediaPlan(product: Product): ProductMediaPlanItem[] {
  const pool = sortMediaAssets(
    uniqueMediaBySrc([product.hero, product.image, ...product.gallery])
      .map((asset) => preferNonCutoutDisplayAsset(asset))
      .filter((asset): asset is MediaAsset => Boolean(asset))
  );
  return pool.map((asset, index) => ({
    ...asset,
    role: assignMediaRole(index, pool.length)
  }));
}

function isUtilityChapter(chapter: StorySection) {
  const label = `${chapter.kicker} ${chapter.title}`.toLowerCase();
  return /feature|warranty|disclaimer|download|document|manual|included|package|contents|application/i.test(label);
}

function isFeatureChapter(chapter: StorySection) {
  return /feature/i.test(chapter.kicker) && !/^key features$/i.test(chapter.title.trim());
}

function reserveMedia(
  chapter: StorySection,
  usedSrcs: Set<string>,
  reservePool: MediaAsset[]
): MediaAsset | undefined {
  const chapterSrc = chapter.media?.src?.trim();
  if (chapterSrc && !usedSrcs.has(chapterSrc)) {
    usedSrcs.add(chapterSrc);
    return chapter.media;
  }
  const fallback = reservePool.find((item) => item.src?.trim() && !usedSrcs.has(item.src));
  if (fallback?.src) {
    usedSrcs.add(fallback.src);
    return fallback;
  }
  return undefined;
}

export function buildProductFeatureSpotlights(
  product: Product,
  usedSrcs: Set<string>,
  reservePool: MediaAsset[]
): ProductFeatureSpotlight[] {
  const chapters = getStoryChapters(product, { includeFallback: false }).filter(isFeatureChapter);
  return chapters
    .map((chapter) => ({
      id: chapter.id,
      kicker: chapter.kicker,
      title: chapter.title,
      body: chapter.body,
      media: reserveMedia(chapter, usedSrcs, reservePool)
    }))
    .filter((item) => item.title && item.body);
}

export function buildProductNarrative(
  product: Product,
  overviewText: string,
  usedSrcs: Set<string>,
  reservePool: MediaAsset[]
): ProductNarrativeChapter[] {
  const overviewNormalized = normalizeCopy(overviewText);
  const chapters = getDedicatedProductStoryChapters(product, { includeFallback: false })
    .filter((chapter) => !isFeatureChapter(chapter))
    .filter((chapter) => !isUtilityChapter(chapter))
    .filter((chapter) => {
      if (!overviewNormalized) return true;
      const body = normalizeCopy(chapter.body);
      return body && body !== overviewNormalized && !overviewNormalized.includes(body);
    });

  return chapters.map((chapter) => ({
    id: chapter.id,
    kicker: chapter.kicker,
    title: chapter.title,
    body: chapter.body,
    media: reserveMedia(chapter, usedSrcs, reservePool),
    align: chapter.align
  }));
}

export function buildProductUseCases(product: Product): ProductUseCase[] {
  const applications = getProductApplications(product);
  const interests = product.interests.length ? product.interests : [product.category.toLowerCase()];
  const cases = interests.map((interest) => {
    const key = interest.toLowerCase().replace(/\s+/g, "-");
    const preset = USE_CASE_COPY[key] ?? USE_CASE_COPY[interest.toLowerCase()] ?? {
      description: `Optimized for ${interest.replace(/-/g, " ")} missions and field deployment.`,
      benefits: ["Mission-ready setup", "Operator support", "Compatible accessories"]
    };
    return {
      id: key,
      label: interest.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      description: preset.description,
      benefits: preset.benefits
    } satisfies ProductUseCase;
  });

  if (applications && cases.length) {
    cases[0] = {
      ...cases[0],
      description: applications.split(/\n/)[0]?.trim() || cases[0].description
    };
  }

  return cases;
}

export function buildProductSpecGroups(product: Product): ProductSpecGroup[] {
  const specs = getCustomerFacingSpecs(product);
  if (!specs.length) return [];

  const assigned = new Set<string>();
  const groups: ProductSpecGroup[] = [];

  for (const rule of SPEC_GROUP_RULES) {
    const entries = specs.filter(([key]) => {
      const normalized = key.toLowerCase();
      if (assigned.has(normalized)) return false;
      const match = rule.keys.some((candidate) => candidate.toLowerCase() === normalized);
      if (match) assigned.add(normalized);
      return match;
    });
    if (entries.length) {
      groups.push({ id: rule.id, label: rule.label, entries });
    }
  }

  const general = specs.filter(([key]) => !assigned.has(key.toLowerCase()));
  if (general.length) {
    groups.push({ id: "general", label: "General", entries: general });
  }

  return groups;
}

export function buildProductComparison(
  product: Product,
  related: ProductShellItem[]
): ProductComparison | null {
  const candidates = related.slice(0, 2);
  if (!candidates.length) return null;

  const columns: ProductComparisonColumn[] = [
    {
      slug: product.slug,
      name: product.name,
      price: product.price,
      tagline: product.tagline,
      isCurrent: true
    },
    ...candidates.map((item) => ({
      slug: item.slug,
      name: item.name,
      price: item.price,
      tagline: item.tagline,
      isCurrent: false
    }))
  ];

  const rows: ProductComparisonRow[] = [
    {
      label: "Price",
      values: columns.map((column) => `₹${column.price.toLocaleString("en-IN")}`)
    },
    {
      label: "Category",
      values: [product.category, ...candidates.map((item) => item.category)]
    }
  ];

  for (const key of COMPARISON_SPEC_KEYS) {
    const currentValue = product.specs[key]?.trim();
    if (!currentValue) continue;
    rows.push({
      label: key,
      values: [currentValue, ...candidates.map(() => "—")]
    });
  }

  return { columns, rows };
}

export function buildProductInTheBox(product: Product): ProductInTheBoxItem[] {
  return getProductIncludedItems(product).map((label, index) => ({
    id: `${index}-${label}`,
    label
  }));
}

export function partitionRelatedProducts(product: Product, related: ProductShellItem[]) {
  const accessories = related.filter((item) => item.category !== product.category);
  const similar = related.filter((item) => item.category === product.category);
  return {
    similar: similar.length ? similar : related.slice(0, 4),
    accessories: accessories.slice(0, 4)
  };
}

export type ProductDetailExperience = {
  mediaPlan: ProductMediaPlanItem[];
  overviewText: string;
  overviewHtml: string | null;
  highlightStats: Array<[string, string]>;
  features: ProductFeatureSpotlight[];
  narrative: ProductNarrativeChapter[];
  useCases: ProductUseCase[];
  specGroups: ProductSpecGroup[];
  comparison: ProductComparison | null;
  inTheBox: ProductInTheBoxItem[];
  downloads: ReturnType<typeof getProductDownloads>;
  warranty: string;
  disclaimers: string[];
  trustCards: TrustCardContent[];
  sectionIds: ShowcaseSectionId[];
  sections: ShowcaseSection[];
  relatedRails: {
    similar: ProductShellItem[];
    accessories: ProductShellItem[];
  };
};

export function buildVisibleShowcaseSections(
  experience: Pick<
    ProductDetailExperience,
    | "overviewText"
    | "overviewHtml"
    | "features"
    | "narrative"
    | "useCases"
    | "specGroups"
    | "comparison"
    | "inTheBox"
    | "downloads"
    | "warranty"
    | "disclaimers"
  >,
  options?: { hasReviews?: boolean; hasRelated?: boolean; hasFaq?: boolean }
): ShowcaseSection[] {
  const sections: ShowcaseSection[] = [];

  if (experience.overviewHtml || experience.overviewText.trim()) {
    sections.push({ id: "description", label: SHOWCASE_SECTION_LABELS.description });
  }
  if (experience.features.length) {
    sections.push({ id: "features", label: SHOWCASE_SECTION_LABELS.features });
  }
  if (experience.narrative.length) {
    sections.push({ id: "narrative", label: SHOWCASE_SECTION_LABELS.narrative });
  }
  if (experience.useCases.length) {
    sections.push({ id: "use-cases", label: SHOWCASE_SECTION_LABELS["use-cases"] });
  }
  if (experience.specGroups.length) {
    sections.push({ id: "specs", label: SHOWCASE_SECTION_LABELS.specs });
  }
  if (experience.comparison) {
    sections.push({ id: "comparison", label: SHOWCASE_SECTION_LABELS.comparison });
  }
  if (experience.inTheBox.length) {
    sections.push({ id: "included", label: SHOWCASE_SECTION_LABELS.included });
  }
  sections.push({ id: "trust", label: SHOWCASE_SECTION_LABELS.trust });
  if (experience.downloads.length) {
    sections.push({ id: "downloads", label: SHOWCASE_SECTION_LABELS.downloads });
  }
  if (options?.hasReviews) sections.push({ id: "reviews", label: SHOWCASE_SECTION_LABELS.reviews });
  if (options?.hasFaq) sections.push({ id: "faq", label: SHOWCASE_SECTION_LABELS.faq });
  if (options?.hasRelated) sections.push({ id: "related", label: SHOWCASE_SECTION_LABELS.related });

  return sections;
}

export function buildProductDetailExperience(
  product: Product,
  related: ProductShellItem[],
  options?: {
    trustCards?: TrustCardContent[];
    hasReviews?: boolean;
    hasFaq?: boolean;
  }
): ProductDetailExperience {
  const mediaPlan = buildProductMediaPlan(product);
  const usedSrcs = new Set(mediaPlan.map((item) => item.src));
  const reservePool = product.gallery.filter((item) => item.src?.trim() && !usedSrcs.has(item.src));

  const overviewText = getProductOverviewText(product);
  const overviewHtml = getProductOverviewHtml(product);
  const highlightStats = getHighlightSpecs(product, 3);
  const features = buildProductFeatureSpotlights(product, usedSrcs, reservePool);
  const narrative = buildProductNarrative(product, overviewText, usedSrcs, reservePool);
  const useCases = buildProductUseCases(product);
  const specGroups = buildProductSpecGroups(product);
  const comparison = buildProductComparison(product, related);
  const inTheBox = buildProductInTheBox(product);
  const downloads = getProductDownloads(product);
  const warranty = getProductWarranty(product);
  const disclaimers = getProductDisclaimers(product);
  const relatedRails = partitionRelatedProducts(product, related);

  const sections = buildVisibleShowcaseSections(
    {
      overviewText,
      overviewHtml,
      features,
      narrative,
      useCases,
      specGroups,
      comparison,
      inTheBox,
      downloads,
      warranty,
      disclaimers
    },
    {
      hasReviews: options?.hasReviews,
      hasRelated: related.length > 0,
      hasFaq: options?.hasFaq
    }
  );

  return {
    mediaPlan,
    overviewText,
    overviewHtml,
    highlightStats,
    features,
    narrative,
    useCases,
    specGroups,
    comparison,
    inTheBox,
    downloads,
    warranty,
    disclaimers,
    trustCards: options?.trustCards ?? [],
    sectionIds: sections.map((section) => section.id),
    sections,
    relatedRails
  };
}
