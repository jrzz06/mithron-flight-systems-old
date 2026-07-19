export type CmsBannerAlignment = "left" | "center" | "right";

export type CmsInterShelfBanner = {
  enabled: boolean;
  imageSrc: string;
  imageAlt: string;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  overlayOpacity: number;
  alignment: CmsBannerAlignment;
};

export type CmsFullViewportBanner = {
  enabled: boolean;
  desktopImageSrc: string;
  desktopImageAlt: string;
  mobileImageSrc: string;
  mobileImageAlt: string;
  heading: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  overlayOpacity: number;
  alignment: CmsBannerAlignment;
};

export type CmsMiniCarouselSlide = {
  id: string;
  enabled: boolean;
  imageSrc: string;
  imageAlt: string;
  heading: string;
  description: string;
  ctaLabel: string;
  href: string;
  productSlug: string;
  sortOrder: number;
};

export type CmsReviewsSettings = {
  enabled: boolean;
  maxCount: number;
  sortOrder: "newest" | "rating" | "manual";
};

export type CmsTestimonialCard = {
  id: string;
  enabled: boolean;
  authorName: string;
  body: string;
  rating: number;
  productSlug: string;
  hrefOverride: string;
  avatarSrc: string;
  avatarAlt: string;
  sortOrder: number;
};

export type CmsRelatedArticle = {
  id: string;
  enabled: boolean;
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  content: string;
  href: string;
  ctaLabel: string;
};

export type CmsRelatedArticleSelection = {
  source: "press" | "blog";
  id: string;
};

export type HomepageCmsV2Content = {
  miniCarousel: {
    enabled: boolean;
    slides: CmsMiniCarouselSlide[];
  };
  banners: {
    interShelf: [CmsInterShelfBanner, CmsInterShelfBanner, CmsInterShelfBanner];
    fullViewport: [CmsFullViewportBanner, CmsFullViewportBanner];
  };
  reviews: CmsReviewsSettings;
  /** CMS-owned homepage testimonial cards (1A). */
  testimonialCards: CmsTestimonialCard[];
  relatedArticles: {
    enabled: boolean;
    sectionTitle: string;
    sectionLead: string;
    browseAllHref: string;
    items: CmsRelatedArticle[];
    /** Legacy press/blog picks — kept for merge fallback; not edited in homepage CMS UI. */
    selectedItems: Array<CmsRelatedArticleSelection | null>;
  };
};

export function emptyInterShelfBanner(): CmsInterShelfBanner {
  return {
    enabled: true,
    imageSrc: "",
    imageAlt: "",
    heading: "",
    subtitle: "",
    ctaLabel: "",
    href: "",
    overlayOpacity: 0.35,
    alignment: "left"
  };
}

export function emptyFullViewportBanner(): CmsFullViewportBanner {
  return {
    enabled: true,
    desktopImageSrc: "",
    desktopImageAlt: "",
    mobileImageSrc: "",
    mobileImageAlt: "",
    heading: "",
    subtitle: "",
    ctaLabel: "",
    href: "",
    overlayOpacity: 0.4,
    alignment: "center"
  };
}

export function emptyRelatedArticle(index: number): CmsRelatedArticle {
  return {
    id: `related-article-${index + 1}`,
    enabled: true,
    imageSrc: "",
    imageAlt: "",
    eyebrow: "",
    title: "",
    content: "",
    href: "",
    ctaLabel: "Read Article"
  };
}

export function emptyTestimonialCard(index: number): CmsTestimonialCard {
  return {
    id: `testimonial-${index + 1}`,
    enabled: true,
    authorName: "",
    body: "",
    rating: 5,
    productSlug: "",
    hrefOverride: "",
    avatarSrc: "",
    avatarAlt: "",
    sortOrder: index
  };
}

export const defaultHomepageCmsV2Content: HomepageCmsV2Content = {
  miniCarousel: {
    enabled: true,
    slides: []
  },
  banners: {
    interShelf: [emptyInterShelfBanner(), emptyInterShelfBanner(), emptyInterShelfBanner()],
    fullViewport: [emptyFullViewportBanner(), emptyFullViewportBanner()]
  },
  reviews: {
    enabled: true,
    maxCount: 6,
    sortOrder: "manual"
  },
  testimonialCards: [],
  relatedArticles: {
    enabled: true,
    sectionTitle: "",
    sectionLead: "",
    browseAllHref: "/blog",
    items: [],
    selectedItems: []
  }
};

