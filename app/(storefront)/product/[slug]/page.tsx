import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Product } from "@/config/types";
import { getProductDescriptionHtml } from "@/lib/product-detail-content";
import { buildProductMediaPlan } from "@/lib/product-detail-experience";
import { getProductStaticSlugs, loadProductForPage } from "@/services/catalog";
import { CatalogDataErrorPanel } from "@/components/layout/catalog-integrity-notice";
import { ProductContactDefaults } from "@/sections/product/product-contact-defaults";
import type { ProductConfiguratorModel } from "@/sections/product/product-configurator";
import { ProductDetailHeader } from "@/sections/product/product-detail-header";
import { ProductContinueExploringSection } from "@/sections/product/product-continue-exploring-section";
import { RecordProductView } from "@/components/product/record-product-view";
import { ProductRecentlyViewedSection } from "@/sections/product/product-recently-viewed-section";
import { ProductRelatedAsyncSection } from "@/sections/product/product-related-async-section";
import { ProductReviewsAsyncSection } from "@/sections/product/product-reviews-async-section";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import { ProductImmersiveGallery } from "@/sections/product/showcase/product-immersive-gallery";
import { ProductRichDescriptionSection } from "@/sections/product/showcase/product-rich-description";
import { ProductShowcaseHero } from "@/sections/product/showcase/product-showcase-hero";
import { ProductSpecsSection } from "@/sections/product/showcase/product-specs-section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildProductStructuredData } from "@/lib/structured-data";
import { buildProductMetadata } from "@/services/product-metadata";
import showcaseStyles from "@/sections/product/showcase/product-showcase.module.css";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = true;
export const revalidate = 60;

function buildProductConfiguratorModel(product: Product): ProductConfiguratorModel {
  return {
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    category: product.category,
    badge: product.badge,
    badgeStyle: product.badgeStyle,
    price: product.price,
    compareAt: product.compareAt,
    chargeTax: product.chargeTax,
    taxGroup: product.taxGroup,
    taxRate: product.taxRate,
    taxIncluded: product.taxIncluded,
    image: product.image,
    variants: product.variants,
    bundles: product.bundles
  };
}

export async function generateStaticParams() {
  const slugs = await getProductStaticSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const pageLoad = await loadProductForPage(slug);
  return buildProductMetadata(pageLoad.status === "ready" ? pageLoad.product : null);
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const pageLoad = await loadProductForPage(slug);
  if (pageLoad.status === "not_found") notFound();
  if (pageLoad.status === "error") {
    return <CatalogDataErrorPanel error={pageLoad.error} />;
  }

  const product = pageLoad.product;
  const structuredData = buildProductStructuredData(product);
  const mediaPlan = buildProductMediaPlan(product);
  const descriptionHtml = getProductDescriptionHtml(product);

  return (
    <article className={`product-detail-page ${showcaseStyles.page}`}>
      <JsonLd data={structuredData} />
      <ProductDetailHeader product={product} />
      <ProductShowcaseHero
        gallery={(
          <SoftErrorBoundary label="Product gallery">
            <ProductImmersiveGallery
              mediaPlan={mediaPlan}
              showBadge={Boolean(product.badge?.trim())}
              badgeLabel={product.badge?.trim() || undefined}
            />
          </SoftErrorBoundary>
        )}
        purchase={(
          <ProductContactDefaults
            product={buildProductConfiguratorModel(product)}
            summary={{
              name: product.name,
              price: product.price,
              compareAt: product.compareAt
            }}
          />
        )}
      />
      <ProductRichDescriptionSection html={descriptionHtml} />
      <ProductSpecsSection product={product} />
      <RecordProductView
        slug={product.slug}
        name={product.name}
        price={product.price}
        category={product.category}
        tagline={product.tagline}
        image={product.image}
        badge={product.badge}
      />
      <Suspense fallback={<div className="min-h-[320px] animate-pulse bg-[var(--ds-skeleton)]" aria-hidden="true" />}>
        <ProductReviewsAsyncSection
          slug={product.slug}
          productName={product.name}
          sourceCatalogId={product.sourceCatalogId}
        />
      </Suspense>
      <Suspense fallback={<div className="min-h-[360px] animate-pulse bg-[var(--ds-skeleton)]" aria-hidden="true" />}>
        <ProductRelatedAsyncSection slug={product.slug} />
      </Suspense>
      <ProductRecentlyViewedSection currentSlug={product.slug} />
      <ProductContinueExploringSection />
    </article>
  );
}
