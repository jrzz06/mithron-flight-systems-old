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
  const reviewPayload = await getProductPageReviews({ slug, productName, sourceCatalogId });

  return (
    <ProductReviewsLazySection
      productName={productName}
      productSlug={slug}
      reviews={reviewPayload.reviews}
      summary={reviewPayload.summary}
    />
  );
}