export function mergeHomepageCmsV2Content(stored: unknown): HomepageCmsV2Content {
  const root = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const mini = root.miniCarousel && typeof root.miniCarousel === "object" ? (root.miniCarousel as Record<string, unknown>) : {};
  const banners = root.banners && typeof root.banners === "object" ? (root.banners as Record<string, unknown>) : {};
  const interShelfRaw = Array.isArray(banners.interShelf) ? banners.interShelf : [];
  const fullViewportRaw = Array.isArray(banners.fullViewport) ? banners.fullViewport : [];
  const reviews = root.reviews && typeof root.reviews === "object" ? (root.reviews as Record<string, unknown>) : {};
  const relatedArticles = root.relatedArticles && typeof root.relatedArticles === "object"
    ? (root.relatedArticles as Record<string, unknown>)
    : {};
  const relatedArticleItems = Array.isArray(relatedArticles.items) ? relatedArticles.items : [];
  const testimonialRaw = Array.isArray(root.testimonialCards) ? root.testimonialCards : [];

  const mergeBanner = (partial: unknown, fallback: CmsInterShelfBanner): CmsInterShelfBanner => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    return {
      enabled: row.enabled !== false,
      imageSrc: typeof row.imageSrc === "string" ? row.imageSrc : fallback.imageSrc,
      imageAlt: typeof row.imageAlt === "string" ? row.imageAlt : fallback.imageAlt,
      heading: typeof row.heading === "string" ? row.heading : fallback.heading,
      subtitle: typeof row.subtitle === "string" ? row.subtitle : fallback.subtitle,
      ctaLabel: typeof row.ctaLabel === "string" ? row.ctaLabel : fallback.ctaLabel,
      href: typeof row.href === "string" ? row.href : fallback.href,
      overlayOpacity: typeof row.overlayOpacity === "number" ? row.overlayOpacity : fallback.overlayOpacity,
      alignment: row.alignment === "center" || row.alignment === "right" ? row.alignment : fallback.alignment
    };
  };

  const mergeFullBanner = (partial: unknown, fallback: CmsFullViewportBanner): CmsFullViewportBanner => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    return {
      enabled: row.enabled !== false,
      desktopImageSrc: typeof row.desktopImageSrc === "string" ? row.desktopImageSrc : fallback.desktopImageSrc,
      desktopImageAlt: typeof row.desktopImageAlt === "string" ? row.desktopImageAlt : fallback.desktopImageAlt,
      mobileImageSrc: typeof row.mobileImageSrc === "string" ? row.mobileImageSrc : fallback.mobileImageSrc,
      mobileImageAlt: typeof row.mobileImageAlt === "string" ? row.mobileImageAlt : fallback.mobileImageAlt,
      heading: typeof row.heading === "string" ? row.heading : fallback.heading,
      subtitle: typeof row.subtitle === "string" ? row.subtitle : fallback.subtitle,
      ctaLabel: typeof row.ctaLabel === "string" ? row.ctaLabel : fallback.ctaLabel,
      href: typeof row.href === "string" ? row.href : fallback.href,
      overlayOpacity: typeof row.overlayOpacity === "number" ? row.overlayOpacity : fallback.overlayOpacity,
      alignment: row.alignment === "center" || row.alignment === "right" ? row.alignment : fallback.alignment
    };
  };

  const mergeSlide = (partial: unknown, index: number): CmsMiniCarouselSlide => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    return {
      id: typeof row.id === "string" && row.id ? row.id : `slide-${index}`,
      enabled: row.enabled !== false,
      imageSrc: typeof row.imageSrc === "string" ? row.imageSrc : "",
      imageAlt: typeof row.imageAlt === "string" ? row.imageAlt : "",
      heading: typeof row.heading === "string" ? row.heading : "",
      description: typeof row.description === "string" ? row.description : "",
      ctaLabel: typeof row.ctaLabel === "string" ? row.ctaLabel : "",
      href: typeof row.href === "string" ? row.href : "",
      productSlug: typeof row.productSlug === "string" ? row.productSlug : "",
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : index
    };
  };

  const mergeRelatedArticle = (partial: unknown, index: number): CmsRelatedArticle => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    const fallback = emptyRelatedArticle(index);
    return {
      id: typeof row.id === "string" && row.id ? row.id : fallback.id,
      enabled: row.enabled !== false,
      imageSrc: typeof row.imageSrc === "string" ? row.imageSrc : fallback.imageSrc,
      imageAlt: typeof row.imageAlt === "string" ? row.imageAlt : fallback.imageAlt,
      eyebrow: typeof row.eyebrow === "string" ? row.eyebrow : fallback.eyebrow,
      title: typeof row.title === "string" ? row.title : fallback.title,
      content: typeof row.content === "string" ? row.content : fallback.content,
      href: typeof row.href === "string" ? row.href : fallback.href,
      ctaLabel: typeof row.ctaLabel === "string" && row.ctaLabel.trim() ? row.ctaLabel : "Read Article"
    };
  };

  const mergeTestimonialCard = (partial: unknown, index: number): CmsTestimonialCard => {
    const row = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
    const fallback = emptyTestimonialCard(index);
    const ratingRaw = typeof row.rating === "number" ? row.rating : Number(row.rating);
    return {
      id: typeof row.id === "string" && row.id ? row.id : fallback.id,
      enabled: row.enabled !== false,
      authorName: typeof row.authorName === "string" ? row.authorName : fallback.authorName,
      body: typeof row.body === "string" ? row.body : fallback.body,
      rating: Number.isFinite(ratingRaw) ? Math.min(5, Math.max(1, Math.round(ratingRaw))) : 5,
      productSlug: typeof row.productSlug === "string" ? row.productSlug : "",
      hrefOverride: typeof row.hrefOverride === "string" ? row.hrefOverride : "",
      avatarSrc: typeof row.avatarSrc === "string" ? row.avatarSrc : "",
      avatarAlt: typeof row.avatarAlt === "string" ? row.avatarAlt : "",
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : index
    };
  };

  const mergeSelectedItem = (partial: unknown): CmsRelatedArticleSelection | null => {
    if (!partial || typeof partial !== "object" || Array.isArray(partial)) return null;
    const row = partial as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) return null;
    if (row.source === "press" || row.source === "blog") {
      return { source: row.source, id };
    }
    return null;
  };

  const selectedRaw = Array.isArray(relatedArticles.selectedItems) ? relatedArticles.selectedItems : [];

  const defaults = defaultHomepageCmsV2Content;

  return {
    miniCarousel: {
      enabled: mini.enabled !== false,
      slides: Array.isArray(mini.slides) ? mini.slides.map(mergeSlide) : defaults.miniCarousel.slides
    },
    banners: {
      interShelf: [
        mergeBanner(interShelfRaw[0], defaults.banners.interShelf[0]),
        mergeBanner(interShelfRaw[1], defaults.banners.interShelf[1]),
        mergeBanner(interShelfRaw[2], defaults.banners.interShelf[2])
      ],
      fullViewport: [
        mergeFullBanner(fullViewportRaw[0], defaults.banners.fullViewport[0]),
        mergeFullBanner(fullViewportRaw[1], defaults.banners.fullViewport[1])
      ]
    },
    reviews: {
      enabled: reviews.enabled !== false,
      maxCount: typeof reviews.maxCount === "number" ? Math.max(1, Math.min(12, reviews.maxCount)) : defaults.reviews.maxCount,
      sortOrder: reviews.sortOrder === "newest" || reviews.sortOrder === "rating" ? reviews.sortOrder : defaults.reviews.sortOrder
    },
    testimonialCards: testimonialRaw.map(mergeTestimonialCard),
    relatedArticles: {
      enabled: relatedArticles.enabled !== false,
      sectionTitle: typeof relatedArticles.sectionTitle === "string" ? relatedArticles.sectionTitle : "",
      sectionLead: typeof relatedArticles.sectionLead === "string" ? relatedArticles.sectionLead : "",
      browseAllHref:
        typeof relatedArticles.browseAllHref === "string" && relatedArticles.browseAllHref.trim()
          ? relatedArticles.browseAllHref
          : "/blog",
      items: relatedArticleItems.map(mergeRelatedArticle),
      selectedItems: selectedRaw.map(mergeSelectedItem).filter(Boolean) as CmsRelatedArticleSelection[]
    }
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeIndexedSlots(
  liveSlots: Array<Record<string, unknown>>,
  draftSlots: unknown[],
  length: number
): Array<Record<string, unknown>> {
  return Array.from({ length }, (_, index) => {
    const live = liveSlots[index] ?? {};
    const draft = draftSlots[index];
    if (!isPlainRecord(draft)) return live;
    return { ...live, ...draft };
  });
}

/**
 * Deep-merge a draftV2 overlay onto published v2 content.
 * Prevents a partial `draft.banners` object from wiping live banner slots.
 */
export function overlayHomepageCmsV2Draft(
  live: HomepageCmsV2Content,
  draft: unknown
): HomepageCmsV2Content {
  if (!isPlainRecord(draft)) return live;

  const draftBanners = isPlainRecord(draft.banners) ? draft.banners : null;
  const banners = draftBanners
    ? {
        interShelf: mergeIndexedSlots(
          live.banners.interShelf as unknown as Array<Record<string, unknown>>,
          Array.isArray(draftBanners.interShelf) ? draftBanners.interShelf : [],
          3
        ),
        fullViewport: mergeIndexedSlots(
          live.banners.fullViewport as unknown as Array<Record<string, unknown>>,
          Array.isArray(draftBanners.fullViewport) ? draftBanners.fullViewport : [],
          2
        )
      }
    : live.banners;

  const draftMini = isPlainRecord(draft.miniCarousel) ? draft.miniCarousel : null;
  const miniCarousel = draftMini ? { ...live.miniCarousel, ...draftMini } : live.miniCarousel;

  const draftReviews = isPlainRecord(draft.reviews) ? draft.reviews : null;
  const reviews = draftReviews ? { ...live.reviews, ...draftReviews } : live.reviews;

  const draftRelated = isPlainRecord(draft.relatedArticles) ? draft.relatedArticles : null;
  const relatedArticles = draftRelated
    ? { ...live.relatedArticles, ...draftRelated }
    : live.relatedArticles;

  return mergeHomepageCmsV2Content({
    ...live,
    ...draft,
    miniCarousel,
    banners,
    reviews,
    relatedArticles,
    testimonialCards: Array.isArray(draft.testimonialCards)
      ? draft.testimonialCards
      : live.testimonialCards
  });
}
