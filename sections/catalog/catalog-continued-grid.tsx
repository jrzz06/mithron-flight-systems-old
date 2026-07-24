"use client";

import { useEffect, useMemo, useState } from "react";
import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import { Button } from "@/components/ui/button";
import type { Product } from "@/config/types";
import { dedupeProductsBySlug } from "@/lib/catalog-shelf-layout";
import { cn } from "@/lib/utils";

export const INITIAL_BATCH = 8;
export const BATCH_SIZE = 8;

const CATALOG_IMAGE_SIZES = "(min-width:1024px) 25vw, 50vw";

type CatalogContinuedGridProps = {
  products: Product[];
  className?: string;
  rowsClassName?: string;
  presentation?: "standard" | "showroom";
};

/** Strict 2-col below lg, 4-col at lg+ — never 1 or 3. */
export function resolveColumnCount(width: number) {
  if (width < 1024) return 2;
  return 4;
}

export function getVisibleProducts(products: Product[], visibleCount: number) {
  return products.slice(0, Math.max(0, visibleCount));
}

export function CatalogContinuedGrid({
  products,
  className,
  rowsClassName,
  presentation: _presentation = "standard"
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
    <div className={className} data-catalog-continued-grid data-catalog-shelf-cards="">
      <div className={cn("catalog-continued-grid__rows w-full justify-items-stretch", rowsClassName)}>
        {visibleProducts.map((product, index) => (
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
