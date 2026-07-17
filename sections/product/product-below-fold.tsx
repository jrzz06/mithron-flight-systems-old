import { Suspense, type ReactNode } from "react";
import { LazyHydrate } from "@/components/ui/lazy-hydrate";
import { ProductRelatedSection } from "@/sections/product/product-related-section";
import { ProductReviewsSection } from "@/sections/product/product-reviews-section";
import type { ProductPageReview, ProductReviewSummary } from "@/lib/product-reviews/types";
import type { ProductShellItem } from "@/services/catalog";

function ProductRelatedFallback() {
  return <div className="min-h-[360px] animate-pulse bg-[#f8fafc]" aria-hidden="true" />;
}

/** Always mount reviews (no LazyHydrate) so #reviews / Customer Reviews never disappear. */
export function ProductReviewsLazySection({
  productName,
  productSlug,
  reviews,
  summary
}: {
  productName: string;
  productSlug: string;
  reviews: ProductPageReview[];
  summary: ProductReviewSummary;
}) {
  return (
    <ProductReviewsSection
      productName={productName}
      productSlug={productSlug}
      reviews={reviews}
      summary={summary}
    />
  );
}

function ProductRelatedLazySection({
  relatedProducts,
  similarProducts,
  accessoryProducts
}: {
  relatedProducts?: ProductShellItem[];
  similarProducts?: ProductShellItem[];
  accessoryProducts?: ProductShellItem[];
}) {
  const similar = similarProducts ?? relatedProducts ?? [];
  const accessories = accessoryProducts ?? [];
  if (!similar.length && !accessories.length) return null;

  return (
    <LazyHydrate fallback={<ProductRelatedFallback />} minHeight={360}>
      <ProductRelatedSection
        relatedProducts={relatedProducts}
        similarProducts={similarProducts}
        accessoryProducts={accessoryProducts}
      />
    </LazyHydrate>
  );
}

function ProductBelowFoldSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ProductRelatedFallback />}>{children}</Suspense>;
}
