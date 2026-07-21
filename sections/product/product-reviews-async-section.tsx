import { getProductPageReviews } from "@/services/product-reviews";
import { ProductReviewsLazySection } from "@/sections/product/product-below-fold";

type ProductReviewsAsyncSectionProps = {
  slug: string;
  productName: string;
  sourceCatalogId?: string | null;
};

export async function ProductReviewsAsyncSection({
  slug,
  productName,
  sourceCatalogId
}: ProductReviewsAsyncSectionProps) {
  let reviewPayload: Awaited<ReturnType<typeof getProductPageReviews>> | null = null;
  try {
    reviewPayload = await getProductPageReviews({ slug, productName, sourceCatalogId });
  } catch (error) {
    console.warn("[product-reviews] failed to load reviews", error);
    return null;
  }

  if (!reviewPayload) return null;

  return (
    <ProductReviewsLazySection
      productName={productName}
      productSlug={slug}
      reviews={reviewPayload.reviews}
      summary={reviewPayload.summary}
    />
  );
}
