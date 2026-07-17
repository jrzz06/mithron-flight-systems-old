import { LazyHydrate } from "@/components/ui/lazy-hydrate";
import { getYouMayAlsoLikeShellItems } from "@/services/catalog";
import { ProductYouMayAlsoLikeSection } from "@/sections/product/product-you-may-also-like-section";

function ProductRelatedFallback() {
  return (
    <div className="min-h-[360px] animate-pulse bg-[var(--ds-skeleton)]" aria-hidden="true" />
  );
}

export async function ProductRelatedAsyncSection({ slug }: { slug: string }) {
  let products = [] as Awaited<ReturnType<typeof getYouMayAlsoLikeShellItems>>;

  try {
    products = await getYouMayAlsoLikeShellItems(slug, 4);
  } catch (error) {
    console.warn("[product-related] failed to load recommendations", error);
    return null;
  }

  if (!products.length) return null;

  return (
    <LazyHydrate fallback={<ProductRelatedFallback />} minHeight={360}>
      <ProductYouMayAlsoLikeSection products={products} />
    </LazyHydrate>
  );
}
