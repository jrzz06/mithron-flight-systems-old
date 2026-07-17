import { notFound } from "next/navigation";
import { CmsSectionEditor } from "@/components/admin/cms-section-editor-loader";
import { AdminCmsLiveSync } from "@/components/admin/admin-cms-live-sync";
import { getHomepageSectionDefinition, shelfKeyFromSectionId, type HomepageSectionId } from "@/config/homepage-section-registry";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";
import { getCmsCoreSnapshot } from "@/services/admin";
import { getHomepageProducts } from "@/services/catalog";
import { getHomepageCmsDraftPreviewContent } from "@/services/homepage-cms";
import { getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";
import {
  CMS_SHELF_KEY_TO_ID,
  resolveEffectiveShelfSlugs,
  resolveEffectiveShelfSlotItemsPadded,
  shelfCategoryHintForShelfKey
} from "@/lib/home/shelf-product-resolution";
import { mapProductsToSlotItems } from "@/lib/admin/shelf-slot-product";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { listFeaturedHomeReviews, toProductPageReview } from "@/services/customer-product-reviews";

export const dynamic = "force-dynamic";

type SectionPageProps = {
  params: Promise<{ sectionId: string }>;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}


export default async function CmsSectionPage({ params }: SectionPageProps) {
  const { sectionId } = await params;
  const definition = getHomepageSectionDefinition(sectionId);
  if (!definition) notFound();

  const [homepageContent, homepageV2, snapshot, products, policy, customerReviews] = await Promise.all([
    getHomepageCmsDraftPreviewContent(),
    getHomepageCmsV2DraftPreviewContent(),
    getCmsCoreSnapshot(),
    getHomepageProducts(),
    getAdminSettingsPolicy(),
    listFeaturedHomeReviews({ limit: 6 })
  ]);

  const heroRows = snapshot?.data.tables.find((table) => table.table === "hero_banners")?.rows ?? [];
  const heroBanners = heroRows.map((row, index) => {
    const image = row.image as Record<string, unknown> | undefined;
    const mobileOverride = image?.mobileOverride as Record<string, unknown> | undefined;
    return {
      id: text(row.id, `hero-${index}`),
      title: text(row.title),
      subtitle: text(row.subtitle),
      ctaLabel: text(row.cta_label),
      href: text(row.href),
      imageSrc: text(image?.src),
      imageAlt: text(image?.alt, text(row.title, "Hero")),
      imageMobileSrc: text(mobileOverride?.src),
      imageMobileAlt: text(mobileOverride?.alt),
      status: text(row.status, "draft"),
      sortOrder: Number(row.sort_order) || index,
      isVisible: row.is_visible !== false
    };
  });

  const mediaRows = snapshot?.data.tables.find((table) => table.table === "media_assets")?.rows ?? [];
  const mediaAssets = mediaRows.map((asset, index) => ({
    id: text(asset.id, `media-${index}`),
    label: text(asset.caption) || text(asset.alt_text) || `Media ${index + 1}`,
    src: text(asset.public_url) || text(asset.url),
    alt: text(asset.alt_text),
    width: Number(asset.width) || undefined,
    height: Number(asset.height) || undefined,
    usage: text(asset.usage_scope)
  }));

  const shelfKey = shelfKeyFromSectionId(sectionId as HomepageSectionId);
  const effectiveProductSlugs = shelfKey
    ? resolveEffectiveShelfSlugs(
        CMS_SHELF_KEY_TO_ID[shelfKey],
        homepageContent.shelves[shelfKey],
        products,
        SHELF_PRODUCT_CARD_SLOTS
      )
    : undefined;
  const effectiveSlotProducts = shelfKey
    ? resolveEffectiveShelfSlotItemsPadded(
        CMS_SHELF_KEY_TO_ID[shelfKey],
        homepageContent.shelves[shelfKey],
        products,
        SHELF_PRODUCT_CARD_SLOTS
      )
    : undefined;
  const browseCatalog = mapProductsToSlotItems(products);
  const productReviews = customerReviews.map((review) => {
    const productName = products.find((product) => product.slug === review.productSlug)?.name;
    return toProductPageReview(review, productName);
  });
  const syncError = !products.length
    ? "Homepage catalog could not be loaded. Product shelves and previews require published catalog products."
    : null;

  return (
    <div data-admin-cms-section-route>
      <AdminCmsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <CmsSectionEditor
        sectionId={sectionId as HomepageSectionId}
        homepageContent={homepageContent}
        homepageV2={homepageV2}
        heroBanners={heroBanners}
        mediaAssets={mediaAssets}
        products={products}
        effectiveProductSlugs={effectiveProductSlugs}
        effectiveSlotProducts={effectiveSlotProducts}
        browseCatalog={browseCatalog}
        shelfCategoryHint={shelfKey ? shelfCategoryHintForShelfKey(shelfKey) : undefined}
        productReviews={productReviews}
        syncError={syncError}
      />
    </div>
  );
}
