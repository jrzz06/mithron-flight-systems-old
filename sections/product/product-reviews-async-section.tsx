import { getProductPageReviews } from "@/services/product-reviews";
import { ProductReviewsLazySection } from "@/sections/product/product-below-fold";
import { getCurrentAuthContext } from "@/services/auth";
import { getCustomerProductReviewContext } from "@/services/customer-product-reviews";
import type { CustomerProductReviewContext } from "@/lib/orders/review-eligibility";

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
  const [reviewPayload, auth] = await Promise.all([
    getProductPageReviews({ slug, productName, sourceCatalogId }).catch((error) => {
      console.warn("[product-reviews] failed to load reviews", error);
      return null;
    }),
    getCurrentAuthContext()
  ]);

  if (!reviewPayload) return null;

  let reviewContext: CustomerProductReviewContext | null = null;
  let isAuthenticated = false;

  if (auth.userId) {
    isAuthenticated = true;
    try {
      reviewContext = await getCustomerProductReviewContext(auth.userId, slug);
    } catch (error) {
      console.warn("[product-reviews] failed to load review context", error);
      reviewContext = {
        ownReviews: [],
        writableOrders: [],
        blockedReason: "not_purchased"
      };
    }
  }

  return (
    <ProductReviewsLazySection
      productName={productName}
      productSlug={slug}
      reviews={reviewPayload.reviews}
      summary={reviewPayload.summary}
      isAuthenticated={isAuthenticated}
      reviewContext={reviewContext}
    />
  );
}
