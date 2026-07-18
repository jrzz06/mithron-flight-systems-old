import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  CATALOG_CATEGORY_SLUGS,
  getCatalogCategoryDefinition,
  isCatalogCategorySlug
} from "@/lib/catalog-categories";
import { getProductsForCategorySlug } from "@/services/catalog";
import { getCategoryCmsMetadata } from "@/services/cms";
import { CatalogPage } from "@/sections/catalog/catalog-page";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return CATALOG_CATEGORY_SLUGS.map((slug) => ({ slug }));
}

// Catalog filters are isolated in a Suspense boundary inside CatalogPage.
export const revalidate = 60;

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isCatalogCategorySlug(slug)) {
    return { title: "Category not found" };
  }

  const definition = getCatalogCategoryDefinition(slug);
  return {
    title: `${definition.label} - Mithron`
  };
}

function CatalogPageFallback() {
  return <div className="min-h-[60vh] animate-pulse bg-[#eef0f3]" aria-hidden="true" />;
}

async function CategoryPageContent({ slug }: { slug: string }) {
  if (!isCatalogCategorySlug(slug)) notFound();

  const definition = getCatalogCategoryDefinition(slug);
  const [catalog, products] = await Promise.all([
    getCategoryCmsMetadata(definition.cmsRouteKey),
    getProductsForCategorySlug(slug)
  ]);

  return (
    <CatalogPage
      title={catalog.title || definition.label}
      subtitle={catalog.subtitle}
      products={products}
      heroImage={catalog.heroImage}
      showcaseImage={catalog.showcaseImage}
      listingMode="category"
      showBack
    />
  );
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;

  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <CategoryPageContent slug={slug} />
    </Suspense>
  );
}
