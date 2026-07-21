import Link from "next/link";
import { ChevronRight, Home } from "@/components/icons/storefront-icons";
import type { Product } from "@/config/types";
import { StoreBackButton } from "@/components/navigation/store-back-button";
import {
  getCatalogCategoryByLabel,
  getCatalogCategoryDefinition,
  isCatalogCategorySlug,
  interestSlugToCategorySlug
} from "@/lib/catalog-categories";
import { cn } from "@/lib/utils";
import styles from "./product-detail.module.css";

/**
 * Resolves the canonical category page href and display label for the breadcrumb.
 *
 * Strategy (in order):
 *  1. Map the product's category label directly to a /category/<slug> definition.
 *  2. Fall back to mapping the first interest slug → canonical category definition.
 *  3. Last resort: link back to the full product listing.
 */
function resolveCategoryBreadcrumb(product: Product): { href: string; label: string } {
  // 1. Try matching by category label (e.g. "Accessories" → /category/accessories)
  const byLabel = getCatalogCategoryByLabel(product.category);
  if (byLabel) {
    return { href: byLabel.href, label: byLabel.label };
  }

  // 2. Try mapping through the first interest slug
  const interest = product.interests[0];
  if (interest) {
    const categorySlug = interestSlugToCategorySlug[interest];
    if (categorySlug && isCatalogCategorySlug(categorySlug)) {
      const def = getCatalogCategoryDefinition(categorySlug);
      return { href: def.href, label: def.label };
    }
  }

  // 3. Fall back to the products listing page
  return { href: "/products", label: product.category };
}


export function ProductDetailHeader({ product }: { product: Product }) {
  const categoryBreadcrumb = resolveCategoryBreadcrumb(product);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <StoreBackButton embedded fallbackHref={categoryBreadcrumb.href} />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/" className={cn(styles.breadcrumbLink, "inline-flex items-center gap-1")}>
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Home</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <Link href="/products" className={styles.breadcrumbLink}>
            Products
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <Link
            href={categoryBreadcrumb.href}
            className={cn(styles.breadcrumbLink, "max-w-[12rem] truncate sm:max-w-none")}
          >
            {categoryBreadcrumb.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          <span aria-current="page" className={styles.breadcrumbCurrent}>
            {product.name}
          </span>
        </nav>
      </div>
    </header>
  );
}
