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

export type CmsRelatedArticle = {
  id: string;
  enabled: boolean;
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  content: string;
  href: string;
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
  relatedArticles: {
    enabled: boolean;
    items: [CmsRelatedArticle, CmsRelatedArticle, CmsRelatedArticle];
  };
};

function emptyInterShelfBanner(): CmsInterShelfBanner {
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

function emptyFullViewportBanner(): CmsFullViewportBanner {
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

function emptyRelatedArticle(index: number): CmsRelatedArticle {
  return {
    id: `related-article-${index + 1}`,
    enabled: true,
    imageSrc: "",
    imageAlt: "",
    eyebrow: "",
    title: "",
    content: "",
    href: ""
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
  relatedArticles: {
    enabled: true,
    items: [emptyRelatedArticle(0), emptyRelatedArticle(1), emptyRelatedArticle(2)]
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
      href: typeof row.href === "string" ? row.href : fallback.href
    };
  };

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
    relatedArticles: {
      enabled: relatedArticles.enabled !== false,
      items: [
        mergeRelatedArticle(relatedArticleItems[0], 0),
        mergeRelatedArticle(relatedArticleItems[1], 1),
        mergeRelatedArticle(relatedArticleItems[2], 2)
      ]
    }
  };
}
