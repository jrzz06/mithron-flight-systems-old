import { CmsVisualWorkspaceLoader } from "@/components/admin/cms-visual-workspace-loader";
import { CmsHomeDashboard } from "@/components/admin/cms-home-dashboard-loader";
import { CmsWorkspaceNav } from "@/components/admin/cms-workspace-nav-loader";
import { AdminCmsLiveSync } from "@/components/admin/admin-cms-live-sync";
import type { CmsRestoreRevision, CmsWorkspaceMedia, CmsWorkspacePage, CmsWorkspaceSection } from "@/features/admin/cms/cms-visual-workspace";
import { CMS_WORKSPACE_ANCHORS, CMS_WORKSPACE_PAGES } from "@/config/cms-workspace";
import { ModulePanel, OperationalFeedback } from "@/components/admin/module-panel";
import { getCmsAdvancedWorkspaceSnapshot, getCmsCoreSnapshot, getCmsMarketingWorkspaceSnapshot } from "@/services/admin";
import { getHomepageCmsContent, getHomepageCmsDraftPreviewContent } from "@/services/homepage-cms";
import { getHomepageProducts } from "@/services/catalog";
import { getHomepageCmsV2Content, getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { buildCmsDashboardSections } from "@/lib/cms/build-dashboard-sections";
import { homepageSectionRegistry } from "@/config/homepage-section-registry";
import { connectivityMessage } from "@/lib/platform/copy";

export const dynamic = "force-dynamic";

type AdminRow = Record<string, unknown>;

type ContentRevisionRow = {
  entity_table?: string;
  entity_id?: string;
  revision?: number;
  snapshot?: Record<string, unknown>;
  change_summary?: string | null;
  created_at?: string | null;
};

type CmsPageProps = {
  searchParams?: Promise<{
    cms_status?: string;
    cms_table?: string;
    cms_message?: string;
    section?: string;
    page?: string;
    view?: string;
  }>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown) {
  return isPlainRecord(value) ? value : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function tableRows(snapshot: { data: { tables: Array<{ table: string; rows: AdminRow[] }> } }, table: string) {
  return snapshot.data.tables.find((entry) => entry.table === table)?.rows ?? [];
}

function mergeCmsSnapshots(
  ...snapshots: Array<Awaited<ReturnType<typeof getCmsCoreSnapshot>> | Awaited<ReturnType<typeof getCmsAdvancedWorkspaceSnapshot>> | null>
) {
  const active = snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
  if (!active.length) {
    return {
      status: "BLOCKED" as const,
      source: "blocked" as const,
      blockedReason: "CMS snapshot unavailable.",
      data: { tables: [] as Array<{ table: string; rows: AdminRow[] }> }
    };
  }

  const [first, ...rest] = active;
  return rest.reduce((merged, snapshot) => ({
    status: merged.status === "LIVE" && snapshot.status === "LIVE" ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: merged.blockedReason ?? snapshot.blockedReason,
    data: { tables: [...merged.data.tables, ...snapshot.data.tables] }
  }), first);
}

function statusLabel(row: AdminRow) {
  const value = text(row.status) || text(row.workflow_status) || (row.published_at ? "published" : "draft");
  return value.toLowerCase() === "published" ? "Published" : "Draft";
}

function formatDate(value: unknown) {
  const source = text(value);
  if (!source) return "Not updated yet";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function publicMediaUrl(asset: AdminRow) {
  return text(asset.public_url) || text(asset.url) || text(asset.src);
}

function mediaLabel(asset: AdminRow, index: number) {
  return text(asset.caption) || text(asset.alt_text) || text(asset.alt) || `Media item ${index + 1}`;
}

function heroImageSrc(hero: AdminRow) {
  return text(record(hero.image).src);
}

function heroImageAlt(hero: AdminRow) {
  return text(record(hero.image).alt, text(hero.title, "Homepage hero"));
}

function mediaSrc(row: AdminRow, key: string) {
  return text(record(row[key]).src);
}

function mediaAlt(row: AdminRow, key: string, fallback: string) {
  return text(record(row[key]).alt, fallback);
}

function jsonField(value: unknown) {
  if (isPlainRecord(value)) return JSON.stringify(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "{}";
}

function stringListField(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).join(", ") : text(value);
}

function routePreviewHref(routeKey: string) {
  return routeKey ? `/${routeKey}` : "/products";
}

function fields(overrides: Partial<CmsWorkspaceSection["fields"]> = {}): CmsWorkspaceSection["fields"] {
  return {
    title: "",
    subtitle: "",
    body: "",
    ctaLabel: "",
    href: "",
    imageSrc: "",
    imageAlt: "",
    label: "",
    role: "",
    rating: "",
    componentKey: "",
    sectionKey: "",
    payloadJson: "{}",
    footerColumnId: "",
    footerColumnTitle: "",
    footerLinkId: "",
    footerLinkLabel: "",
    footerLinkHref: "",
    navPlacement: "primary",
    titleColor: "",
    subtitleColor: "",
    productSlug: "",
    posterSrc: "",
    posterAlt: "",
    videoSrc: "",
    videoAlt: "",
    theme: "light",
    compositionMode: "full-bleed",
    compositionTextTone: "dark",
    compositionMediaPosition: "center",
    compositionMobileMediaPosition: "center",
    compositionProductDominance: "flagship",
    routeKey: "",
    routePath: "",
    showcaseImageSrc: "",
    showcaseImageAlt: "",
    showcaseImageJson: "{}",
    personality: "",
    featuredProductSlugs: "",
    ecosystemPayloadJson: "{}",
    mediaAssetId: "",
    startsAt: "",
    endsAt: "",
    ...overrides
  };
}

function updatedAt(row: AdminRow) {
  return formatDate(row.updated_at ?? row.created_at ?? row.published_at);
}

function sectionBase(row: AdminRow, fallbackEntityId: string) {
  return {
    entityId: text(row.id) || text(row.section_key) || fallbackEntityId,
    status: statusLabel(row),
    updatedAt: updatedAt(row),
    sortOrder: integer(row.sort_order),
    isVisible: row.is_visible !== false
  };
}

function latestRestoreRevision(rows: ContentRevisionRow[]): CmsRestoreRevision {
  const sorted = [...rows]
    .filter((row) => text(row.entity_table) && text(row.entity_id) && integer(row.revision) > 0)
    .sort((left, right) => {
      const timeDelta = text(right.created_at).localeCompare(text(left.created_at));
      if (timeDelta !== 0) return timeDelta;
      return integer(right.revision) - integer(left.revision);
    });

  const latest = sorted[0];
  if (!latest) return null;

  const table = text(latest.entity_table);
  const entityId = text(latest.entity_id);

  return {
    table,
    entityId,
    revision: integer(latest.revision),
    snapshotJson: JSON.stringify(record(latest.snapshot)),
    label: text(latest.change_summary, `${table} revision ${integer(latest.revision)}`)
  };
}

export default async function CmsPage({ searchParams }: CmsPageProps) {
  const params = await searchParams;
  const activePageId = params?.page && params.page !== "homepage" ? params.page : "homepage";
  const [coreSnapshot, marketingSnapshot, advancedSnapshot, homepageContent, homepageContentDraft, homepageV2Published, homepageV2Draft, catalogProducts, policy] = await Promise.all([
    getCmsCoreSnapshot(),
    getCmsMarketingWorkspaceSnapshot(),
    getCmsAdvancedWorkspaceSnapshot(),
    getHomepageCmsContent(),
    getHomepageCmsDraftPreviewContent(),
    getHomepageCmsV2Content(),
    getHomepageCmsV2DraftPreviewContent(),
    getHomepageProducts(),
    getAdminSettingsPolicy()
  ]);
  const snapshot = mergeCmsSnapshots(coreSnapshot, marketingSnapshot, advancedSnapshot);

  const heroRows = tableRows(snapshot, "hero_banners");
  const footerColumns = tableRows(snapshot, "footer_columns");
  const footerLinks = tableRows(snapshot, "footer_links");
  const navigationRows = tableRows(snapshot, "site_navigation");
  const categoryRows = tableRows(snapshot, "category_metadata");
  const faqRows = tableRows(snapshot, "faqs");
  const campaignRows = tableRows(snapshot, "promotional_campaigns");
  const visibilityRows = tableRows(snapshot, "section_visibility");
  const mediaRows = tableRows(snapshot, "media_assets").filter((asset) => publicMediaUrl(asset));
  const revisionRows = tableRows(snapshot, "content_revisions") as ContentRevisionRow[];

  const heroSections: CmsWorkspaceSection[] = heroRows.map((hero, index) => {
    const heroBase = sectionBase(hero, `homepage-hero-${index + 1}`);
    const entityId = text(hero.id, heroBase.entityId);
    const composition = record(hero.composition);
    return {
      id: `hero-banner-${entityId}`,
      pageId: "homepage",
      anchor: index === 0 ? CMS_WORKSPACE_ANCHORS.hero : `cms-section-hero-${entityId}`,
      routePath: "/",
      previewHref: "/",
      kind: "hero",
      title: "Hero Banner",
      description: "Edit the main homepage image, message, and primary button.",
      table: "hero_banners",
      ...heroBase,
      entityId,
      fields: fields({
        title: text(hero.title),
        subtitle: text(hero.subtitle),
        ctaLabel: text(hero.cta_label),
        href: text(hero.href),
        imageSrc: heroImageSrc(hero),
        imageAlt: heroImageAlt(hero),
        productSlug: text(hero.product_slug),
        posterSrc: mediaSrc(hero, "poster"),
        posterAlt: mediaAlt(hero, "poster", text(hero.title, "Hero poster")),
        videoSrc: mediaSrc(hero, "video"),
        videoAlt: mediaAlt(hero, "video", text(hero.title, "Hero video")),
        theme: text(hero.theme, "light"),
        compositionMode: text(composition.mode, "full-bleed"),
        compositionTextTone: text(composition.textTone, "dark"),
        compositionMediaPosition: text(composition.mediaPosition, "center"),
        compositionMobileMediaPosition: text(composition.mobileMediaPosition, "center"),
        compositionProductDominance: text(composition.productDominance, "flagship"),
        titleColor: text(hero.title_color),
        subtitleColor: text(hero.subtitle_color),
        startsAt: text(hero.starts_at),
        endsAt: text(hero.ends_at)
      })
    };
  });

  const categorySections: CmsWorkspaceSection[] = categoryRows.map((category, index) => {
    const routeKey = text(category.route_key, `category-${index + 1}`);
    const showcase = record(category.showcase_image);
    const categoryBase = sectionBase(category, routeKey);
    return {
      id: `category-banner-${routeKey}`,
      pageId: "category-banners",
      anchor: `cms-section-category-${routeKey}`,
      routePath: routePreviewHref(routeKey),
      previewHref: routePreviewHref(routeKey),
      kind: "category",
      title: text(category.title, `Category ${index + 1}`),
      description: `Control the category banner and route metadata for ${routePreviewHref(routeKey)}.`,
      table: "category_metadata",
      ...categoryBase,
      entityId: routeKey,
      stateEntityId: routeKey,
      fields: fields({
        routeKey,
        title: text(category.title),
        subtitle: text(category.subtitle),
        imageSrc: text(category.hero_image),
        imageAlt: text(category.title, routeKey),
        showcaseImageSrc: text(showcase.src),
        showcaseImageAlt: text(showcase.alt, text(category.title, routeKey)),
        showcaseImageJson: jsonField(category.showcase_image),
        personality: text(category.personality),
        featuredProductSlugs: stringListField(category.featured_product_slugs),
        ecosystemPayloadJson: jsonField(category.ecosystem_payload)
      })
    };
  });

  const footerSections: CmsWorkspaceSection[] = footerColumns.map((footerColumn, index) => {
    const footerLink = footerLinks.find((link) => text(link.column_id) === text(footerColumn.id)) ?? footerLinks[index] ?? {};
    const footerBase = sectionBase(footerColumn, `footer-column-${index + 1}`);
    const entityId = text(footerColumn.id, footerBase.entityId);
    return {
      id: `footer-${entityId}`,
      pageId: "footer-page",
      anchor: `cms-section-footer-${entityId}`,
      routePath: "/",
      previewHref: "/",
      kind: "footer",
      title: text(footerColumn.title, `Footer CTA ${index + 1}`),
      description: "Edit a real footer group and its visible footer link.",
      table: "footer_columns",
      ...footerBase,
      entityId,
      relatedPublishTargets: text(footerLink.id)
        ? [
            {
              table: "footer_links",
              entityId: text(footerLink.id),
              changeSummary: `Publish footer link ${text(footerLink.id)}`
            }
          ]
        : [],
      fields: fields({
        title: text(footerColumn.title),
        label: text(footerColumn.title),
        body: text(footerLink.label),
        href: text(footerLink.href),
        footerColumnId: entityId,
        footerColumnTitle: text(footerColumn.title),
        footerLinkId: text(footerLink.id),
        footerLinkLabel: text(footerLink.label),
        footerLinkHref: text(footerLink.href)
      })
    };
  });

  const navigationSections: CmsWorkspaceSection[] = navigationRows.map((navItem, index) => {
    const navBase = sectionBase(navItem, `navigation-${index + 1}`);
    const entityId = text(navItem.id, navBase.entityId);
    return {
      id: `navigation-${entityId}`,
      pageId: "navigation-page",
      anchor: `cms-section-navigation-${entityId}`,
      routePath: "/",
      previewHref: text(navItem.href, "/"),
      kind: "navigation",
      title: text(navItem.label, `Navigation item ${index + 1}`),
      description: "Edit a real navigation item without route metadata.",
      table: "site_navigation",
      ...navBase,
      entityId,
      fields: fields({
        title: text(navItem.label),
        label: text(navItem.label),
        href: text(navItem.href),
        navPlacement: text(navItem.placement, "primary")
      })
    };
  });

  const faqSections: CmsWorkspaceSection[] = faqRows.map((faq, index) => {
    const faqBase = sectionBase(faq, `faq-${index + 1}`);
    const entityId = text(faq.id, faqBase.entityId);
    return {
      id: `faq-${entityId}`,
      pageId: "faqs-page",
      anchor: `cms-section-faq-${entityId}`,
      routePath: "/contact",
      previewHref: "/contact",
      kind: "faq",
      title: text(faq.question, `FAQ ${index + 1}`),
      description: "Edit support FAQ entries shown on product and contact surfaces.",
      table: "faqs",
      ...faqBase,
      entityId,
      fields: fields({
        title: text(faq.question),
        body: text(faq.answer),
        sectionKey: text(faq.scope, "global"),
        productSlug: text(faq.product_slug)
      })
    };
  });

  const campaignSections: CmsWorkspaceSection[] = campaignRows.map((campaign, index) => {
    const campaignBase = sectionBase(campaign, `campaign-${index + 1}`);
    const entityId = text(campaign.id, campaignBase.entityId);
    return {
      id: `campaign-${entityId}`,
      pageId: "campaigns-page",
      anchor: `cms-section-campaign-${entityId}`,
      routePath: "/",
      previewHref: "/",
      kind: "campaign",
      title: text(campaign.label, `Campaign ${index + 1}`),
      description: "Edit promotional campaign copy, CTA, and scheduling.",
      table: "promotional_campaigns",
      ...campaignBase,
      entityId,
      fields: fields({
        label: text(campaign.label),
        title: text(campaign.headline),
        body: text(campaign.body),
        ctaLabel: text(campaign.cta_label),
        href: text(campaign.href),
        mediaAssetId: text(campaign.media_asset_id),
        startsAt: text(campaign.starts_at),
        endsAt: text(campaign.ends_at)
      })
    };
  });

  const visibilitySections: CmsWorkspaceSection[] = visibilityRows.map((row, index) => {
    const sectionKey = text(row.section_key, `section-${index + 1}`);
    const routePath = text(row.route_path, "/");
    const visibilityBase = sectionBase(row, `${sectionKey}:${routePath}`);
    return {
      id: `visibility-${sectionKey}-${routePath.replaceAll("/", "-")}`,
      pageId: "section-visibility-page",
      anchor: `cms-section-visibility-${sectionKey}`,
      routePath,
      previewHref: routePath,
      kind: "section_visibility",
      title: `${sectionKey} visibility`,
      description: `Control whether ${sectionKey} is visible on ${routePath}.`,
      table: "section_visibility",
      ...visibilityBase,
      entityId: `${sectionKey}:${routePath}`,
      stateEntityId: `${sectionKey}:${routePath}`,
      fields: fields({
        sectionKey,
        routePath,
        startsAt: text(row.starts_at),
        endsAt: text(row.ends_at)
      })
    };
  });

  const sections: CmsWorkspaceSection[] = [
    ...heroSections,
    ...categorySections,
    ...faqSections,
    ...campaignSections,
    ...visibilitySections,
    ...footerSections,
    ...navigationSections
  ];
  const homepageSectionIds = [...heroSections, ...footerSections].map((section) => section.id);
  const footerSectionIds = footerSections.map((section) => section.id);
  const sectionIdsByPage: Record<string, string[]> = {
    homepage: homepageSectionIds,
    "category-banners": categorySections.map((section) => section.id),
    "navigation-page": navigationSections.map((section) => section.id),
    "footer-page": footerSectionIds,
    "faqs-page": faqSections.map((section) => section.id),
    "campaigns-page": campaignSections.map((section) => section.id),
    "section-visibility-page": visibilitySections.map((section) => section.id)
  };
  const workspacePages: CmsWorkspacePage[] = CMS_WORKSPACE_PAGES
    .map((page) => ({ ...page, sectionIds: sectionIdsByPage[page.id] ?? [] }))
    .filter((page) => page.sectionIds.length > 0);
  const hero = heroRows[0] ?? {};

  const media: CmsWorkspaceMedia[] = mediaRows.map((asset, index) => ({
    id: text(asset.id, `media-${index}`),
    label: mediaLabel(asset, index),
    src: publicMediaUrl(asset),
    alt: text(asset.alt_text) || text(asset.alt) || mediaLabel(asset, index),
    width: integer(asset.width ?? record(asset.metadata).width),
    height: integer(asset.height ?? record(asset.metadata).height),
    usage: text(asset.usage_scope) || text(asset.caption)
  }));

  const metrics = [
    { label: "Homepage sections", value: String(homepageSectionRegistry.length) },
    { label: "Hero slides", value: String(heroSections.length) },
    { label: "Advanced pages", value: String(workspacePages.length) },
    { label: "State", value: statusLabel(hero) }
  ];

  const dashboardSections = buildCmsDashboardSections({
    homepageContent,
    homepageContentDraft,
    homepageV2Published,
    homepageV2Draft,
    heroRows,
    visibilityRows,
    catalogProducts
  });

  return (
    <div id={CMS_WORKSPACE_ANCHORS.root} data-admin-cms-route className="grid gap-4">
      <AdminCmsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ModulePanel
        eyebrow="Website"
        title="Homepage Builder"
        description={connectivityMessage(snapshot.blockedReason) || "Edit homepage sections in visitor order."}
        status={snapshot.blockedReason && snapshot.status === "LIVE" ? "PARTIAL" : snapshot.status}
        metrics={metrics}
      />

      <div id="cms-status" data-cms-operational-feedback>
        <OperationalFeedback
          idle="Save, publish, and homepage copy updates appear here."
        />
      </div>

      {activePageId !== "homepage" ? (
        <CmsWorkspaceNav
          pageId={activePageId}
          sectionId={params?.section}
          workspacePages={workspacePages}
          workspaceSections={sections}
        />
      ) : null}

      {activePageId === "homepage" ? <CmsHomeDashboard sections={dashboardSections} /> : null}

      {activePageId !== "homepage" ? (
        <CmsVisualWorkspaceLoader
          pages={workspacePages.filter((page) => page.id === activePageId)}
          sections={sections}
          media={media}
          restoreRevision={latestRestoreRevision(revisionRows)}
          initialSectionId={params?.section}
        />
      ) : null}
    </div>
  );
}
