"use client";

import { ProductHoverCard, type ProductHoverCardProduct } from "@/components/cards/product-hover-card";
import { cn } from "@/lib/utils";

/** Same card + grid contract as category catalog listings — no extra panel wrappers. */
export function DiscoveryProductGrid({
  products,
  className
}: {
  products: ProductHoverCardProduct[];
  className?: string;
}) {
  if (!products.length) return null;

  return (
    <div className={cn("catalog-page-shell mt-6 min-w-0", className)}>
      <div className="catalog-product-grid min-w-0">
        {products.map((product, index) => (
          <ProductHoverCard
            key={product.slug}
            product={product}
            variant="catalog"
            showCategory
            cta="catalog"
            presentation="standard"
            priority={index < 4}
          />
        ))}
      </div>
    </div>
  );
}
