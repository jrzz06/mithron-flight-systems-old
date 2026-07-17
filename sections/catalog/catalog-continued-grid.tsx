"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductHoverCard } from "@/components/cards/product-hover-card";
import { Button } from "@/components/ui/button";
import type { Product } from "@/config/types";
import { dedupeProductsBySlug } from "@/lib/catalog-shelf-layout";
import { cn } from "@/lib/utils";

export const INITIAL_BATCH = 8;
export const BATCH_SIZE = 8;

type CatalogContinuedGridProps = {
  products: Product[];
  className?: string;
  rowsClassName?: string;
  presentation?: "standard" | "showroom";
};

export function resolveColumnCount(width: number) {
  if (width < 768) return 2;
  if (width < 1024) return 3;
  return 4;
}

export function getVisibleProducts(products: Product[], visibleCount: number) {
  return products.slice(0, Math.max(0, visibleCount));
}

export function CatalogContinuedGrid({
  products,
  className,
  rowsClassName,
  presentation = "standard"
}: CatalogContinuedGridProps) {
  const items = useMemo(() => dedupeProductsBySlug(products), [products]);
  const itemsSignature = useMemo(() => items.map((item) => item.slug).join("|"), [items]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);

  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
  }, [itemsSignature]);

  const visibleProducts = getVisibleProducts(items, visibleCount);
  const hasMore = visibleCount < items.length;

  if (!items.length) {
    return <div className={className} data-catalog-continued-grid />;
  }

  return (
    <div className={className} data-catalog-continued-grid>
      <div className={cn("catalog-continued-grid__rows", rowsClassName)}>
        {visibleProducts.map((product, index) => (
          <ProductHoverCard
            key={product.slug}
            product={product}
            variant="catalog"
            showCategory
            cta="catalog"
            presentation={presentation}
            priority={index < 4}
          />
        ))}
      </div>
      {hasMore ? (
        <div className="catalog-continued-grid__load-more">
          <Button
            type="button"
            variant="outline"
            data-testid="catalog-load-more"
            className="min-h-[var(--mobile-touch-min,44px)]"
            onClick={() => setVisibleCount((current) => Math.min(current + BATCH_SIZE, items.length))}
          >
            Load more products
          </Button>
        </div>
      ) : null}
    </div>
  );
}
