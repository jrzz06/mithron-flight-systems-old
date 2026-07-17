import { CmsStorefrontSurface } from "@/components/home/cms-storefront-surface";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import { HomeLandingComposite } from "@/sections/home/home-landing-composite";
import { listFeaturedHomeReviews, toProductPageReview, type CustomerProductReview } from "@/services/customer-product-reviews";
import { listPublishedBlogPosts, type BlogPost } from "@/services/blog-posts";
import { listPublishedPressCoverage, type PressCoverageItem } from "@/services/press-coverage";
import { getPublicCmsSnapshot, type PublicCmsSnapshot } from "@/services/cms";
import { getHomepageProducts, getPublishedProductsBySlugs } from "@/services/catalog";
import { getHomepageCmsContent, getHomepageCmsDraftPreviewContent } from "@/services/homepage-cms";
import { getHomepageCmsV2Content, getHomepageCmsV2DraftPreviewContent } from "@/services/homepage-cms-v2";
import type { ProductPageReview } from "@/lib/product-reviews/types";

type HomeBelowHeroProps = {
  cmsDraftPreview?: boolean;
  cms?: PublicCmsSnapshot;
  products?: Product[];
  homepageCms?: HomepageCmsContent;
  homepageCmsV2?: HomepageCmsV2Content;
  relatedArticles?: BlogPost[];
  pressCoverage?: PressCoverageItem[];
  customerReviews?: CustomerProductReview[];
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
  pressCoverage: pressCoverageOverride,
  customerReviews: customerReviewsOverride
}: HomeBelowHeroProps) {
  const [cms, shelfProducts, homepageCms, homepageCmsV2, relatedArticles, pressCoverage, reviewCandidates] =
    await Promise.all([
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
        : listPublishedPressCoverage({ limit: 3 }).catch(() => [] as PressCoverageItem[]),
      customerReviewsOverride
        ? Promise.resolve(customerReviewsOverride)
        : listFeaturedHomeReviews({ limit: 6 }).catch(() => [] as CustomerProductReview[])
    ]);

  const reviewSlugs = [...new Set(reviewCandidates.map((review) => review.productSlug).filter(Boolean))];
  const reviewProducts = reviewSlugs.length
    ? await getPublishedProductsBySlugs(reviewSlugs).catch(() => [] as Product[])
    : [];
  const products = mergeProductsBySlug(shelfProducts, reviewProducts);
  const reviewProductSlugs = new Set(reviewProducts.map((product) => product.slug));
  const knownSlugs = new Set(products.filter((product) => product.image?.src).map((product) => product.slug));
  const maxReviews = Math.max(1, Math.min(6, homepageCmsV2.reviews.maxCount || 3));
  const customerReviews = (
    customerReviewsOverride
      ? reviewCandidates
      : reviewCandidates.filter((review) => knownSlugs.has(review.productSlug) || reviewProductSlugs.has(review.productSlug))
  ).slice(0, maxReviews);

  const homepageReviews: ProductPageReview[] = customerReviews
    .map((review) => {
      const productName = products.find((p) => p.slug === review.productSlug)?.name;
      return toProductPageReview(review, productName);
    })
    .filter((review) => Boolean(review.productSlug));

  return (
    <>
      <CmsStorefrontSurface
        promotionalCampaigns={cms.promotionalCampaigns}
        trustCards={cms.trustCards}
      />
      <HomeLandingComposite
        products={products}
        productReviews={homepageReviews}
        footer={cms.footer}
        homepageCms={homepageCms}
        homepageCmsV2={homepageCmsV2}
        relatedArticles={relatedArticles}
        pressCoverage={pressCoverage}
      />
    </>
  );
}
