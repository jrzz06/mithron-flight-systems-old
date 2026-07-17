import type { ProductReviewsPayload, ReviewSort } from "@/lib/product-reviews/types";
import { getProductReviewsPayload } from "@/services/customer-product-reviews";

export async function getProductPageReviews(input: {
  slug: string;
  productName: string;
  sourceCatalogId?: string | null;
  sort?: ReviewSort;
}): Promise<ProductReviewsPayload> {
  const sort = input.sort ?? "recent";
  return getProductReviewsPayload(input.slug, input.productName, { sort });
}
