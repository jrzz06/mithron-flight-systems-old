"use client";

import { HomeProductShelfCard } from "@/components/product/home-product-shelf-card";
import { cn } from "@/lib/utils";
import type { ProductShellItem } from "@/services/catalog";
import homeStyles from "@/sections/home/home-shelf-shared.module.css";
import styles from "./product-discovery.module.css";

export function DiscoveryProductGrid({
  products,
  className
}: {
  products: ProductShellItem[];
  className?: string;
}) {
  if (!products.length) return null;

  return (
    <div
      className={cn(homeStyles.productShelfSection, styles.shelfToneWorld, className)}
      data-shelf-tone="world"
    >
      <div className={styles.discoveryProductGrid}>
        {products.map((product, index) => (
          <div key={product.slug} className={styles.discoveryProductGridItem}>
            <HomeProductShelfCard
              product={product}
              priority={index === 0}
              imageSizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 22vw"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
