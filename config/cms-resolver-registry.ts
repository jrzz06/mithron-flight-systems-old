/** Orchestration: cms_sections.component_key → existing domain content sources (no duplicate tables). */
export const CMS_COMPONENT_CONTENT_SOURCES = {
  HeroCarousel: ["hero_banners"],
  HomeLandingComposite: ["admin_settings"],
  HomepageShelf: ["admin_settings"],
  HomeMissionWorld: ["admin_settings"],
  HomeMissionAgri: ["admin_settings"],
  HomeMissionCity: ["admin_settings"],
  HomeAboutBand: ["admin_settings"],
  HomeTestimonialsHeader: ["admin_settings"],
  SiteNavigation: ["site_navigation"],
  FooterColumns: ["footer_columns", "footer_links", "admin_settings"],
  PromotionalCampaigns: ["promotional_campaigns"],
  TrustCards: ["trust_cards"],
  ProductReviews: ["product_reviews"],
  Faqs: ["faqs"],
  CategoryMetadata: ["category_metadata"],
  HomepageSection: [],
  Testimonials: []
} as const;

export type CmsComponentKey = keyof typeof CMS_COMPONENT_CONTENT_SOURCES;

export type CmsDomainContentSource =
  | "hero_banners"
  | "site_navigation"
  | "footer_columns"
  | "footer_links"
  | "faqs"
  | "product_reviews"
  | "category_metadata"
  | "admin_settings"
  | "promotional_campaigns"
  | "trust_cards";

export const DEFAULT_HOMEPAGE_COMPONENT_KEYS: CmsComponentKey[] = [
  "HeroCarousel",
  "PromotionalCampaigns",
  "TrustCards",
  "HomeLandingComposite",
  "ProductReviews",
  "FooterColumns",
  "SiteNavigation"
];

export function contentSourcesForComponent(componentKey: string): CmsDomainContentSource[] {
  const sources = CMS_COMPONENT_CONTENT_SOURCES[componentKey as CmsComponentKey];
  if (!sources) return [];
  return [...sources] as CmsDomainContentSource[];
}

export function defaultHomepageContentSources(): CmsDomainContentSource[] {
  const set = new Set<CmsDomainContentSource>();
  for (const key of DEFAULT_HOMEPAGE_COMPONENT_KEYS) {
    for (const source of contentSourcesForComponent(key)) set.add(source);
  }
  return Array.from(set);
}
