"use client";

import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import type { ProductShelfCardItem } from "@/lib/product-shelf-card-meta";
import { cn } from "@/lib/utils";

const CATALOG_IMAGE_SIZES = "(min-width:1024px) 25vw, 50vw";

/** Same DJI shelf card + 2/4 catalog grid — no separate catalog card. */
export function DiscoveryProductGrid({
  products,
  className
}: {
  products: ProductShelfCardItem[];
  className?: string;
}) {
  if (!products.length) return null;

  return (
    <div className={cn("mt-6 w-full min-w-0", className)} data-catalog-shelf-cards="">
      <div className="catalog-product-grid w-full min-w-0 justify-items-stretch">
        {products.map((product, index) => (
          <HomeProductShelfCard
            key={product.slug}
            product={product}
            layout="dji"
            presentation="catalog"
            priority={index < 4}
            imageSizes={CATALOG_IMAGE_SIZES}
          />
        ))}
      </div>
    </div>
  );
}
