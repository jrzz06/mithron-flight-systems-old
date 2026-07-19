import { CmsStorefrontSurface } from "@/components/home/cms-storefront-surface";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import { HomeLandingComposite } from "@/sections/home/home-landing-composite";
import { listPublishedBlogPosts, type BlogPost } from "@/services/blog-posts";
import { listPublishedPressCoverage, type PressCoverageItem } from "@/services/press-coverage";
import { getPublicCmsSnapshot, type PublicCmsSnapshot } from "@/services/cms";
import { getHomepageProducts, getPublishedProductsBySlugs } from "@/services/catalog";
import { getHomepageCmsContent, getHomepageCmsDraftPreviewContent } from "@/services/homepage-cms";
import { getHomepageCmsV2Content, getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";

type HomeBelowHeroProps = {
  cmsDraftPreview?: boolean;
  cms?: PublicCmsSnapshot;
  products?: Product[];
  homepageCms?: HomepageCmsContent;
  homepageCmsV2?: HomepageCmsV2Content;
  relatedArticles?: BlogPost[];
  pressCoverage?: PressCoverageItem[];
};

function mergeProductsBySlug(primary: Product[], extra: Product[]) {
  const bySlug = new Map<string, Product>();
  for (const product of primary) bySlug.set(product.slug, product);
  for (const product of extra) {
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
  }
  return [...bySlug.values()];
}

export async function HomeBelowHero({
  cmsDraftPreview = false,
  cms: cmsOverride,
  products: productsOverride,
  homepageCms: homepageCmsOverride,
  homepageCmsV2: homepageCmsV2Override,
  relatedArticles: relatedArticlesOverride,
  pressCoverage: pressCoverageOverride
}: HomeBelowHeroProps) {
  const [cms, shelfProducts, homepageCms, homepageCmsV2, relatedArticles, pressCoverage] = await Promise.all([
    cmsOverride ? Promise.resolve(cmsOverride) : getPublicCmsSnapshot(),
    productsOverride ? Promise.resolve(productsOverride) : getHomepageProducts(),
    homepageCmsOverride
      ? Promise.resolve(homepageCmsOverride)
      : cmsDraftPreview
        ? getHomepageCmsDraftPreviewContent()
        : getHomepageCmsContent(),
    homepageCmsV2Override
      ? Promise.resolve(homepageCmsV2Override)
      : cmsDraftPreview
        ? getHomepageCmsV2DraftPreviewContent()
        : getHomepageCmsV2Content(),
    relatedArticlesOverride
      ? Promise.resolve(relatedArticlesOverride)
      : listPublishedBlogPosts({ limit: 3 }).catch(() => [] as BlogPost[]),
    pressCoverageOverride
      ? Promise.resolve(pressCoverageOverride)
      : listPublishedPressCoverage({ limit: 3 }).catch(() => [] as PressCoverageItem[])
  ]);

  const testimonialSlugs = [
    ...new Set(
      (homepageCmsV2.testimonialCards ?? [])
        .map((card) => card.productSlug)
        .filter((slug): slug is string => Boolean(slug?.trim()))
    )
  ];
  const testimonialProducts = testimonialSlugs.length
    ? await getPublishedProductsBySlugs(testimonialSlugs).catch(() => [] as Product[])
    : [];
  const products = mergeProductsBySlug(shelfProducts, testimonialProducts);

  return (
    <>
      <CmsStorefrontSurface
        promotionalCampaigns={cms.promotionalCampaigns}
        trustCards={cms.trustCards}
      />
      <HomeLandingComposite
        products={products}
        footer={cms.footer}
        homepageCms={homepageCms}
        homepageCmsV2={homepageCmsV2}
        relatedArticles={relatedArticles}
        pressCoverage={pressCoverage}
      />
    </>
  );
}
