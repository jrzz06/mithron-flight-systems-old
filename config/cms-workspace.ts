export const CMS_WORKSPACE_ROOT = "/admin/cms";

export const CMS_WORKSPACE_ANCHORS = {
  root: "cms-control-panel",
  hero: "cms-section-hero-banners",
  categoryBanners: "cms-page-category-banners"
} as const;

export const CMS_WORKSPACE_LINKS = {
  root: `${CMS_WORKSPACE_ROOT}#${CMS_WORKSPACE_ANCHORS.root}`,
  hero: `${CMS_WORKSPACE_ROOT}#${CMS_WORKSPACE_ANCHORS.hero}`,
  categoryBanners: `${CMS_WORKSPACE_ROOT}#${CMS_WORKSPACE_ANCHORS.categoryBanners}`
} as const;

export const CMS_WORKSPACE_PAGES = [
  {
    id: "homepage",
    label: "Homepage",
    anchor: "cms-page-homepage",
    routePath: "/",
    previewHref: "/",
    description: "Homepage hero, sections, product reviews, and supporting content.",
    order: 10
  },
  {
    id: "category-banners",
    label: "Category Banners",
    anchor: CMS_WORKSPACE_ANCHORS.categoryBanners,
    routePath: "/products",
    previewHref: "/products",
    description: "Category route hero and showcase banner controls.",
    order: 20
  },
  {
    id: "navigation-page",
    label: "Navigation",
    anchor: "cms-page-navigation",
    routePath: "/",
    previewHref: "/",
    description: "Primary storefront navigation labels and destinations.",
    order: 50
  },
  {
    id: "footer-page",
    label: "Footer",
    anchor: "cms-page-footer",
    routePath: "/",
    previewHref: "/",
    description: "Footer groups and footer links.",
    order: 60
  },
  {
    id: "faqs-page",
    label: "FAQs",
    anchor: "cms-page-faqs",
    routePath: "/contact",
    previewHref: "/contact",
    description: "Support FAQ entries for contact and product surfaces.",
    order: 110
  },
  {
    id: "campaigns-page",
    label: "Promotional Campaigns",
    anchor: "cms-page-campaigns",
    routePath: "/",
    previewHref: "/",
    description: "Homepage and storefront promotional campaign blocks.",
    order: 120
  },
  {
    id: "section-visibility-page",
    label: "Section Visibility",
    anchor: "cms-page-section-visibility",
    routePath: "/",
    previewHref: "/",
    description: "Show or hide homepage sections by route and schedule.",
    order: 130
  }
] as const;

export type CmsWorkspacePageId = (typeof CMS_WORKSPACE_PAGES)[number]["id"];

export function getCmsWorkspacePageDefinition(id: string) {
  return CMS_WORKSPACE_PAGES.find((page) => page.id === id) ?? null;
}
